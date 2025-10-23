# Cold Email Sender

A lightweight Next.js web app for sending bulk emails with optional attachments. Perfect for testing email campaigns with Mailtrap.

## Features

- **SMTP Configuration Page** (`/env`) - Configure and test SMTP credentials
- **Email Sender Page** (`/send`) - Compose and send bulk emails
- **Real-time Status Updates** - SSE streaming for live progress
- **Attachment Support** - Single file for all or per-recipient attachments
- **Session-based Storage** - SMTP credentials stored in browser session only
- **No Database** - All state is ephemeral and in-memory

## Getting Started

### 1. Setup Mailtrap Account

1. Sign up at [mailtrap.io](https://mailtrap.io)
2. Create a new inbox
3. Get your SMTP credentials from the inbox settings

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and add your Mailtrap credentials:

\`\`\`bash
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USERNAME=your_username
SMTP_PASSWORD=your_password
\`\`\`

### 3. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 4. Run Development Server

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Configure SMTP** - Go to `/env` and enter your Mailtrap credentials, then click "Test SMTP"
2. **Compose Email** - Go to `/send` and fill in sender details, subject, and message body
3. **Add Recipients** - Paste email addresses (one per line or comma-separated)
4. **Choose Attachment Mode** - None, single file for all, or per-recipient files
5. **Send** - Click "Start Sending" to begin the campaign

## Architecture

- **Frontend**: React with Next.js App Router
- **Backend**: Next.js API routes with nodemailer
- **Real-time Updates**: Server-Sent Events (SSE)
- **Storage**: Browser sessionStorage (SMTP config only)

## Security Notes

- SMTP credentials are stored in browser session only, never persisted to server
- This tool is for testing purposes only
- Mass unsolicited emails may violate laws and email service terms
- Use only with Mailtrap or similar testing services

## Deployment

For production deployment:

1. Use a persistent job queue (e.g., Bull, RabbitMQ)
2. Implement proper authentication and authorization
3. Add rate limiting and abuse prevention
4. Store SMTP credentials securely (e.g., encrypted in database)
5. Add comprehensive logging and monitoring

## License

MIT
