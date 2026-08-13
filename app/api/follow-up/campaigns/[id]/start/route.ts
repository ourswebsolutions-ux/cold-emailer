import { NextRequest } from "next/server";
import {
  prisma,
  getCurrentUserId,
  jsonOk,
  jsonError,
  unauthorized,
} from "@/lib/follow-up-api";
import { startCampaign } from "@/services/follow-up/follow-up.service";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

/**
 * POST /api/follow-up/campaigns/[id]/start
 * Transition campaign to RUNNING and ensure first steps are scheduled.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) return unauthorized();

    const params = await Promise.resolve(context.params);
    const campaign = await startCampaign(prisma, params.id, userId);
    return jsonOk(campaign);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to start campaign";
    const status = message.includes("not found")
      ? 404
      : message.includes("Cannot") || message.includes("no ")
      ? 400
      : 500;
    return jsonError(message, status);
  }
}