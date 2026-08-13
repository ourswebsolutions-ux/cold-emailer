import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const {
      accountId,
      threadId,
      recipient,
      subject,
      body: emailBody,
      scheduledAt,
    } = (body ?? {}) as {
      accountId?: string;
      threadId?: string;
      recipient?: string;
      subject?: string;
      body?: string;
      scheduledAt?: string;
    };

    if (!accountId || !recipient || !scheduledAt) {
      return NextResponse.json(
        {
          success: false,
          error: "accountId, recipient and scheduledAt are required",
        },
        { status: 400 }
      );
    }

    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      return NextResponse.json(
        { success: false, error: "scheduledAt must be a valid ISO date" },
        { status: 400 }
      );
    }

    if (scheduledDate.getTime() <= Date.now()) {
      return NextResponse.json(
        { success: false, error: "scheduledAt must be in the future" },
        { status: 400 }
      );
    }

    const account = await prisma.sMTPConfig.findUnique({
      where: { id: accountId },
      select: { id: true, userId: true, isActive: true },
    });

    if (!account) {
      return NextResponse.json(
        { success: false, error: "Account not found" },
        { status: 404 }
      );
    }

    if (!account.isActive) {
      return NextResponse.json(
        { success: false, error: "Account is inactive" },
        { status: 400 }
      );
    }

    let resolvedThreadId: string | null = null;
    if (threadId) {
      const thread = await prisma.inboxThread.findFirst({
        where: {
          id: threadId,
          smtpConfigId: account.id,
        },
        select: { id: true },
      });
      if (thread) {
        resolvedThreadId = thread.id;
      }
    }

    await prisma.inboxFollowUp.create({
      data: {
        userId: account.userId,
        smtpConfigId: account.id,
        threadId: resolvedThreadId,
        toEmail: recipient.trim(),
        subject: subject || "(no subject)",
        body: emailBody || "",
        scheduledAt: scheduledDate,
        status: "PENDING",
      },
    });

    return NextResponse.json({
      success: true,
      message: "Follow-up scheduled successfully",
    });
  } catch (error) {
    console.error("[inbox/follow-up]", error);
    return NextResponse.json(
      { success: false, error: "Unable to schedule follow-up" },
      { status: 500 }
    );
  }
}
