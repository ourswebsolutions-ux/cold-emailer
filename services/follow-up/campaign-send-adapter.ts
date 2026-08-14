/**
 * Campaign send adapter
 * ---------------------
 * Bridges the existing follow-up worker (processDueFollowUps / sendCampaignEmail)
 * to the project's existing SMTP service:
 *
 *   services/smtp/smtp.service.ts  →  sendSMTPEmail()
 *
 * DO NOT create another Nodemailer transporter.
 * This file only loads the selected SMTPConfig from Prisma and forwards
 * credentials + message payload to the existing sendSMTPEmail().
 *
 * Integration points for the existing worker:
 *
 *   1. Load campaign with smtpConfig relation
 *   2. Call sendCampaignEmailViaSmtp({ smtpConfig, to, subject, html, fromName? })
 *   3. Persist success (messageId) or failure (error message) on the recipient step
 */

import { sendSMTPEmail } from "@/services/smtp/smtp.service";

export interface SmtpConfigLike {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string; // only available server-side
  email?: string | null; // "from" address
  from?: string | null;
  fromName?: string | null;
  name?: string | null;
  userId?: string;
}

export interface SendCampaignEmailInput {
  smtpConfig: SmtpConfigLike;
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromNameOverride?: string | null;
}

export interface SendCampaignEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Resolve SMTP credentials from the campaign's smtpConfig and call the
 * existing sendSMTPEmail() implementation.
 */
export async function sendCampaignEmailViaSmtp(
  input: SendCampaignEmailInput
): Promise<SendCampaignEmailResult> {
  const { smtpConfig, to, subject, html, text, fromNameOverride } = input;

  if (!smtpConfig?.host || !smtpConfig?.username || !smtpConfig?.password) {
    return {
      success: false,
      error: "SMTP configuration is incomplete (host / username / password missing)",
    };
  }

  const from =
    smtpConfig.email ||
    smtpConfig.from ||
    smtpConfig.username;

  if (!from) {
    return {
      success: false,
      error: "SMTP configuration has no from / email address",
    };
  }

  try {
    const result = await sendSMTPEmail({
      host: smtpConfig.host,
      port: Number(smtpConfig.port) || 587,
      username: smtpConfig.username,
      password: smtpConfig.password,
      from,
      fromName:
        fromNameOverride ||
        smtpConfig.fromName ||
        smtpConfig.name ||
        undefined,
      to,
      subject,
      html,
      // text is optional; many existing implementations accept only html
      ...(text ? { text } : {}),
    });

    // Normalise possible return shapes from the existing service
    if (result && typeof result === "object") {
      if ((result as any).success === false) {
        return {
          success: false,
          error:
            (result as any).error ||
            (result as any).message ||
            "SMTP send failed",
        };
      }
      return {
        success: true,
        messageId:
          (result as any).messageId ||
          (result as any).messageID ||
          (result as any).id,
      };
    }

    // Some implementations return void / messageId string on success
    return {
      success: true,
      messageId: typeof result === "string" ? rezsult : undefined,
    };
  } catch (err: any) {
    const message =
      err?.response ||
      err?.message ||
      err?.toString?.() ||
      "Unknown SMTP error";
    return {
      success: false,
      error: String(message).slice(0, 1000),
    };
  }
}

/**
 * Variable replacement used before calling the sender.
 * Aligns with the variables supported by the campaign page.
 */
export function applyCampaignVariables(
  template: string,
  data: {
    name?: string | null;
    email?: string | null;
    company?: string | null;
    website?: string | null;
  }
): string {
  return template
    .replace(/\{name\}/gi, data.name?.trim() || "there")
    .replace(/\{email\}/gi, data.email?.trim() || "")
    .replace(/\{company\}/gi, data.company?.trim() || "your company")
    .replace(/\{website\}/gi, data.website?.trim() || "");
}

/**
 * Simple spin-text processor for {A|B|C} syntax.
 * Prefer the existing /api/email/spin-text endpoint when available;
 * this is a lightweight fallback for the worker.
 */
export function applySpinText(text: string): string {
  return text.replace(/\{([^{}|]+(?:\|[^{}|]+)+)\}/g, (_, group: string) => {
    const options = group.split("|").map((s) => s.trim());
    return options[Math.floor(Math.random() * options.length)] || "";
  });
}