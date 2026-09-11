const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

// ========================================
// ENVIRONMENT
// ========================================

dotenv.config({
  path: path.join(__dirname, '.env')
});

dotenv.config({
  path: path.join(__dirname, '..', '.env')
});

// ========================================
// CONFIG
// ========================================

const app = express();

const PORT =
  Number(process.env.PORT) || 3000;

const ROOT =
  path.join(__dirname, '..');

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const configError =
  !SUPABASE_URL ||
  !SUPABASE_KEY ||
  /^your-project-id/i.test(
    String(SUPABASE_URL || '')
  ) ||
  /^your-project-id/i.test(
    String(SUPABASE_KEY || '')
  ) ||
  /^sb_publishable_/i.test(
    String(SUPABASE_KEY || '')
  ) ||
  /^sb_anon_/i.test(
    String(SUPABASE_KEY || '')
  );

// ========================================
// SUPABASE
// ========================================

let supabase = null;

if (!configError) {
  supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  );
}

// ========================================
// EXPRESS
// ========================================

app.use(
  cors({
    origin: true,
    credentials: true
  })
);

app.use(
  express.json({
    limit: '6mb'
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '6mb'
  })
);

// Serve frontend files.
app.use(
  express.static(ROOT, {
    extensions: ['html']
  })
);

// ========================================
// HELPERS
// ========================================

function uid() {
  return crypto.randomUUID();
}

function clean(value, max = 5000) {
  return String(value ?? '')
    .trim()
    .slice(0, max);
}

function getUserId(req) {
  return (
    req.headers['x-ddp-user-id'] ||
    req.headers['x-user-id'] ||
    'guest'
  );
}

function getUserName(req) {
  return clean(
    req.headers['x-ddp-user-name'] ||
    req.headers['x-user-name'] ||
    'Anonymous',
    100
  ) || 'Anonymous';
}

function fail(
  res,
  status,
  message
) {
  return res.status(status).json({
    error: message
  });
}

function requireSupabase(res) {
  if (configError || !supabase) {
    fail(
      res,
      500,
      'Supabase is not configured correctly on the server.'
    );

    return false;
  }

  return true;
}

function isUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value)
  );
}

// ========================================
// COMMENT MAPPER
// ========================================

function mapComment(comment) {
  if (!comment) {
    return null;
  }

  return {
    id: comment.id,
    authorId:
      comment.author_id ??
      comment.user_id ??
      '',
    name:
      comment.author_name ??
      comment.name ??
      'Anonymous',
    text:
      comment.text ??
      comment.content ??
      '',
    createdAt:
      comment.created_at,
    updatedAt:
      comment.updated_at
  };
}

// ========================================
// POST MAPPER
// ========================================

function mapPost(post, currentUserId) {
  const comments =
    Array.isArray(post.comments)
      ? post.comments
          .map(mapComment)
          .filter(Boolean)
      : [];

  const reactions =
    Array.isArray(post.reactions)
      ? post.reactions
          .map(item =>
            item.user_id
          )
          .filter(Boolean)
      : [];

  const saves =
    Array.isArray(post.saves)
      ? post.saves
          .map(item =>
            item.user_id
          )
          .filter(Boolean)
      : [];

  const votes =
    Array.isArray(post.votes)
      ? post.votes
      : [];

  const options =
    Array.isArray(post.options)
      ? post.options.map(
          option => ({
            text:
              typeof option ===
              'string'
                ? option
                : option.text ?? '',
            votes: 0
          })
        )
      : [];

  const voters = {};

  votes.forEach(vote => {
    const userId =
      vote.user_id;

    const optionIndex =
      Number(
        vote.option_index
      );

    if (!userId) {
      return;
    }

    voters[userId] =
      optionIndex;

    if (
      options[optionIndex]
    ) {
      options[optionIndex]
        .votes++;
    }
  });

  const reactionCount =
    reactions.length;

  return {
    id: post.id,

    type:
      post.type || 'post',

    topic:
      post.topic || '',

    content:
      post.content || '',

    image:
      post.image || '',

    authorId:
      post.author_id || '',

    authorName:
      post.author_name ||
      'Anonymous',

    createdAt:
      post.created_at,

    updatedAt:
      post.updated_at,

    options,

    voters,

    reactions,

    reactionCount,

    reacted:
      reactions.includes(
        currentUserId
      ),

    saved:
      saves.includes(
        currentUserId
      ),

    savedBy:
      saves,

    comments
  };
}

