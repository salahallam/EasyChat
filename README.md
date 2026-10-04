# EasyChat Professional

Production-oriented Supabase + Vanilla JS starter designed for Acode.

No React. No Node. No build step.

## Main files
- `index.html`
- `style.css`
- `app.js`
- `supabase-config.js`
- `database.sql`
- `SETUP.md`
- `manifest.webmanifest`
- `sw.js`

## Backend
Supabase Auth + PostgreSQL + RLS + Storage + Realtime.

This is a serious starter, not a claim that every production concern is solved. Follow `SETUP.md` before launch.


Branding/auth update: added the supplied EasyChat logo, splash screen, dedicated sign-in/create-account flow, validation/loading states, and clearer Supabase configuration errors.


## Production deployment

This repository includes `netlify.toml`, `vercel.json`, `package.json`, `.env.example`, `_redirects`, and `PRODUCTION_DEPLOY.md`.

For production, set `EASYCHAT_SUPABASE_URL` and `EASYCHAT_SUPABASE_KEY` as deployment environment variables. The build script generates the browser configuration automatically.

The Supabase Auth Site URL and Additional Redirect URLs must match the production domain. See `PRODUCTION_DEPLOY.md`.


### Database reset note
This package contains a CLEAN database.sql. It removes the previous EasyChat public schema and the `chat-files` bucket contents before recreating the schema. Supabase Auth users are not deleted by this SQL file.


**Storage note:** Supabase blocks direct SQL deletion from `storage.objects`. The clean database script intentionally does not delete Storage files; it creates/uses the `chat-files` bucket and resets the EasyChat database tables safely.


### SQL v3
The database script includes the Supabase Storage `text`/`uuid` policy fixes and does not directly delete protected Storage tables.
