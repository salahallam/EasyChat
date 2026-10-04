# EasyChat Professional — Setup

## 1. Supabase
Create a Supabase project and open **SQL Editor**.

Run the entire `database.sql`.

This creates:
- profiles
- chats
- chat_members
- messages
- message_reactions
- message_reads
- contacts
- blocks
- notifications
- indexes
- RLS
- Auth profile trigger
- direct/group RPC functions
- Storage bucket `chat-files`
- Realtime publication entries

## 2. Authentication
Enable:
- Email
- Phone

For phone login, configure the SMS provider supported by your Supabase Auth setup.

For development you can disable email confirmation. For production, keep confirmation enabled and configure a real email provider.

## 3. Config
Edit `supabase-config.js`:

```js
window.EASYCHAT_SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
window.EASYCHAT_SUPABASE_KEY = "YOUR-PUBLISHABLE-KEY";
```

Only use the browser-safe Publishable/anon key.

NEVER use:
- service_role
- secret keys
- database password

## 4. Acode
Keep these files together:
- index.html
- style.css
- app.js
- supabase-config.js
- manifest.webmanifest
- sw.js

The SQL and setup docs can stay in the same project folder but are not loaded by the browser.

Open the folder using Acode preview or another HTTP-served preview. HTTPS is recommended for PWA/service-worker behavior.

## 5. Storage
The SQL creates a private `chat-files` bucket.

The current frontend uploads to:
`chat-files/<chat_id>/<user_id>/<random>-filename`

RLS checks that the authenticated user belongs to the chat.

IMPORTANT:
The current attachment preview uses a public object URL pattern. Because the bucket is private, this URL is not sufficient in a real deployment. For production, replace it with `createSignedUrl()` or an Edge Function that returns short-lived signed URLs.

## 6. Realtime
Postgres Changes:
- messages
- chats
- chat_members
- reactions
- reads
- notifications

Broadcast:
- typing indicators

Presence:
- chat presence channel is prepared in the frontend.

For high-scale production, move high-frequency events (typing/presence) fully to Broadcast/Presence and avoid Postgres writes for those events.

## 7. Features included
- Email/password auth
- Phone OTP auth
- Password reset
- Profile
- Username
- Online/last seen
- Direct chats
- Groups
- Group member list
- Text messages
- Image/file attachments
- Message replies
- Message editing
- Message deletion
- Reactions
- Read receipts
- Typing indicator
- Notifications
- Search chats
- Responsive mobile UI
- PWA manifest/service worker starter
- RLS and Storage policies

## 8. Production hardening still recommended
Before public launch:
1. Use signed URLs for private files.
2. Add MIME/type allowlist and server-side file validation.
3. Add upload quotas/rate limits.
4. Add message pagination/infinite scrolling.
5. Add robust group-admin RPCs (kick/promote/leave).
6. Add push notifications through Web Push/FCM/APNs.
7. Add abuse reporting and moderation.
8. Add account deletion/export.
9. Add server-side unread counts for large scale.
10. Use Broadcast/Presence for high-frequency realtime events.


## Authentication troubleshooting (important)

The new version separates **Sign in** and **Create account** into real forms instead of using a browser `prompt()`. It also shows a visible configuration warning if Supabase is missing.

Before testing authentication:

1. Open `supabase-config.js`.
2. Set `EASYCHAT_SUPABASE_URL` to your Supabase project URL.
3. Set `EASYCHAT_SUPABASE_KEY` to the browser-safe publishable/anon key.
4. In Supabase → Authentication → Providers, enable Email and/or Phone.
5. For email confirmation, configure the Site URL and Redirect URLs for your real domain.
6. For phone OTP, configure an SMS provider in Supabase.
7. Run `database.sql` in the Supabase SQL Editor.

### If a button appears not to respond

Open the browser console. The app now catches authentication errors and displays them in the EasyChat toast. The most common cause is an unconfigured Supabase URL/key, a disabled Auth provider, or a redirect URL that does not match the deployed domain.

### Branding

The uploaded EasyChat logo is included in:
- `assets/easychat-logo.png`
- `assets/icon-192.png`
- `assets/icon-512.png`

It is used on the splash screen, login/create-account screen, app header, favicon and PWA icon.

### Hosting

This package is static and can be deployed to Netlify, Vercel, Cloudflare Pages, GitHub Pages, or normal cPanel/static hosting. Supabase remains the backend.


### Database reset note
This package contains a CLEAN database.sql. It removes the previous EasyChat public schema and the `chat-files` bucket contents before recreating the schema. Supabase Auth users are not deleted by this SQL file.


**Storage note:** Supabase blocks direct SQL deletion from `storage.objects`. The clean database script intentionally does not delete Storage files; it creates/uses the `chat-files` bucket and resets the EasyChat database tables safely.


### SQL v3
The database script includes the Supabase Storage `text`/`uuid` policy fixes and does not directly delete protected Storage tables.