// ========================================
// NOTIFICATIONS
// ========================================

async function createNotification({
  userId,
  actorId,
  type,
  postId,
  commentId,
  message
}) {
  if (
    !supabase ||
    !userId ||
    userId === actorId
  ) {
    return;
  }

  const { error } =
    await supabase
      .from('notifications')
      .insert({
        id: uid(),
        user_id: userId,
        actor_id:
          actorId || null,
        type:
          type || 'activity',
        post_id:
          postId || null,
        comment_id:
          commentId || null,
        message:
          clean(message, 500),
        read: false
      });

  if (error) {
    console.error(
      'Notification error:',
      error.message
    );
  }
}

// ========================================
// GET POSTS
// ========================================

async function getPosts(
  currentUserId,
  query = ''
) {
  let request =
    supabase
      .from('posts')
      .select(`
        id,
        type,
        topic,
        content,
        image,
        author_id,
        author_name,
        created_at,
        updated_at,
        options,
        hidden,
        comments:comments(
          id,
          post_id,
          author_id,
          author_name,
          text,
          created_at,
          updated_at
        ),
        reactions:post_reactions(
          user_id
        ),
        saves:post_saves(
          user_id
        ),
        votes:poll_votes(
          user_id,
          option_index
        )
      `)
      .eq('hidden', false)
      .order(
        'created_at',
        {
          ascending: false
        }
      );

  const q =
    clean(query, 100);

  if (q) {
    const escaped =
      q
        .replace(/[%_]/g, char =>
          `\\${char}`
        )
        .replace(/,/g, ' ');

    request =
      request.or(
        `topic.ilike.%${escaped}%,content.ilike.%${escaped}%,author_name.ilike.%${escaped}%`
      );
  }

  const {
    data,
    error
  } = await request;

  if (error) {
    throw error;
  }

  return (
    Array.isArray(data)
      ? data
      : []
  ).map(post =>
    mapPost(
      post,
      currentUserId
    )
  );
}

// ========================================
// HEALTH
// ========================================

app.get(
  '/api/health',
  (req, res) => {
    res.json({
      ok: !configError,
      service: 'DDP backend',
      database:
        !configError
          ? 'configured'
          : 'not configured'
    });
  }
);

// ========================================
// GET POSTS
// ========================================

app.get(
  '/api/posts',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const posts =
        await getPosts(
          getUserId(req),
          req.query.q
        );

      res.json({
        posts
      });
    } catch (error) {
      console.error(
        'GET /api/posts:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to load posts.'
      );
    }
  }
);

// ========================================
// GET SINGLE POST
// ========================================

app.get(
  '/api/posts/:postId',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const {
        data,
        error
      } =
        await supabase
          .from('posts')
          .select(`
            id,
            type,
            topic,
            content,
            image,
            author_id,
            author_name,
            created_at,
            updated_at,
            options,
            hidden,
            comments:comments(
              id,
              post_id,
              author_id,
              author_name,
              text,
              created_at,
              updated_at
            ),
            reactions:post_reactions(
              user_id
            ),
            saves:post_saves(
              user_id
            ),
            votes:poll_votes(
              user_id,
              option_index
            )
          `)
          .eq(
            'id',
            req.params.postId
          )
          .eq('hidden', false)
          .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return fail(
          res,
          404,
          'Post not found.'
        );
      }

      res.json({
        post: mapPost(
          data,
          getUserId(req)
        )
      });
    } catch (error) {
      console.error(
        'GET single post:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to load post.'
      );
    }
  }
);

