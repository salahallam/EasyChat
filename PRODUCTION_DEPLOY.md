# EasyChat — Production Deployment

This package is prepared for static production hosting on **Netlify or Vercel** with Supabase as the backend.

## 1. Supabase production settings

In Supabase Dashboard:

1. Open **Authentication → URL Configuration**.
2. Set **Site URL** to your real production URL, for example:
   `https://easychat.example.com`
3. Add these Additional Redirect URLs:
   - `https://easychat.example.com/**`
   - `http://localhost:3000/**` (development)
   - For Netlify previews, add the pattern recommended by Supabase, for example:
     `https://**--YOUR_NETLIFY_SITE_ORG.netlify.app/**`
   - For Vercel previews, add the pattern recommended by Supabase, for example:
     `https://*-YOUR_TEAM_OR_ACCOUNT.vercel.app/**`

For the final production domain, prefer the exact production URL rather than relying on a wildcard.

Official Supabase redirect documentation:
https://supabase.com/docs/guides/auth/redirect-urls

## 2. Supabase Auth providers

Enable the providers you actually want:
- Email
- Phone/SMS (only if you have configured an SMS provider)

If **Confirm email** is enabled, a new user must confirm the email before the first normal login. This is expected Supabase behavior.

Official documentation:
https://supabase.com/docs/guides/auth/general-configuration

## 3. Supabase database

Run `database.sql` in the Supabase SQL Editor on your production project.

Then verify:
- RLS is enabled.
- Realtime is enabled for the tables used by EasyChat.
- Storage bucket `chat-files` exists and is private.
- Storage policies from `database.sql` are installed.

## 4. Configure deployment secrets

The browser must receive only the public Supabase project URL and browser-safe Publishable/anon key.

Do NOT use:
- `service_role`
- `sb_secret_...`
- any other secret server key

The included build script reads:

```text
EASYCHAT_SUPABASE_URL
EASYCHAT_SUPABASE_KEY
EASYCHAT_STORAGE_BUCKET
```

and generates `supabase-config.js` during deployment.

### Netlify

1. Create a new site from this repository.
2. Go to **Site configuration → Environment variables**.
3. Add:
   - `EASYCHAT_SUPABASE_URL`
   - `EASYCHAT_SUPABASE_KEY`
   - `EASYCHAT_STORAGE_BUCKET` = `chat-files`
4. Deploy.

`netlify.toml` already contains:
- build command
- publish directory
- SPA fallback
- security headers
- long-term asset caching

Netlify environment variable documentation:
https://docs.netlify.com/build/environment-variables/overview/

### Vercel

1. Import this repository as a new project.
2. Add Environment Variables:
   - `EASYCHAT_SUPABASE_URL`
   - `EASYCHAT_SUPABASE_KEY`
   - `EASYCHAT_STORAGE_BUCKET` = `chat-files`
3. Deploy.

`vercel.json` already contains:
- build command
- SPA fallback
- security headers
- asset caching

Vercel environment variable documentation:
https://vercel.com/academy/vercel-foundations/vercel-settings

## 5. Custom domain

After the first successful deployment:

1. Add your domain in Netlify or Vercel.
2. Wait until HTTPS is active.
3. Put that exact `https://...` address into Supabase **Site URL**.
4. Keep the preview wildcard only for preview deployments.
5. Test:
   - Create account
   - Email confirmation
   - Sign in
   - Forgot password
   - Phone OTP
   - Realtime message
   - File upload/download
   - Sign out/sign in again

## 6. Important security rule

Supabase Publishable/anon keys are intended to be used by browser clients. The real protection is your database/storage **RLS policies**.

Never expose a Supabase secret/service-role key in this project.

## 7. Acode

You can still edit the project in Acode. For production deployment through Git:
- edit in Acode
- commit/push
- Netlify/Vercel builds automatically
- the build script generates `supabase-config.js`

If you simply upload the ZIP using drag-and-drop, the environment build step may not run. For production, connect the project to Git and use the included build configuration.

## 8. Before public launch

Recommended final checks:
- Configure a custom domain.
- Configure Supabase SMTP/custom email if needed.
- Configure SMS provider if phone login is enabled.
- Review all RLS policies.
- Add Terms and Privacy pages.
- Add rate limiting/abuse protection.
- Test storage quotas and file types.
- Test on mobile browsers.


### Database reset note
This package contains a CLEAN database.sql. It removes the previous EasyChat public schema and the `chat-files` bucket contents before recreating the schema. Supabase Auth users are not deleted by this SQL file.


**Storage note:** Supabase blocks direct SQL deletion from `storage.objects`. The clean database script intentionally does not delete Storage files; it creates/uses the `chat-files` bucket and resets the EasyChat database tables safely.


### SQL v3
The database script includes the Supabase Storage `text`/`uuid` policy fixes and does not directly delete protected Storage tables.
