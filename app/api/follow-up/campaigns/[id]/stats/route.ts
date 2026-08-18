import { NextRequest } from "next/server";
import {
  prisma,
  getCurrentUserId,
  jsonOk,
  jsonError,
  unauthorized,
} from "@/lib/follow-up-api";
import { getCampaignStats } from "@/services/follow-up/follow-up.service";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

/**
 * GET /api/follow-up/campaigns/[id]/stats
 * Aggregated recipient statistics for tracking UI.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) return unauthorized();

    const params = await Promise.resolve(context.params);
    const stats = await getCampaignStats(prisma, params.id, userId);
    return jsonOk(stats);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load stats";
    const status = message.includes("not found") ? 404 : 500;
    return jsonError(message, status);
  }
}