// ========================================
// CREATE POST
// ========================================

app.post(
  '/api/posts',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const userId =
        getUserId(req);

      const userName =
        getUserName(req);

      const type =
        req.body.type === 'poll'
          ? 'poll'
          : 'post';

      const topic =
        clean(
          req.body.topic,
          200
        );

      const content =
        clean(
          req.body.content,
          5000
        );

      const image =
        type === 'post'
          ? clean(
              req.body.image,
              4000000
            )
          : '';

      if (
        !topic &&
        !content &&
        !image
      ) {
        return fail(
          res,
          400,
          'Post cannot be empty.'
        );
      }

      let options = [];

      if (type === 'poll') {
        if (
          !Array.isArray(
            req.body.options
          )
        ) {
          return fail(
            res,
            400,
            'Poll options are required.'
          );
        }

        options =
          req.body.options
            .map(option =>
              clean(option, 100)
            )
            .filter(Boolean);

        if (
          options.length < 2 ||
          options.length > 4
        ) {
          return fail(
            res,
            400,
            'A poll must have 2 to 4 options.'
          );
        }

        const unique =
          new Set(
            options.map(option =>
              option.toLowerCase()
            )
          );

        if (
          unique.size !==
          options.length
        ) {
          return fail(
            res,
            400,
            'Poll options must be different.'
          );
        }
      }

      const row = {
        id: uid(),
        type,
        topic,
        content:
          type === 'post'
            ? content
            : '',
        image,
        author_id:
          userId,
        author_name:
          userName,
        options:
          type === 'poll'
            ? options
            : [],
        hidden: false
      };

      const {
        data,
        error
      } =
        await supabase
          .from('posts')
          .insert(row)
          .select(`
            id,
            type,
            topic,
            content,
            image,
            author_id,
            author_name,
            created_at,
            updated_at,
            options,
            hidden
          `)
          .single();

      if (error) {
        throw error;
      }

      res.status(201).json({
        post: mapPost(
          {
            ...data,
            comments: [],
            reactions: [],
            saves: [],
            votes: []
          },
          userId
        )
      });
    } catch (error) {
      console.error(
        'POST /api/posts:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to create post.'
      );
    }
  }
);

// ========================================
// UPDATE POST
// ========================================

app.put(
  '/api/posts/:postId',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const userId =
        getUserId(req);

      const {
        data: existing,
        error: findError
      } =
        await supabase
          .from('posts')
          .select(`
            id,
            type,
            topic,
            content,
            image,
            author_id,
            author_name,
            created_at,
            updated_at,
            options,
            hidden
          `)
          .eq(
            'id',
            req.params.postId
          )
          .maybeSingle();

      if (findError) {
        throw findError;
      }

      if (!existing) {
        return fail(
          res,
          404,
          'Post not found.'
        );
      }

      if (
        existing.author_id !==
        userId
      ) {
        return fail(
          res,
          403,
          'You can only edit your own post.'
        );
      }

      const update = {};

      if (
        req.body.topic !==
        undefined
      ) {
        update.topic =
          clean(
            req.body.topic,
            200
          );
      }

      if (
        req.body.content !==
        undefined
      ) {
        update.content =
          clean(
            req.body.content,
            5000
          );
      }

      if (
        existing.type ===
          'poll' &&
        Array.isArray(
          req.body.options
        )
      ) {
        const {
          data: voteData,
          error: voteError
        } =
          await supabase
            .from('poll_votes')
            .select('id')
            .eq(
              'post_id',
              req.params.postId
            )
            .limit(1);

        if (voteError) {
          throw voteError;
        }

        if (
          Array.isArray(
            voteData
          ) &&
          voteData.length
        ) {
          return fail(
            res,
            400,
            'A poll cannot be changed after someone votes.'
          );
        }

        const options =
          req.body.options
            .map(option =>
              clean(option, 100)
            )
            .filter(Boolean);

        if (
          options.length < 2 ||
          options.length > 4
        ) {
          return fail(
            res,
            400,
            'A poll must have 2 to 4 options.'
          );
        }

        if (
          new Set(
            options.map(option =>
              option.toLowerCase()
            )
          ).size !==
          options.length
        ) {
          return fail(
            res,
            400,
            'Poll options must be different.'
          );
        }

        update.options =
          options;
      }

      const {
        data,
        error
      } =
        await supabase
          .from('posts')
          .update(update)
          .eq(
            'id',
            req.params.postId
          )
          .select(`
            id,
            type,
            topic,
            content,
            image,
            author_id,
            author_name,
            created_at,
            updated_at,
            options,
            hidden
          `)
          .single();

      if (error) {
        throw error;
      }

      res.json({
        post: mapPost(
          {
            ...data,
            comments: [],
            reactions: [],
            saves: [],
            votes: []
          },
          userId
        )
      });
    } catch (error) {
      console.error(
        'PUT post:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to update post.'
      );
    }
  }
);

