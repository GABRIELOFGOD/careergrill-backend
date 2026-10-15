# Careergrill API

TypeScript/Express API for the Careergrill website and CMS.

## Structure

- `src/server.ts`: process entry point.
- `src/app.ts`: Express middleware, API mounting, and centralized error handling.
- `src/routes/`: endpoint paths, rate limits, and route-level authentication.
- `src/controllers/`: HTTP request validation, response formatting, and controller orchestration by feature.
- `src/services/`: isolated auth, content, settings, AI, document, storage, and email integrations.
- `src/middleware/`: session authorization and reusable asynchronous controller wrappers.
- `supabase/migrations/`: database schema, access policies, and database functions.

The frontend is a separate Next.js project; this API exposes version-independent JSON HTTP endpoints and has no frontend build dependency. Content is stored in separate `jobs`, `scholarships`, `blog_posts`, `resources`, `services`, `faqs`, and `feedback` tables. The shared API maps requests to the table associated with the content type.

## Local setup

1. Create a Supabase project and run the SQL migrations in order from `supabase/migrations/`. Migrations `0005_seed_opportunities.sql` and `0006_separate_content_tables.sql` seed the pictured jobs and scholarships, split existing content into dedicated tables, and preserve saved-item reminders. Migration `0007_content_assets.sql` adds records for inline images uploaded from the rich content editor. Migration `0004_user_roles.sql` ensures existing accounts have a role; new accounts default to `user`.
2. Create a **private** Supabase Storage bucket with the name configured by `SUPABASE_STORAGE_BUCKET` (default: `careergrill-private`).
3. Copy `.env.example` to `.env`, then set `NODE_ENV=development` for local work and configure the Supabase URL, service-role key, JWT secret, encryption key, and one-time admin bootstrap token. `NODE_ENV` is required; the API refuses to start if it is missing or invalid. Keep this file and all service credentials on the backend only.
4. Install dependencies and start the API:

   ```sh
   npm install
   npm run dev
   ```

The default API URL is `http://localhost:4000`; the frontend uses it unless `NEXT_PUBLIC_API_URL` is set. The frontend origin must match `FRONTEND_URL`.

Generate a JWT secret with `openssl rand -base64 48`; generate the 32-byte `APP_ENCRYPTION_KEY` with `openssl rand -hex 32`. Set a unique, high-entropy `ADMIN_BOOTSTRAP_TOKEN` of at least 24 characters. Set `NODE_ENV=production` for production deployments, use HTTPS, and use distinct secrets.

Open `/dashboard` in the frontend and use the first-administrator setup form with the configured bootstrap token. Bootstrap is available only while there are no administrator accounts; keep the token private and rotate/remove it after setup. Registration and Google sign-in always create `user` accounts. Only accounts whose current database role is `admin` can use the dashboard or admin API; the API checks this role for each protected request, so role changes take effect without waiting for a session to expire.

To grant an existing account administrator access, use the Supabase SQL Editor as a trusted project operator and verify the email before applying the change:

```sql
update public.users
set role = 'admin', updated_at = now()
where email = lower('admin@example.com');
```

To revoke dashboard access, change that account's role back to `user`.

## Integrations

- Admins configure AI provider credentials in the CMS Settings page. Supported providers are OpenAI, Anthropic, and Google. Credentials are encrypted at rest with AES-256-GCM using `APP_ENCRYPTION_KEY`.
- Cloudinary credentials are also entered in CMS Settings. The storage provider can be switched to Cloudinary only after all Cloudinary credentials are configured.
- Configure SMTP settings to enable verification messages and daily saved-content expiry reminders. Reminders are sent at 09:00 UTC and require verified email addresses.
- To enable Google sign-in, create a Google OAuth web client and set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALLBACK_URL`. Add the exact callback URL as an authorized redirect URI in Google Cloud Console. The `.env.example` template sets the local callback to `http://localhost:4000/api/auth/google/callback`; use the HTTPS callback URL in production. Google accounts are linked by their verified email, and the API issues the same HttpOnly JWT session cookie used for password sign-in.

## Validation

```sh
npm test
npm run build
npm audit
```

## Production notes

Deploy the API and frontend behind HTTPS, set exact frontend origins, use a managed secret store, and restrict Supabase service-role credentials to the API environment. Set up a private storage bucket and verify its lifecycle/backups. The API health check is `GET /api/health`.

The repository includes security controls and automated checks, but that is not equivalent to a penetration test of a deployed system. Before launch, test the production configuration and integrations with authorized security testing.
