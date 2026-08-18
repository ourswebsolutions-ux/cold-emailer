import { NextRequest } from "next/server";
import {
  prisma,
  getCurrentUserId,
  jsonOk,
  jsonError,
  unauthorized,
} from "@/lib/follow-up-api";
import { resumeCampaign } from "@/services/follow-up/follow-up.service";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

/**
 * POST /api/follow-up/campaigns/[id]/resume
 * PAUSED -> RUNNING. Overdue nextStepAt values are nudged to now
 * so they become eligible on the next process tick (still gated by
 * the sending window).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) return unauthorized();

    const params = await Promise.resolve(context.params);
    const campaign = await resumeCampaign(prisma, params.id, userId);
    return jsonOk(campaign);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to resume campaign";
    const status = message.includes("not found")
      ? 404
      : message.includes("Only paused")
      ? 400
      : 500;
    return jsonError(message, status);
  }
}