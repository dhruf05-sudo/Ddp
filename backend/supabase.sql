create extension if not exists pgcrypto;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('post', 'poll')),
  topic text,
  content text,
  image text,
  options jsonb,
  author_id text not null,
  author_name text not null default 'Guest',
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id text not null,
  author_name text not null default 'Guest',
  text text not null check (char_length(text) between 1 and 300),
  created_at timestamptz not null default now()
);

create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_saves (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.poll_votes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id text not null,
  option_index integer not null check (option_index between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  reporter_id text not null,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_topic_idx on public.posts(topic);
create index if not exists comments_post_id_idx on public.comments(post_id);
create index if not exists reactions_post_id_idx on public.post_reactions(post_id);
create index if not exists saves_post_id_idx on public.post_saves(post_id);
create index if not exists votes_post_id_idx on public.poll_votes(post_id);
create index if not exists reports_post_id_idx on public.reports(post_id);

alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.post_saves enable row level security;
alter table public.poll_votes enable row level security;
alter table public.reports enable row level security;

-- The Express server connects with the server-only Supabase Secret/service_role key.
-- That connection bypasses RLS, so no public INSERT/UPDATE/DELETE policies are required.
-- Do not expose the server key in frontend JavaScript, GitHub, Netlify files, or the browser.
