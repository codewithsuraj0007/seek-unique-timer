# Cloud Function: sendOutgoingEmail

This Firebase Cloud Function listens for new documents in `outgoingEmails` and sends an email via SMTP to the configured recipient.

Setup (Firebase Functions):

1. Install the Functions SDK and dependencies:

```bash
cd functions
npm install
```

2. Set SMTP credentials securely using `firebase functions:config:set` or environment variables:

```bash
firebase functions:config:set smtp.host="smtp.example.com" smtp.port="587" smtp.user="you@example.com" smtp.pass="yourpassword"
```

Or export env vars in your hosting environment:

```bash
export SMTP_HOST=smtp.example.com
export SMTP_PORT=587
export SMTP_USER=you@example.com
export SMTP_PASS=yourpassword
```

3. Deploy the function:

```bash
firebase deploy --only functions:sendOutgoingEmail
```

Notes:
- The function marks the document's `status` field to `sent` or `failed` after attempting to send.
- Use a secure service account / SMTP service for production (SendGrid, SES, etc.).
