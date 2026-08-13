import { PrismaClient, Prisma } from "@prisma/client";
import type { ProcessResult, VariableContext } from "./follow-up.types";
import {
  isWithinSendingWindow,
  addDays,
  replaceVariables,
  maybeCompleteCampaign,
} from "./follow-up.service";

/**
 * Adapter for the project's existing email sending service.
 *
 * IMPORTANT: Replace the body of `sendCampaignEmail` with a call to your
 * existing SMTP / Gmail / Outlook sender (e.g. lib/email/send.ts or
 * services/email.service.ts). Do NOT invent a second nodemailer stack.
 *
 * The signature is intentionally small so it can wrap whatever you already have.
 */
export type SendEmailPayload = {
  smtpConfigId: string;
  to: string;
  toName?: string | null;
  subject: string;
  html?: string;
  text: string;
  userId: string;
};

export type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

/**
 * Default stub that looks for a global/project send helper.
 * In a real integration, import your existing function directly, e.g.:
 *
 *   import { sendEmail } from "@/lib/email";
 *   export async function sendCampaignEmail(payload) {
 *     return sendEmail({ ... });
 *   }
 */
export async function sendCampaignEmail(
  payload: SendEmailPayload
): Promise<SendEmailResult> {
  // Attempt dynamic import of common project paths so this module
  // works once dropped into the real codebase without further edits.
  const candidates = [
    "@/lib/email",
    "@/lib/email/send",
    "@/services/email",
    "@/services/email.service",
    "@/lib/mailer",
    "@/utils/email",
  ];

  for (const path of candidates) {
    try {
      // @ts-expect-error dynamic path
      const mod = await import(path);
      const fn =
        mod.sendEmail ||
        mod.sendMail ||
        mod.default?.sendEmail ||
        mod.default;
      if (typeof fn === "function") {
        const result = await fn({
          smtpConfigId: payload.smtpConfigId,
          to: payload.to,
          toName: payload.toName,
          subject: payload.subject,
          html: payload.html ?? payload.text.replace(/\n/g, "<br/>"),
          text: payload.text,
          userId: payload.userId,
        });
        if (result && typeof result === "object") {
          return {
            success: result.success !== false && !result.error,
            messageId: result.messageId || result.id,
            error: result.error,
          };
        }
        return { success: true };
      }
    } catch {
      // try next candidate
    }
  }

  // If no existing sender is found, fail the step rather than silently
  // pretending success. Wire your real sender above.
  return {
    success: false,
    error:
      "No existing email sending service found. Wire sendCampaignEmail to your project sender.",
  };
}

const BATCH_SIZE = 25;

/**
 * Process due follow-up recipient steps.
 *
 * Concurrency safety:
 *   PENDING -> SENDING is claimed with a conditional updateMany /
 *   findFirst + update so only one worker processes a given step.
 */
