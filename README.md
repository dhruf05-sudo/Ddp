# Digital Debate Platform (DDP)

DDP is a plain HTML/CSS/JavaScript frontend served by an Express Node.js server. The server exposes the `/api` routes and connects to Supabase PostgreSQL.

## Architecture

```text
Phone / Browser
      |
      v
Express static server + /api
      |
      v
Supabase PostgreSQL
```

There is no login system in this build. Each browser creates a stable anonymous ID in `localStorage` and sends it to the API with `X-DDP-User-ID`. The display name remains `Guest`.

This is suitable for a school/prototype project, but the anonymous ID is not a secure authentication mechanism. A production deployment should use Supabase Auth.

## Requirements

- Node.js 22 or newer
- A Supabase project
- A Supabase server-only Secret key (`sb_secret_...`) or legacy `service_role` key

## 1. Configure Supabase

1. Open the Supabase SQL Editor.
2. Run `backend/supabase.sql` once.
3. Copy `backend/.env.example` to `backend/.env`.
4. Put your Supabase project URL and server-only Secret/service_role key in `backend/.env`.

Never use a `sb_publishable_...` or anon key as `SUPABASE_SECRET_KEY`.

## 2. Install dependencies

From the project root:

```bash
rm -rf node_modules backend/node_modules
npm install
```

The root `package.json` is the recommended setup. It installs the server dependencies once and starts the Express server that also serves the frontend.

If you prefer to install only inside `backend/`, run:

```bash
cd backend
npm install
```

## 3. Check the code

```bash
npm run check
```

## 4. Start DDP

```bash
npm start
```

Then open:

```text
http://127.0.0.1:3000
```

For another phone on the same Wi-Fi, use the computer/phone running Termux's LAN IP, for example:

```text
http://192.168.1.10:3000
```

Do not use `localhost` on the second phone because `localhost` means that phone itself.

## Termux

Inside Termux:

```bash
pkg update
pkg install nodejs
cd /path/to/project
cp backend/.env.example backend/.env
nano backend/.env
npm install
npm run check
npm start
```

Keep Termux running while the website is being used.

## Important security note

The uploaded project previously contained a `backend/.env` value labelled as a service-role key, but the value had a `sb_publishable_` prefix. That is not the server-only key required by this architecture. The fixed project does not include the old `.env` file. Create a fresh local `backend/.env` and use the server-only Secret/service_role key from Supabase.
