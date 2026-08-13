import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

import nodemailer from "nodemailer";

function splitAddresses(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

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
      to,
      subject,
      body: emailBody,
    } = (body ?? {}) as {
      accountId?: string;
      threadId?: string;
      to?: string;
      subject?: string;
      body?: string;
    };

    if (!accountId || !to || typeof to !== "string" || to.trim() === "") {
      return NextResponse.json(
        { success: false, error: "accountId and to are required" },
        { status: 400 }
      );
    }

    const account = await prisma.sMTPConfig.findUnique({
      where: { id: accountId },
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

    if (!account.host || !account.port || !account.username || !account.password) {
      return NextResponse.json(
        { success: false, error: "SMTP configuration is incomplete for this account" },
        { status: 400 }
      );
    }

    let thread = null;
    let inReplyTo: string | undefined;
    let references: string | undefined;

    if (threadId) {
      thread = await prisma.inboxThread.findFirst({
        where: {
          id: threadId,
          smtpConfigId: account.id,
        },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              providerMessageId: true,
              references: true,
            },
          },
        },
      });

      if (thread && thread.messages[0]) {
        inReplyTo = thread.messages[0].providerMessageId;
        const prevRefs = thread.messages[0].references || "";
        references = prevRefs
          ? `${prevRefs} ${inReplyTo}`.trim()
          : inReplyTo;
      }
    }

    const toList = splitAddresses(to);
    if (toList.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one valid recipient is required" },
        { status: 400 }
      );
    }

    const fromName = account.senderName?.trim();
    const from = fromName
      ? `"${fromName}" <${account.senderEmail}>`
      : account.senderEmail;

    const transporter = nodemailer.createTransport({
      host: account.host,
      port: account.port,
      secure: account.port === 465,
      auth: {
        user: account.username,
        pass: account.password,
      },
    });

    let providerMessageId: string;
    try {
      const info = await transporter.sendMail({
        from,
        to: toList.join(", "),
        subject: subject || "(no subject)",
        text: emailBody || "",
        html: emailBody || undefined,
        inReplyTo: inReplyTo || undefined,
        references: references || undefined,
        replyTo: account.senderEmail,
      });
      providerMessageId = info.messageId || `reply-${Date.now()}`;
    } catch (smtpError) {
      console.error("[inbox/reply] SMTP error", smtpError);
      return NextResponse.json(
        { success: false, error: "Failed to send reply. Check SMTP settings." },
        { status: 502 }
      );
    }

    const now = new Date();

    if (!thread) {
      thread = await prisma.inboxThread.create({
        data: {
          userId: account.userId,
          smtpConfigId: account.id,
          providerThreadId: providerMessageId,
          subject: subject || "(no subject)",
          participants: Array.from(new Set([account.senderEmail, ...toList])),
          lastMessageAt: now,
          unreadCount: 0,
          snippet: (emailBody || "").slice(0, 200),
        },
      });
    } else {
      await prisma.inboxThread.update({
        where: { id: thread.id },
        data: {
          lastMessageAt: now,
          snippet: (emailBody || "").slice(0, 200),
        },
      });
    }

    await prisma.inboxMessage.create({
      data: {
        threadId: thread.id,
        smtpConfigId: account.id,
        providerMessageId,
        inReplyTo: inReplyTo || undefined,
        references: references || undefined,
        fromEmail: account.senderEmail,
        fromName: account.senderName,
        toEmails: toList,
        subject: subject || "(no subject)",
        textBody: emailBody || "",
        htmlBody: emailBody || undefined,
        snippet: (emailBody || "").slice(0, 200),
        sentAt: now,
        isRead: true,
        isStarred: false,
        direction: "OUTGOING",
        hasAttachments: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Reply sent successfully",
    });
  } catch (error) {
    console.error("[inbox/reply]", error);
    return NextResponse.json(
      { success: false, error: "Unable to send reply" },
      { status: 500 }
    );
  }
}
