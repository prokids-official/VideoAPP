# Supabase Custom SMTP with Resend Test Sender

This project uses Supabase Auth email for signup verification and password recovery. Supabase's built-in email service is intentionally rate-limited, so production and shared preview environments must use a Custom SMTP provider.

## Target Setup

- Provider: Resend SMTP
- Sender email: `onboarding@resend.dev`
- Sender name: `FableGlitch`
- SMTP host: `smtp.resend.com`
- SMTP port: `465`
- SMTP username: `resend`
- SMTP password: Resend API key
- Secure connection: enabled

Do not commit the Resend API key. Store it only in the Supabase dashboard SMTP password field, or in a local password manager.

## Supabase Dashboard Steps

1. Open the Supabase project dashboard.
2. Go to `Authentication` -> `Emails` -> `SMTP Settings`.
3. Enable Custom SMTP.
4. Fill the fields:
   - Sender email: `onboarding@resend.dev`
   - Sender name: `FableGlitch`
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: paste the Resend API key
   - Secure connection: on
5. Save the settings.
6. Send a password reset email from the desktop app and confirm that Supabase no longer returns `email rate limit exceeded`.

## Resend Test Sender Notes

The `onboarding@resend.dev` test sender does not require company DNS setup. It is suitable for development and smoke tests. Before wider internal rollout, replace it with a verified company domain sender after DNS records are configured in Resend.

## App Redirect Reminder

Keep Supabase Auth redirect URLs aligned with the backend:

- Site URL: `https://video-app-kappa-murex.vercel.app`
- Additional redirect URL: `https://video-app-kappa-murex.vercel.app/auth/reset-password`

The Vercel backend should also keep:

```text
AUTH_REDIRECT_BASE_URL=https://video-app-kappa-murex.vercel.app
```

Changing Supabase SMTP settings does not require a Vercel redeploy. Changing Vercel environment variables does.