// ========================================
// DELETE POST
// ========================================

app.delete(
  '/api/posts/:postId',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const userId =
        getUserId(req);

      const {
        data: post,
        error: findError
      } =
        await supabase
          .from('posts')
          .select(
            'id, author_id'
          )
          .eq(
            'id',
            req.params.postId
          )
          .maybeSingle();

      if (findError) {
        throw findError;
      }

      if (!post) {
        return fail(
          res,
          404,
          'Post not found.'
        );
      }

      if (
        post.author_id !==
        userId
      ) {
        return fail(
          res,
          403,
          'You can only delete your own post.'
        );
      }

      const {
        error
      } =
        await supabase
          .from('posts')
          .delete()
          .eq(
            'id',
            req.params.postId
          );

      if (error) {
        throw error;
      }

      res.json({
        success: true
      });
    } catch (error) {
      console.error(
        'DELETE post:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to delete post.'
      );
    }
  }
);

// ========================================
// GET COMMENTS
// ========================================

app.get(
  '/api/posts/:postId/comments',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const {
        data,
        error
      } =
        await supabase
          .from('comments')
          .select(`
            id,
            post_id,
            author_id,
            author_name,
            text,
            created_at,
            updated_at
          `)
          .eq(
            'post_id',
            req.params.postId
          )
          .order(
            'created_at',
            {
              ascending: true
            }
          );

      if (error) {
        throw error;
      }

      res.json({
        comments:
          (data || [])
            .map(mapComment)
      });
    } catch (error) {
      console.error(
        'GET comments:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to load comments.'
      );
    }
  }
);

// ========================================
// CREATE COMMENT
// ========================================

app.post(
  '/api/posts/:postId/comments',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const userId =
        getUserId(req);

      const userName =
        getUserName(req);

      const text =
        clean(
          req.body.text,
          300
        );

      if (!text) {
        return fail(
          res,
          400,
          'Comment cannot be empty.'
        );
      }

      const {
        data: post,
        error: postError
      } =
        await supabase
          .from('posts')
          .select(
            'id, author_id, topic'
          )
          .eq(
            'id',
            req.params.postId
          )
          .maybeSingle();

      if (postError) {
        throw postError;
      }

      if (!post) {
        return fail(
          res,
          404,
          'Post not found.'
        );
      }

      const {
        data,
        error
      } =
        await supabase
          .from('comments')
          .insert({
            id: uid(),
            post_id:
              req.params.postId,
            author_id:
              userId,
            author_name:
              userName,
            text
          })
          .select(`
            id,
            post_id,
            author_id,
            author_name,
            text,
            created_at,
            updated_at
          `)
          .single();

      if (error) {
        throw error;
      }

      await createNotification({
        userId:
          post.author_id,
        actorId:
          userId,
        type:
          'comment',
        postId:
          req.params.postId,
        commentId:
          data.id,
        message:
          `${userName} commented on your post.`
      });

      res.status(201).json({
        comment:
          mapComment(data)
      });
    } catch (error) {
      console.error(
        'POST comment:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to create comment.'
      );
    }
  }
);