export async function processDueFollowUps(
  prisma: PrismaClient,
  options?: { limit?: number; now?: Date }
): Promise<ProcessResult> {
  const now = options?.now ?? new Date();
  const limit = options?.limit ?? BATCH_SIZE;

  const result: ProcessResult = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  // Find candidate steps that look due
  const candidates = await prisma.followUpRecipientStep.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: now },
      recipient: {
        status: { in: ["PENDING", "RUNNING"] },
        campaign: {
          status: "RUNNING",
        },
      },
    },
    include: {
      step: true,
      recipient: {
        include: {
          email: true,
          campaign: {
            include: {
              smtpConfig: true,
              steps: {
                where: { enabled: true },
                orderBy: { stepNumber: "asc" },
              },
            },
          },
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: limit * 2, // over-fetch a bit; some may be skipped for window
  });

  for (const candidate of candidates) {
    if (result.processed >= limit) break;

    const { recipient, step } = candidate;
    const campaign = recipient.campaign;

    // Skip disabled steps (should not be scheduled, but be safe)
    if (!step.enabled) {
      result.skipped++;
      continue;
    }

    // Respect sending window in campaign timezone
    if (
      !isWithinSendingWindow(
        now,
        campaign.timezone,
        campaign.sendingStart,
        campaign.sendingEnd
      )
    ) {
      result.skipped++;
      continue;
    }

    // Require SMTP config
    if (!campaign.smtpConfigId) {
      result.failed++;
      result.errors.push({
        recipientStepId: candidate.id,
        error: "Campaign has no SMTP configuration",
      });
      // Mark failed so we do not loop forever
      await prisma.followUpRecipientStep.update({
        where: { id: candidate.id },
        data: {
          status: "FAILED",
          failedAt: now,
          error: "Campaign has no SMTP configuration",
        },
      });
      continue;
    }

    // ── Claim the step: PENDING -> SENDING (optimistic lock) ──
    const claimed = await prisma.followUpRecipientStep.updateMany({
      where: {
        id: candidate.id,
        status: "PENDING",
      },
      data: {
        status: "SENDING",
      },
    });

    if (claimed.count === 0) {
      // Another worker already claimed it
      result.skipped++;
      continue;
    }

    result.processed++;

    // Prepare content
    const ctx: VariableContext = {
      name: recipient.email.name,
      email: recipient.email.email,
      company: recipient.email.company,
      website: recipient.email.website,
    };
    const subject = replaceVariables(step.subject, ctx);
    const body = replaceVariables(step.body, ctx);

    try {
      const sendResult = await sendCampaignEmail({
        smtpConfigId: campaign.smtpConfigId,
        to: recipient.email.email,
        toName: recipient.email.name,
        subject,
        text: body,
        html: body.replace(/\n/g, "<br/>"),
        userId: campaign.userId,
      });

      if (!sendResult.success) {
        throw new Error(sendResult.error || "Send failed");
      }

      // ── Success path ──
      await prisma.$transaction(async (tx) => {
        await tx.followUpRecipientStep.update({
          where: { id: candidate.id },
          data: {
            status: "SENT",
            sentAt: now,
            error: null,
          },
        });

        // Determine next enabled step after this one
        const allEnabled = campaign.steps; // already filtered enabled, ordered
        const currentIndex = allEnabled.findIndex((s) => s.id === step.id);
        const nextStepDef =
          currentIndex >= 0 ? allEnabled[currentIndex + 1] : undefined;

        if (nextStepDef) {
          const nextScheduledAt = addDays(now, Math.max(1, nextStepDef.delayDays));

          // Schedule the next recipient-step
          await tx.followUpRecipientStep.updateMany({
            where: {
              recipientId: recipient.id,
              stepId: nextStepDef.id,
              status: "PENDING",
            },
            data: {
              scheduledAt: nextScheduledAt,
            },
          });

          await tx.followUpRecipient.update({
            where: { id: recipient.id },
            data: {
              status: "RUNNING",
              currentStep: nextStepDef.stepNumber,
              lastSentAt: now,
              nextStepAt: nextScheduledAt,
            },
          });
        } else {
          // No more steps → recipient completed
          await tx.followUpRecipient.update({
            where: { id: recipient.id },
            data: {
              status: "COMPLETED",
              currentStep: step.stepNumber,
              lastSentAt: now,
              nextStepAt: null,
              completedAt: now,
            },
          });
        }

        await maybeCompleteCampaign(tx, campaign.id);
      });

      result.sent++;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown send error";

      await prisma.$transaction(async (tx) => {
        await tx.followUpRecipientStep.update({
          where: { id: candidate.id },
          data: {
            status: "FAILED",
            failedAt: now,
            error: message.slice(0, 2000),
          },
        });

        // Do not fail the whole recipient permanently on a single step failure
        // unless you prefer that policy. We keep them RUNNING so later steps
        // or retries can be handled by ops. Optionally mark FAILED:
        await tx.followUpRecipient.update({
          where: { id: recipient.id },
          data: {
            status: "FAILED",
            nextStepAt: null,
          },
        });

        await maybeCompleteCampaign(tx, campaign.id);
      });

      result.failed++;
      result.errors.push({
        recipientStepId: candidate.id,
        error: message,
      });
    }
  }

  return result;
}
