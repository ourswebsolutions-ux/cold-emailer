import { NextRequest } from "next/server";
import {
  prisma,
  getCurrentUserId,
  jsonOk,
  jsonError,
  unauthorized,
  notFound,
} from "@/lib/follow-up-api";
import {
  getCampaignDetail,
  updateCampaign,
  deleteCampaign,
} from "@/services/follow-up/follow-up.service";
import type { UpdateCampaignInput } from "@/services/follow-up/follow-up.types";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function resolveId(ctx: RouteContext): Promise<string> {
  const params = await Promise.resolve(ctx.params);
  return params.id;
}

/**
 * GET /api/follow-up/campaigns/[id]
 * Full campaign detail for the owner.
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) return unauthorized();

    const id = await resolveId(context);
    const campaign = await getCampaignDetail(prisma, id, userId);
    if (!campaign) return notFound("Campaign not found");

    return jsonOk(campaign);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load campaign";
    return jsonError(message, 500);
  }
}

/**
 * PATCH /api/follow-up/campaigns/[id]
 * Update campaign metadata (name, schedule, window, stopOnReply, ...).
 */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) return unauthorized();

    const id = await resolveId(context);

    let body: UpdateCampaignInput;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    const updated = await updateCampaign(prisma, id, userId, body);
    return jsonOk(updated);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update campaign";
    const status = message.includes("not found")
      ? 404
      : message.includes("Cannot")
      ? 400
      : 500;
    return jsonError(message, status);
  }
}

/**
 * DELETE /api/follow-up/campaigns/[id]
 * Permanently delete a campaign (cascade removes steps & recipients).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) return unauthorized();

    const id = await resolveId(context);
    const result = await deleteCampaign(prisma, id, userId);
    return jsonOk(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete campaign";
    const status = message.includes("not found") ? 404 : 500;
    return jsonError(message, status);
  }
}