// ========================================
// FIND COMMENT
// ========================================

async function findComment(
  commentId
) {
  const {
    data,
    error
  } =
    await supabase
      .from('comments')
      .select(`
        id,
        post_id,
        author_id,
        author_name,
        text,
        created_at,
        updated_at
      `)
      .eq(
        'id',
        commentId
      )
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

// ========================================
// UPDATE COMMENT
// ========================================

async function updateCommentHandler(
  req,
  res
) {
  if (
    !requireSupabase(res)
  ) {
    return;
  }

  try {
    const userId =
      getUserId(req);

    const comment =
      await findComment(
        req.params.commentId
      );

    if (!comment) {
      return fail(
        res,
        404,
        'Comment not found.'
      );
    }

    if (
      req.params.postId &&
      String(
        comment.post_id
      ) !==
        String(
          req.params.postId
        )
    ) {
      return fail(
        res,
        404,
        'Comment not found.'
      );
    }

    if (
      comment.author_id !==
      userId
    ) {
      return fail(
        res,
        403,
        'You can only edit your own comment.'
      );
    }

    const text =
      clean(
        req.body.text,
        300
      );

    if (!text) {
      return fail(
        res,
        400,
        'Comment cannot be empty.'
      );
    }

    const {
      data,
      error
    } =
      await supabase
        .from('comments')
        .update({
          text
        })
        .eq(
          'id',
          req.params.commentId
        )
        .select(`
          id,
          post_id,
          author_id,
          author_name,
          text,
          created_at,
          updated_at
        `)
        .single();

    if (error) {
      throw error;
    }

    res.json({
      comment:
        mapComment(data)
    });
  } catch (error) {
    console.error(
      'UPDATE comment:',
      error
    );

    fail(
      res,
      500,
      error.message ||
        'Unable to update comment.'
    );
  }
}

// ========================================
// DELETE COMMENT
// ========================================

async function deleteCommentHandler(
  req,
  res
) {
  if (
    !requireSupabase(res)
  ) {
    return;
  }

  try {
    const userId =
      getUserId(req);

    const comment =
      await findComment(
        req.params.commentId
      );

    if (!comment) {
      return fail(
        res,
        404,
        'Comment not found.'
      );
    }

    if (
      req.params.postId &&
      String(
        comment.post_id
      ) !==
        String(
          req.params.postId
        )
    ) {
      return fail(
        res,
        404,
        'Comment not found.'
      );
    }

    if (
      comment.author_id !==
      userId
    ) {
      return fail(
        res,
        403,
        'You can only delete your own comment.'
      );
    }

    const {
      error
    } =
      await supabase
        .from('comments')
        .delete()
        .eq(
          'id',
          req.params.commentId
        );

    if (error) {
      throw error;
    }

    res.json({
      success: true
    });
  } catch (error) {
    console.error(
      'DELETE comment:',
      error
    );

    fail(
      res,
      500,
      error.message ||
        'Unable to delete comment.'
    );
  }
}

// ========================================
// COMMENT ROUTES
// ========================================

// New routes used by app.js.
app.put(
  '/api/posts/:postId/comments/:commentId',
  updateCommentHandler
);

app.delete(
  '/api/posts/:postId/comments/:commentId',
  deleteCommentHandler
);

// Legacy routes kept for compatibility.
app.put(
  '/api/comments/:commentId',
  updateCommentHandler
);

app.delete(
  '/api/comments/:commentId',
  deleteCommentHandler
);

// ========================================
// TOGGLE RELATION
// ========================================

async function toggleRelation({
  table,
  postId,
  userId
}) {
  const {
    data: existing,
    error: findError
  } =
    await supabase
      .from(table)
      .select('id')
      .eq(
        'post_id',
        postId
      )
      .eq(
        'user_id',
        userId
      )
      .maybeSingle();

  if (findError) {
    throw findError;
  }

  if (existing) {
    const {
      error
    } =
      await supabase
        .from(table)
        .delete()
        .eq(
          'id',
          existing.id
        );

    if (error) {
      throw error;
    }

    return false;
  }

  const {
    error
  } =
    await supabase
      .from(table)
      .insert({
        id: uid(),
        post_id:
          postId,
        user_id:
          userId
      });

  if (error) {
    throw error;
  }

  return true;
}

// ========================================
// REACTION
// ========================================

app.post(
  '/api/posts/:postId/react',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const userId =
        getUserId(req);

      const reacted =
        await toggleRelation({
          table:
            'post_reactions',
          postId:
            req.params.postId,
          userId
        });

      res.json({
        reacted
      });
    } catch (error) {
      console.error(
        'React:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to react to post.'
      );
    }
  }
);

