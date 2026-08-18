import { google } from "googleapis";

interface GmailSendParams {
  accessToken: string;
  refreshToken?: string | null;
  clientId: string;
  clientSecret: string;
  senderEmail: string;
  senderName?: string | null;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: {
    filename: string;
    content: Buffer;
    contentType?: string;
  }[];
}

function base64UrlEncode(input: Buffer | string) {
  const buffer = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input);

  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createMimeMessage(params: GmailSendParams) {
  const {
    senderEmail,
    senderName,
    to,
    subject,
    text,
    html,
    attachments = [],
  } = params;

  const from = senderName
    ? `${senderName} <${senderEmail}>`
    : senderEmail;

  // No attachments
  if (attachments.length === 0) {
    const headers = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset=UTF-8`,
      "",
      html || text || "",
    ];

    return headers.join("\r\n");
  }

  const boundary = `----=_Boundary_${Date.now()}`;

  const parts: string[] = [];

  parts.push(
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    "",
    html || text || ""
  );

  for (const attachment of attachments) {
    const contentType =
      attachment.contentType ||
      "application/octet-stream";

    parts.push(
      `--${boundary}`,
      `Content-Type: ${contentType}; name="${attachment.filename}"`,
      `Content-Disposition: attachment; filename="${attachment.filename}"`,
      `Content-Transfer-Encoding: base64`,
      "",
      attachment.content
        .toString("base64")
        .match(/.{1,76}/g)
        ?.join("\r\n") || ""
    );
  }

  parts.push(`--${boundary}--`);

  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    parts.join("\r\n"),
  ].join("\r\n");
}

export async function sendGmailEmail(
  params: GmailSendParams
) {
  const oauth2Client = new google.auth.OAuth2(
    params.clientId,
    params.clientSecret
  );

  oauth2Client.setCredentials({
    access_token: params.accessToken,
    refresh_token: params.refreshToken || undefined,
  });

  const gmail = google.gmail({
    version: "v1",
    auth: oauth2Client,
  });

  const rawMessage = createMimeMessage(params);

  const raw = base64UrlEncode(rawMessage);

  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
    },
  });

  return response.data;
}