import { NextRequest } from "next/server";
import {
  prisma,
  getCurrentUserId,
  jsonOk,
  jsonError,
  unauthorized,
} from "@/lib/follow-up-api";
import { addRecipients } from "@/services/follow-up/follow-up.service";
import type { AddRecipientsInput } from "@/services/follow-up/follow-up.types";

/**
 * POST /api/follow-up/recipients
 * Add one or more existing Email records to a campaign.
 *
 * Body:
 * {
 *   "campaignId": "...",
 *   "emailIds": ["id1", "id2"]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) return unauthorized();

    let body: AddRecipientsInput;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    if (!body?.campaignId) {
      return jsonError("campaignId is required", 400);
    }
    if (!Array.isArray(body.emailIds) || body.emailIds.length === 0) {
      return jsonError("emailIds is required and must not be empty", 400);
    }

    const result = await addRecipients(prisma, userId, body);
    return jsonOk(result, 201);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to add recipients";
    const status = message.includes("not found")
      ? 404
      : message.includes("Cannot") || message.includes("required")
      ? 400
      : 500;
    return jsonError(message, status);
  }
}

/**
 * GET /api/follow-up/recipients?campaignId=...
 * Optional listing of recipients for a campaign (owner only).
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) return unauthorized();

    const campaignId = request.nextUrl.searchParams.get("campaignId");
    if (!campaignId) {
      return jsonError("campaignId query parameter is required", 400);
    }

    const campaign = await prisma.followUpCampaign.findFirst({
      where: { id: campaignId, userId },
      select: { id: true },
    });
    if (!campaign) {
      return jsonError("Campaign not found", 404);
    }

    const recipients = await prisma.followUpRecipient.findMany({
      where: { campaignId },
      include: {
        email: true,
        steps: {
          include: { step: true },
          orderBy: { step: { stepNumber: "asc" } },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return jsonOk(recipients);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to list recipients";
    return jsonError(message, 500);
  }
}