// ========================================
// SAVE
// ========================================

app.post(
  '/api/posts/:postId/save',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const userId =
        getUserId(req);

      const saved =
        await toggleRelation({
          table:
            'post_saves',
          postId:
            req.params.postId,
          userId
        });

      res.json({
        saved
      });
    } catch (error) {
      console.error(
        'Save:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to save post.'
      );
    }
  }
);

// ========================================
// POLL VOTE
// ========================================

app.post(
  '/api/posts/:postId/vote',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const userId =
        getUserId(req);

      const optionIndex =
        Number(
          req.body.option
        );

      if (
        !Number.isInteger(
          optionIndex
        ) ||
        optionIndex < 0 ||
        optionIndex > 3
      ) {
        return fail(
          res,
          400,
          'Invalid poll option.'
        );
      }

      const {
        data: post,
        error: postError
      } =
        await supabase
          .from('posts')
          .select(
            'id, type, options, author_id'
          )
          .eq(
            'id',
            req.params.postId
          )
          .maybeSingle();

      if (postError) {
        throw postError;
      }

      if (!post) {
        return fail(
          res,
          404,
          'Post not found.'
        );
      }

      if (
        post.type !== 'poll'
      ) {
        return fail(
          res,
          400,
          'This post is not a poll.'
        );
      }

      const options =
        Array.isArray(
          post.options
        )
          ? post.options
          : [];

      if (
        optionIndex >=
        options.length
      ) {
        return fail(
          res,
          400,
          'Invalid poll option.'
        );
      }

      const {
        data: existing,
        error: existingError
      } =
        await supabase
          .from('poll_votes')
          .select('id')
          .eq(
            'post_id',
            req.params.postId
          )
          .eq(
            'user_id',
            userId
          )
          .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existing) {
        return fail(
          res,
          400,
          'You have already voted on this poll.'
        );
      }

      const {
        error
      } =
        await supabase
          .from('poll_votes')
          .insert({
            id: uid(),
            post_id:
              req.params.postId,
            user_id:
              userId,
            option_index:
              optionIndex
          });

      if (error) {
        throw error;
      }

      res.json({
        voted: true,
        option:
          optionIndex
      });
    } catch (error) {
      console.error(
        'Vote:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to vote.'
      );
    }
  }
);

// ========================================
// HIDE POST
// ========================================

app.post(
  '/api/posts/:postId/hide',
  async (req, res) => {
    // Hide is intentionally local to
    // the current user's browser.
    res.json({
      hidden: true
    });
  }
);

// ========================================
// REPORT POST
// ========================================

app.post(
  '/api/posts/:postId/report',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const userId =
        getUserId(req);

      const reason =
        clean(
          req.body.reason,
          500
        );

      if (!reason) {
        return fail(
          res,
          400,
          'Report reason is required.'
        );
      }

      const {
        data: post,
        error: postError
      } =
        await supabase
          .from('posts')
          .select(
            'id, author_id'
          )
          .eq(
            'id',
            req.params.postId
          )
          .maybeSingle();

      if (postError) {
        throw postError;
      }

      if (!post) {
        return fail(
          res,
          404,
          'Post not found.'
        );
      }

      const {
        error
      } =
        await supabase
          .from('reports')
          .insert({
            id: uid(),
            post_id:
              req.params.postId,
            comment_id:
              null,
            reporter_id:
              userId,
            reason
          });

      if (error) {
        throw error;
      }

      res.json({
        reported: true
      });
    } catch (error) {
      console.error(
        'Report post:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to report post.'
      );
    }
  }
);

