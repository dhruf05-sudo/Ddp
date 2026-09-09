const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// Load backend/.env when running `node backend/server.js` and from the root.
dotenv.config({ path: path.join(__dirname, '.env') });
// Root .env is supported as a secondary option for deployments that keep one env file.
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, '..');
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
).trim();

const MAX_IMAGE_CHARS = 4_000_000;
const MAX_POST_CHARS = 10_000;
const MAX_TOPIC_CHARS = 300;
const MAX_OPTION_CHARS = 100;
const MAX_COMMENT_CHARS = 300;
const MAX_REPORT_CHARS = 500;

function configurationError() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return 'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in backend/.env.';
  }

  // sb_publishable_* and legacy anon keys are client keys and cannot bypass RLS.
  if (/^(sb_publishable_|sb_anon_)/i.test(SUPABASE_KEY)) {
    return 'The Supabase key is a publishable/anon key. Use the server-only Secret key (sb_secret_*) or legacy service_role key instead.';
  }

  return '';
}

const configError = configurationError();
let supabase = null;
if (!configError) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '6mb' }));
app.use(express.static(ROOT, { extensions: ['html'] }));

const uid = () => crypto.randomUUID();
const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const userId = req => clean(req.get('x-ddp-user-id') || 'guest', 100) || 'guest';
const fail = (res, status, message) => res.status(status).json({ error: message });
const isUUID = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function mapComment(comment) {
  return {
    id: comment.id,
    name: comment.author_name || 'Guest',
    text: comment.text,
    createdAt: comment.created_at
  };
}

function mapPost(post, currentUserId) {
  const reactions = Array.isArray(post.reactions) ? post.reactions : [];
  const saves = Array.isArray(post.saves) ? post.saves : [];
  const votes = Array.isArray(post.votes) ? post.votes : [];
  const rawOptions = Array.isArray(post.options) ? post.options : [];
  const voteCounts = rawOptions.map(() => 0);

  const voters = {};
  for (const vote of votes) {
    const optionIndex = Number(vote.option_index);
    if (Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < voteCounts.length) {
      voteCounts[optionIndex] += 1;
      voters[vote.user_id] = optionIndex;
    }
  }

  const options = rawOptions.map((option, index) => ({
    text: typeof option === 'string' ? option : clean(option?.text, MAX_OPTION_CHARS),
    votes: voteCounts[index]
  }));

  return {
    id: post.id,
    type: post.type,
    topic: post.topic || '',
    content: post.content || '',
    image: post.image || '',
    authorId: post.author_id,
    authorName: post.author_name || 'Guest',
    createdAt: post.created_at,
    updatedAt: post.updated_at,
    options,
    voters,
    reactions: reactions.map(reaction => reaction.user_id),
    reactionCount: reactions.length,
    reacted: reactions.some(reaction => reaction.user_id === currentUserId),
    saved: saves.some(save => save.user_id === currentUserId),
    savedBy: saves.map(save => save.user_id),
    comments: (Array.isArray(post.comments) ? post.comments : []).map(mapComment)
  };
}

function requireSupabase(res) {
  if (!supabase) {
    fail(res, 503, configError || 'Database is unavailable.');
    return false;
  }
  return true;
}

