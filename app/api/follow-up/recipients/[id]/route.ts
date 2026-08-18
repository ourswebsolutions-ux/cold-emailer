import { NextRequest } from "next/server";
import {
  prisma,
  getCurrentUserId,
  jsonOk,
  jsonError,
  unauthorized,
} from "@/lib/follow-up-api";
import { removeRecipient } from "@/services/follow-up/follow-up.service";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

/**
 * DELETE /api/follow-up/recipients/[id]
 * Remove a recipient from its campaign (owner only).
 * Cascades recipient-steps via Prisma relation.
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) return unauthorized();

    const params = await Promise.resolve(context.params);
    const result = await removeRecipient(prisma, params.id, userId);
    return jsonOk(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to remove recipient";
    const status = message.includes("not found") ? 404 : 500;
    return jsonError(message, status);
  }
}

/**
 * GET /api/follow-up/recipients/[id]
 * Fetch a single recipient with timeline (owner only).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const userId = await getCurrentUserId(request);
    if (!userId) return unauthorized();

    const params = await Promise.resolve(context.params);

    const recipient = await prisma.followUpRecipient.findFirst({
      where: { id: params.id },
      include: {
        email: true,
        campaign: {
          select: {
            id: true,
            userId: true,
            name: true,
            status: true,
            stopOnReply: true,
          },
        },
        steps: {
          include: { step: true },
          orderBy: { step: { stepNumber: "asc" } },
        },
      },
    });

    if (!recipient || recipient.campaign.userId !== userId) {
      return jsonError("Recipient not found", 404);
    }

    return jsonOk(recipient);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load recipient";
    return jsonError(message, 500);
  }
}