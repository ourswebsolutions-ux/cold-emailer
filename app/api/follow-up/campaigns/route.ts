import { NextRequest } from "next/server";
import {
  prisma,
  getCurrentUserId,
  jsonOk,
  jsonError,
  unauthorized,
} from "@/lib/follow-up-api";
import {
  createCampaign,
  listCampaigns,
} from "@/services/follow-up/follow-up.service";
import type { CreateCampaignInput } from "@/services/follow-up/follow-up.types";

/**
 * GET /api/follow-up/campaigns
 * List the authenticated user's follow-up campaigns with stats.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorized();

    const campaigns = await listCampaigns(prisma, userId);
    return jsonOk(campaigns);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list campaigns";
    return jsonError(message, 500);
  }
}

/**
 * POST /api/follow-up/campaigns
 * Create a new follow-up campaign with steps and recipients.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return unauthorized();

    let body: CreateCampaignInput;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    if (!body?.name?.trim()) {
      return jsonError("name is required", 400);
    }
    if (!Array.isArray(body.steps) || body.steps.length === 0) {
      return jsonError("steps is required and must not be empty", 400);
    }
    if (
      !Array.isArray(body.recipientEmailIds) ||
      body.recipientEmailIds.length === 0
    ) {
      return jsonError(
        "recipientEmailIds is required and must not be empty",
        400
      );
    }

    for (const step of body.steps) {
      if (!step.subject?.trim()) {
        return jsonError("Each step must have a subject", 400);
      }
      if (step.delayDays != null && step.delayDays < 1) {
        return jsonError("delayDays must be at least 1", 400);
      }
    }

    const campaign = await createCampaign(prisma, userId, body);
    return jsonOk(campaign, 201);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create campaign";
    const status =
      message.includes("not found") || message.includes("required")
        ? 400
        : 500;
    return jsonError(message, status);
  }
}
