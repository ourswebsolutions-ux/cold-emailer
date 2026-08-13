import { NextRequest } from "next/server";
import {
  prisma,
  getCurrentUserId,
  jsonOk,
  jsonError,
  unauthorized,
} from "@/lib/follow-up-api";
import { processDueFollowUps } from "@/services/follow-up/follow-up.scheduler";

/**
 * POST /api/follow-up/process
 *
 * Worker / cron endpoint that sends due follow-up steps.
 *
 * Security options (pick one that matches your infra):
 * 1. Authenticated admin/user session (default below).
 * 2. Shared secret header: x-cron-secret === process.env.CRON_SECRET
 *
 * The processor:
 * - Finds PENDING recipient-steps with scheduledAt <= now
 * - Campaign must be RUNNING
 * - Recipient must not be REPLIED / COMPLETED / STOPPED
 * - Respects timezone + sendingStart / sendingEnd window
 * - Claims steps with PENDING -> SENDING to avoid double-send
 * - On success: marks SENT, schedules next step or completes recipient
 * - On failure: marks FAILED, stores error
 * - Completes campaign when all recipients are terminal
 */
export async function POST(request: NextRequest) {
  try {
    // Allow either authenticated user OR cron secret
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = request.headers.get("x-cron-secret");
    const isCron =
      !!cronSecret && !!headerSecret && headerSecret === cronSecret;

    if (!isCron) {
      const userId = await getCurrentUserId(request);
      if (!userId) return unauthorized();
    }

    let limit = 25;
    try {
      const body = await request.json().catch(() => ({}));
      if (body?.limit && typeof body.limit === "number" && body.limit > 0) {
        limit = Math.min(100, body.limit);
      }
    } catch {
      // no body is fine
    }

    const result = await processDueFollowUps(prisma, { limit });
    return jsonOk(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to process follow-ups";
    return jsonError(message, 500);
  }
}

/**
 * GET /api/follow-up/process
 * Lightweight health / dry-run style peek at how many steps are due.
 * Does not send anything.
 */
export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = request.headers.get("x-cron-secret");
    const isCron =
      !!cronSecret && !!headerSecret && headerSecret === cronSecret;

    if (!isCron) {
      const userId = await getCurrentUserId(request);
      if (!userId) return unauthorized();
    }

    const now = new Date();
    const dueCount = await prisma.followUpRecipientStep.count({
      where: {
        status: "PENDING",
        scheduledAt: { lte: now },
        recipient: {
          status: { in: ["PENDING", "RUNNING"] },
          campaign: { status: "RUNNING" },
        },
      },
    });

    return jsonOk({ dueCount, checkedAt: now.toISOString() });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to check due steps";
    return jsonError(message, 500);
  }
}