async function getPosts(currentUserId, search = '') {
  let query = supabase
    .from('posts')
    .select(`*, comments:comments(id,author_name,text,created_at), reactions:post_reactions(user_id), saves:post_saves(user_id), votes:poll_votes(user_id,option_index)`)
    .eq('hidden', false)
    .order('created_at', { ascending: false });

  if (search) {
    const safeSearch = clean(search, 100).replace(/[%_]/g, match => `\\${match}`).replace(/,/g, ' ');
    query = query.or(`topic.ilike.%${safeSearch}%,content.ilike.%${safeSearch}%,author_name.ilike.%${safeSearch}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(post => mapPost(post, currentUserId));
}

app.get('/api/health', (_req, res) => {
  if (configError) {
    return res.status(503).json({ ok: false, service: 'ddp-api', database: 'not-configured', error: configError });
  }
  return res.json({ ok: true, service: 'ddp-api', database: 'configured' });
});

app.get('/api/posts', async (req, res) => {
  if (!requireSupabase(res)) return;
  try {
    res.json({ posts: await getPosts(userId(req), clean(req.query.q, 100)) });
  } catch (error) {
    console.error('GET /api/posts:', error);
    fail(res, 500, 'Unable to load posts.');
  }
});

app.post('/api/posts', async (req, res) => {
  if (!requireSupabase(res)) return;

  const currentUserId = userId(req);
  const type = req.body?.type === 'poll' ? 'poll' : 'post';
  const topic = clean(req.body?.topic, MAX_TOPIC_CHARS);
  const content = clean(req.body?.content, MAX_POST_CHARS);
  const image = clean(req.body?.image, MAX_IMAGE_CHARS);
  const options = Array.isArray(req.body?.options)
    ? req.body.options.map(option => clean(option, MAX_OPTION_CHARS)).filter(Boolean)
    : [];

  if (type === 'post' && !topic && !content && !image) {
    return fail(res, 400, 'Post cannot be empty.');
  }

  if (image && !/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(image)) {
    return fail(res, 400, 'Invalid image format.');
  }

  if (image.length > MAX_IMAGE_CHARS) {
    return fail(res, 413, 'Image is too large.');
  }

  if (type === 'poll') {
    const unique = new Set(options.map(option => option.toLowerCase()));
    if (!topic || options.length < 2 || options.length > 4 || unique.size !== options.length) {
      return fail(res, 400, 'Poll needs a question and 2–4 different options.');
    }
  }

  const row = {
    id: uid(),
    type,
    topic: topic || null,
    content: type === 'post' ? content || null : null,
    image: type === 'post' ? image || null : null,
    options: type === 'poll' ? options.map(text => ({ text })) : null,
    author_id: currentUserId,
    author_name: 'Guest'
  };

  const { data, error } = await supabase.from('posts').insert(row).select('*').single();
  if (error) {
    console.error('POST /api/posts:', error);
    return fail(res, 500, 'Unable to create post.');
  }

  return res.status(201).json({
    post: mapPost({ ...data, comments: [], reactions: [], saves: [], votes: [] }, currentUserId)
  });
});

app.post('/api/posts/:postId/comments', async (req, res) => {
  if (!requireSupabase(res)) return;
  const postId = req.params.postId;
  const currentUserId = userId(req);
  const commentText = clean(req.body?.text, MAX_COMMENT_CHARS);

  if (!isUUID(postId)) return fail(res, 400, 'Invalid post ID.');
  if (!commentText) return fail(res, 400, 'Comment cannot be empty.');

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('id')
    .eq('id', postId)
    .maybeSingle();

  if (postError) return fail(res, 500, 'Unable to check post.');
  if (!post) return fail(res, 404, 'Post not found.');

  const { data, error } = await supabase
    .from('comments')
    .insert({
      id: uid(),
      post_id: postId,
      author_id: currentUserId,
      author_name: 'Guest',
      text: commentText
    })
    .select('id,author_name,text,created_at')
    .single();

  if (error) return fail(res, 500, 'Unable to add comment.');
  return res.status(201).json({ success: true, comment: mapComment(data) });
});

app.get('/api/posts/:postId/comments', async (req, res) => {
  if (!requireSupabase(res)) return;
  const postId = req.params.postId;
  if (!isUUID(postId)) return fail(res, 400, 'Invalid post ID.');

  const { data, error } = await supabase
    .from('comments')
    .select('id,author_name,text,created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });

  if (error) return fail(res, 500, 'Unable to load comments.');
  return res.json({ comments: (data || []).map(mapComment) });
});

async function toggleRelation(table, postId, currentUserId, successMessage, res) {
  const { data: post, error: postError } = await supabase.from('posts').select('id').eq('id', postId).maybeSingle();
  if (postError) return fail(res, 500, 'Unable to check post.');
  if (!post) return fail(res, 404, 'Post not found.');

  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select('user_id')
    .eq('post_id', postId)
    .eq('user_id', currentUserId)
    .maybeSingle();

  if (existingError) return fail(res, 500, successMessage);

  const result = existing
    ? await supabase.from(table).delete().eq('post_id', postId).eq('user_id', currentUserId)
    : await supabase.from(table).insert({ post_id: postId, user_id: currentUserId });

  if (result.error) return fail(res, 500, successMessage);
  return res.json({ success: true, active: !existing });
}

app.post('/api/posts/:postId/react', async (req, res) => {
  if (!requireSupabase(res)) return;
  const postId = req.params.postId;
  if (!isUUID(postId)) return fail(res, 400, 'Invalid post ID.');
  return toggleRelation('post_reactions', postId, userId(req), 'Unable to update reaction.', res);
});

app.post('/api/posts/:postId/save', async (req, res) => {
  if (!requireSupabase(res)) return;
  const postId = req.params.postId;
  if (!isUUID(postId)) return fail(res, 400, 'Invalid post ID.');
  return toggleRelation('post_saves', postId, userId(req), 'Unable to update saved post.', res);
});

app.post('/api/posts/:postId/vote', async (req, res) => {
  if (!requireSupabase(res)) return;
  const postId = req.params.postId;
  const optionIndex = Number(req.body?.option);
  const currentUserId = userId(req);

  if (!isUUID(postId)) return fail(res, 400, 'Invalid post ID.');
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex > 3) {
    return fail(res, 400, 'Invalid poll option.');
  }

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select('type,options')
    .eq('id', postId)
    .maybeSingle();

  if (postError) return fail(res, 500, 'Unable to check poll.');
  if (!post || post.type !== 'poll') return fail(res, 404, 'Poll not found.');
  if (!Array.isArray(post.options) || optionIndex >= post.options.length) return fail(res, 400, 'Invalid poll option.');

  const { data: existing, error: existingError } = await supabase
    .from('poll_votes')
    .select('option_index')
    .eq('post_id', postId)
    .eq('user_id', currentUserId)
    .maybeSingle();

  if (existingError) return fail(res, 500, 'Unable to check existing vote.');
  if (existing) return fail(res, 409, 'You already voted on this poll.');

  const { error: insertError } = await supabase.from('poll_votes').insert({
    post_id: postId,
    user_id: currentUserId,
    option_index: optionIndex
  });

  if (insertError) {
    if (insertError.code === '23505') return fail(res, 409, 'You already voted on this poll.');
    return fail(res, 500, 'Unable to save vote.');
  }

  return res.json({ success: true });
});

app.put('/api/posts/:postId', async (req, res) => {
  if (!requireSupabase(res)) return;
  const postId = req.params.postId;
  const currentUserId = userId(req);
  if (!isUUID(postId)) return fail(res, 400, 'Invalid post ID.');

  const { data: current, error: currentError } = await supabase.from('posts').select('*').eq('id', postId).maybeSingle();
  if (currentError) return fail(res, 500, 'Unable to check post.');
  if (!current) return fail(res, 404, 'Post not found.');
  if (current.author_id !== currentUserId) return fail(res, 403, 'You can only edit your own posts.');

  const topic = clean(req.body?.topic, MAX_TOPIC_CHARS);
  const updates = { topic: topic || null, updated_at: new Date().toISOString() };

  if (current.type === 'post') {
    const content = clean(req.body?.content, MAX_POST_CHARS);
    if (!topic && !content && !current.image) return fail(res, 400, 'Post cannot be empty.');
    updates.content = content || null;
  } else {
    const { count, error: countError } = await supabase
      .from('poll_votes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);

    if (countError) return fail(res, 500, 'Unable to check poll votes.');

    if (Array.isArray(req.body?.options)) {
      if (count > 0) return fail(res, 409, 'Poll options cannot be changed after voting begins.');
      const options = req.body.options.map(option => clean(option, MAX_OPTION_CHARS)).filter(Boolean);
      const unique = new Set(options.map(option => option.toLowerCase()));
      if (options.length < 2 || options.length > 4 || unique.size !== options.length) {
        return fail(res, 400, 'Poll needs 2–4 different options.');
      }
      updates.options = options.map(text => ({ text }));
    }
  }

  const { error } = await supabase.from('posts').update(updates).eq('id', postId);
  if (error) return fail(res, 500, 'Unable to edit post.');
  return res.json({ success: true });
});

app.post('/api/posts/:postId/hide', async (req, res) => {
  if (!requireSupabase(res)) return;
  const postId = req.params.postId;
  if (!isUUID(postId)) return fail(res, 400, 'Invalid post ID.');

  // Hiding is a personal action, so store it as a local client action instead of
  // removing a post for every other user. The frontend handles this locally.
  return res.json({ success: true, personal: true });
});

app.post('/api/posts/:postId/report', async (req, res) => {
  if (!requireSupabase(res)) return;
  const postId = req.params.postId;
  const reason = clean(req.body?.reason, MAX_REPORT_CHARS);
  if (!isUUID(postId)) return fail(res, 400, 'Invalid post ID.');
  if (!reason) return fail(res, 400, 'Report reason is required.');

  const { data: post, error: postError } = await supabase.from('posts').select('id').eq('id', postId).maybeSingle();
  if (postError) return fail(res, 500, 'Unable to check post.');
  if (!post) return fail(res, 404, 'Post not found.');

  const { error } = await supabase.from('reports').insert({
    post_id: postId,
    reporter_id: userId(req),
    reason
  });

  if (error) return fail(res, 500, 'Unable to submit report.');
  return res.status(201).json({ success: true });
});

app.get('/api/notifications', (_req, res) => res.json({ notifications: [] }));
app.post('/api/notifications/read', (_req, res) => res.json({ success: true }));

app.use('/api', (_req, res) => fail(res, 404, 'API route not found.'));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`DDP server running on http://0.0.0.0:${PORT}`);
  if (configError) console.error(`Configuration warning: ${configError}`);
});