// ========================================
// REPORT COMMENT
// ========================================

app.post(
  '/api/posts/:postId/comments/:commentId/report',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const userId =
        getUserId(req);

      const reason =
        clean(
          req.body.reason,
          500
        );

      if (!reason) {
        return fail(
          res,
          400,
          'Report reason is required.'
        );
      }

      const comment =
        await findComment(
          req.params.commentId
        );

      if (!comment) {
        return fail(
          res,
          404,
          'Comment not found.'
        );
      }

      if (
        String(
          comment.post_id
        ) !==
        String(
          req.params.postId
        )
      ) {
        return fail(
          res,
          404,
          'Comment not found.'
        );
      }

      const {
        error
      } =
        await supabase
          .from('reports')
          .insert({
            id: uid(),
            post_id:
              req.params.postId,
            comment_id:
              req.params.commentId,
            reporter_id:
              userId,
            reason
          });

      if (error) {
        throw error;
      }

      res.json({
        reported: true
      });
    } catch (error) {
      console.error(
        'Report comment:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to report comment.'
      );
    }
  }
);

// ========================================
// NOTIFICATIONS
// ========================================

app.get(
  '/api/notifications',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const userId =
        getUserId(req);

      const {
        data,
        error
      } =
        await supabase
          .from('notifications')
          .select(`
            id,
            user_id,
            actor_id,
            type,
            post_id,
            comment_id,
            message,
            read,
            created_at
          `)
          .eq(
            'user_id',
            userId
          )
          .order(
            'created_at',
            {
              ascending: false
            }
          )
          .limit(100);

      if (error) {
        throw error;
      }

      const notifications =
        (data || []).map(
          item => ({
            id:
              item.id,

            userId:
              item.user_id,

            actorId:
              item.actor_id,

            type:
              item.type,

            postId:
              item.post_id,

            commentId:
              item.comment_id,

            message:
              item.message,

            read:
              Boolean(
                item.read
              ),

            createdAt:
              item.created_at
          })
        );

      res.json({
        notifications
      });
    } catch (error) {
      console.error(
        'Notifications:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to load notifications.'
      );
    }
  }
);

// ========================================
// MARK NOTIFICATIONS READ
// ========================================

app.post(
  '/api/notifications/read',
  async (req, res) => {
    if (
      !requireSupabase(res)
    ) {
      return;
    }

    try {
      const userId =
        getUserId(req);

      const {
        error
      } =
        await supabase
          .from('notifications')
          .update({
            read: true
          })
          .eq(
            'user_id',
            userId
          )
          .eq(
            'read',
            false
          );

      if (error) {
        throw error;
      }

      res.json({
        success: true
      });
    } catch (error) {
      console.error(
        'Read notifications:',
        error
      );

      fail(
        res,
        500,
        error.message ||
          'Unable to update notifications.'
      );
    }
  }
);

// ========================================
// UNKNOWN API ROUTE
// ========================================

app.use(
  '/api',
  (req, res) => {
    res.status(404).json({
      error:
        'API endpoint not found.'
    });
  }
);

// ========================================
// FRONTEND FALLBACK
// Express 5 syntax
// ========================================

app.get(
  '/{*splat}',
  (req, res) => {
    res.sendFile(
      path.join(
        ROOT,
        'index.html'
      )
    );
  }
);

// ========================================
// START SERVER
// ========================================

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    console.log(
      `DDP server running on http://0.0.0.0:${PORT}`
    );

    if (configError) {
      console.error(
        'WARNING: Supabase environment variables are missing or invalid.'
      );
    } else {
      console.log(
        'Supabase configuration detected.'
      );
    }
  }
);
