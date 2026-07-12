import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

interface SendJob {
  id: string;
  status: "running" | "completed" | "stopped";
  updates: Array<{
    type: "progress" | "completed";
    index?: number;
    email?: string;
    status?: string;
    message?: string;
    succeeded?: number;
    failed?: number;
  }>;
  subscribers: Set<(data: string) => void>;
}

interface SMTPAccount {
  host: string;
  port: number;
  username: string;
  password: string;
  senderEmail: string;
  senderName?: string;
  transporter: nodemailer.Transporter;
}

interface Recipient {
  name: string;
  email: string;
}

const jobs = new Map<string, SendJob>();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const subject = formData.get("subject") as string;
    const userId = formData.get("userId") as string;
    const body = formData.get("body") as string;
    const delay = Number.parseInt(formData.get("delay") as string) || 500;
    const autoDelay = formData.get("autoDelay") === "true";
    const minDelay = Number(formData.get("minDelay")) || 1;
    const maxDelay = Number(formData.get("maxDelay")) || 2;
    const shuffle = formData.get("shuffle") === "true";
    const recipientsRaw = formData.get("recipients") as string;
    const recipients: Recipient[] = recipientsRaw ? JSON.parse(recipientsRaw) : [];

 console.log(shuffle,"helo suffle")

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let smtpAccounts: SMTPAccount[] = [];

    if (!shuffle) {
      const smtpConfig = await prisma.sMTPConfig.findFirst({
        where: { userId, isActive: true },
      });
      if (!smtpConfig) {
        return NextResponse.json({ error: "No active SMTP configuration found." }, { status: 400 });
      }
      try {
        const transporter = nodemailer.createTransport({
          host: smtpConfig.host,
          port: smtpConfig.port,
          secure: smtpConfig.port === 465,
          auth: { user: smtpConfig.username, pass: smtpConfig.password },
        });
        await transporter.verify();
        smtpAccounts = [{
          host: smtpConfig.host,
          port: smtpConfig.port,
          username: smtpConfig.username,
          password: smtpConfig.password,
          senderEmail: smtpConfig.senderEmail,
          senderName: smtpConfig.senderName || undefined,
          transporter,
        }];
      } catch (error) {
        console.error("[v0] SMTP connection error:", error);
        return NextResponse.json({ error: "Failed to verify SMTP configuration." }, { status: 400 });
      }
    } else {
      const smtpConfigs = await prisma.sMTPConfig.findMany({ where: { userId } });
      if (smtpConfigs.length === 0) {
        return NextResponse.json({ error: "No SMTP configurations found." }, { status: 400 });
      }
      for (const config of smtpConfigs) {
        try {
          const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.port === 465,
            auth: { user: config.username, pass: config.password },
          });
          await transporter.verify();
          smtpAccounts.push({
            host: config.host,
            port: config.port,
            username: config.username,
            password: config.password,
            senderEmail: config.senderEmail,
            senderName: config.senderName || undefined,
            transporter,
          });
        } catch (error) {
          console.error(`[v0] Failed to verify SMTP ${config.host}:`, error);
        }
      }
      if (smtpAccounts.length === 0) {
        return NextResponse.json({ error: "No valid SMTP configurations could be verified." }, { status: 400 });
      }
    }

    if (!subject || !body || !recipients.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const jobId = randomBytes(16).toString("hex");
    const job: SendJob = { id: jobId, status: "running", updates: [], subscribers: new Set() };
    jobs.set(jobId, job);

    processSendJob(jobId, { subject, body, delay, autoDelay, minDelay, maxDelay, recipients, formData, smtpAccounts })
      .catch((error) => {
        console.error("[v0] Send job error:", error);
        const currentJob = jobs.get(jobId);
        if (currentJob) {
          currentJob.status = "stopped";
          broadcastUpdate(currentJob, { type: "completed", succeeded: 0, failed: recipients.length });
        }
      });

    return NextResponse.json({ jobId });
  } catch (error) {
    console.error("[v0] POST error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to start send job: ${message}` }, { status: 500 });
  }
}

async function processSendJob(
  jobId: string,
  options: {
    subject: string;
    body: string;
    delay: number;
    autoDelay: boolean;
    minDelay: number;
    maxDelay: number;
    recipients: Recipient[];
    formData: FormData;
    smtpAccounts: SMTPAccount[];
  }
) {
  const job = jobs.get(jobId);
  if (!job) return;

  const { subject, body, delay, autoDelay, minDelay, maxDelay, recipients, formData, smtpAccounts } = options;

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i++) {
    if (job.status === "stopped") break;

    const recipient = recipients[i];
    const email = recipient.email;
    const smtp = smtpAccounts[i % smtpAccounts.length];
    const senderEmail = smtp.senderEmail;
    const senderName = smtp.senderName || "";

    broadcastUpdate(job, { type: "progress", index: i, email, status: "sending" });

    try {
      const personalizedBody = body.replace(/\{\{name\}\}/g, recipient.name || email.split("@")[0]);

      const mailOptions: nodemailer.SendMailOptions = {
        from: senderName ? `${senderName} <${senderEmail}>` : senderEmail,
        to: email,
        subject,
        text: personalizedBody,
        html: personalizedBody,
      };

      const attachments: nodemailer.Attachment[] = [];
      const singleAttachment = formData.get("singleAttachment") as File | null;
      if (singleAttachment) {
        const buffer = await singleAttachment.arrayBuffer();
        attachments.push({ filename: singleAttachment.name, content: Buffer.from(buffer) });
      }
      const perRecipientAttachment = formData.get(`attachment_${i}`) as File | null;
      if (perRecipientAttachment) {
        const buffer = await perRecipientAttachment.arrayBuffer();
        attachments.push({ filename: perRecipientAttachment.name, content: Buffer.from(buffer) });
      }
      if (attachments.length > 0) {
        mailOptions.attachments = attachments;
      }

      await smtp.transporter.sendMail(mailOptions);

      broadcastUpdate(job, { type: "progress", index: i, email, status: "sent" });
      succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[v0] Error sending to ${email}:`, message);
      broadcastUpdate(job, { type: "progress", index: i, email, status: "error", message });
      failed++;
    }

    if (i < recipients.length - 1) {
      let waitTime = delay;
      if (autoDelay) {
        const min = minDelay * 60 * 1000;
        const max = maxDelay * 60 * 1000;
        waitTime = Math.floor(Math.random() * (max - min + 1)) + min;
        console.log(`[v0] Auto delay: Waiting ${Math.round(waitTime / 1000)}s before next email`);
      }
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  broadcastUpdate(job, { type: "completed", succeeded, failed });
  job.status = "completed";
}

function broadcastUpdate(job: SendJob, update: SendJob["updates"][0]) {
  job.updates.push(update);
  const message = JSON.stringify(update);
  job.subscribers.forEach((subscriber) => {
    try {
      subscriber(message);
    } catch (err) {
      console.error("[v0] Subscriber error:", err);
    }
  });
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  }
  const job = jobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const stream = new ReadableStream({
    start(controller) {
      const subscriber = (message: string) => {
        controller.enqueue(`data: ${message}\n\n`);
      };
      job.subscribers.add(subscriber);
      job.updates.forEach((update) => {
        controller.enqueue(`data: ${JSON.stringify(update)}\n\n`);
      });
      const interval = setInterval(() => {
        if (job.status === "completed" && job.subscribers.size <= 1) {
          clearInterval(interval);
          job.subscribers.delete(subscriber);
          controller.close();
        }
      }, 1000);
    },
    cancel() {},
  });
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}