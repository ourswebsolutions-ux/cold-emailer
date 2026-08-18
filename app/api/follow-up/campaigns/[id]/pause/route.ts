import { NextRequest } from "next/server";
import {
  prisma,
  getCurrentUserId,
  jsonOk,
  jsonError,
  unauthorized,
} from "@/lib/follow-up-api";
import { pauseCampaign } from "@/services/follow-up/follow-up.service";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

/**
 * POST /api/follow-up/campaigns/[id]/pause
 * RUNNING -> PAUSED. Recipients and scheduled steps are preserved.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) return unauthorized();

    const params = await Promise.resolve(context.params);
    const campaign = await pauseCampaign(prisma, params.id, userId);
    return jsonOk(campaign);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to pause campaign";
    const status = message.includes("not found")
      ? 404
      : message.includes("Only running")
      ? 400
      : 500;
    return jsonError(message, status);
  }
}