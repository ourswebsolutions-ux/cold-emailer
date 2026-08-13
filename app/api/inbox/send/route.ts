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
      to,
      cc,
      bcc,
      subject,
      body: emailBody,
    } = (body ?? {}) as {
      accountId?: string;
      to?: string;
      cc?: string;
      bcc?: string;
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

    const toList = splitAddresses(to);
    const ccList = splitAddresses(cc);
    const bccList = splitAddresses(bcc);

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
        cc: ccList.length ? ccList.join(", ") : undefined,
        bcc: bccList.length ? bccList.join(", ") : undefined,
        subject: subject || "(no subject)",
        text: emailBody || "",
        html: emailBody || undefined,
        replyTo: account.senderEmail,
      });
      providerMessageId = info.messageId || `sent-${Date.now()}`;
    } catch (smtpError) {
      console.error("[inbox/send] SMTP error", smtpError);
      return NextResponse.json(
        { success: false, error: "Failed to send email. Check SMTP settings." },
        { status: 502 }
      );
    }

    const now = new Date();
    const participants = Array.from(
      new Set([account.senderEmail, ...toList, ...ccList])
    );

    const thread = await prisma.inboxThread.create({
      data: {
        userId: account.userId,
        smtpConfigId: account.id,
        providerThreadId: providerMessageId,
        subject: subject || "(no subject)",
        participants,
        lastMessageAt: now,
        unreadCount: 0,
        isStarred: false,
        isArchived: false,
        isDeleted: false,
        snippet: (emailBody || "").slice(0, 200),
      },
    });

    await prisma.inboxMessage.create({
      data: {
        threadId: thread.id,
        smtpConfigId: account.id,
        providerMessageId,
        fromEmail: account.senderEmail,
        fromName: account.senderName,
        toEmails: toList,
        ccEmails: ccList.length ? ccList : undefined,
        bccEmails: bccList.length ? bccList : undefined,
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
      message: "Message sent successfully",
    });
  } catch (error) {
    console.error("[inbox/send]", error);
    return NextResponse.json(
      { success: false, error: "Unable to send message" },
      { status: 500 }
    );
  }
}
