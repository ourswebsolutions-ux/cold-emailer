import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import nodemailer from "nodemailer";
import { PrismaClient, UserStatus, UserRole } from "@prisma/client";
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

    const recipientsRaw = formData.get("recipients") as string;
    type Recipient = { name: string; email: string };

const recipients: Recipient[] = recipientsRaw ? JSON.parse(recipientsRaw) : [];

    console.log(userId,"helo")
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const smtpConfig = await prisma.sMTPConfig.findFirst({
      where: {
        userId,
        isActive: true,
      },
    });
console.log(smtpConfig,"helo")
    if (!smtpConfig) {
      return NextResponse.json(
        { error: "No active SMTP configuration found." },
        { status: 400 }
      );
    }

    const smtpHost = smtpConfig.host;
    const smtpPort = smtpConfig.port;
    const smtpUsername = smtpConfig.username;
    const smtpPassword = smtpConfig.password;
    const senderEmail = smtpConfig.senderEmail;
    const senderName = smtpConfig.senderName || "";
    // Validation
    if (!senderEmail || !subject || !body || !recipients.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!smtpHost || !smtpUsername || !smtpPassword) {
      return NextResponse.json({ error: "SMTP configuration missing" }, { status: 400 });
    }

    const jobId = randomBytes(16).toString("hex");

    const job: SendJob = {
      id: jobId,
      status: "running",
      updates: [],
      subscribers: new Set(),
    };

    jobs.set(jobId, job);

    // Start processing in background
    processSendJob(jobId, {
      senderEmail,
      senderName,
      subject,
      body,
      delay,
      autoDelay,
      minDelay,
      maxDelay,
      recipients,
      formData,
      smtpHost,
      smtpPort,
      smtpUsername,
      smtpPassword,
    }).catch((error) => {
      console.error("[v0] Send job error:", error);
      const currentJob = jobs.get(jobId);
      if (currentJob) {
        currentJob.status = "stopped";
        broadcastUpdate(currentJob, {
          type: "completed",
          succeeded: 0,
          failed: recipients.length,
        });
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
    senderEmail: string;
    senderName: string;
    subject: string;
    body: string;
    delay: number;
    autoDelay: boolean;
    minDelay: number;
    maxDelay: number;
    recipients: { name: string; email: string }[];   // ← Fixed
    formData: FormData;
    smtpHost: string;
    smtpPort: number;
    smtpUsername: string;
    smtpPassword: string;
  }
) {
  const job = jobs.get(jobId);
  if (!job) return;

  const {
    senderEmail,
    senderName,
    subject,
    body,
    delay,
    autoDelay,
    minDelay,
    maxDelay,
    recipients,
    formData,
    smtpHost,
    smtpPort,
    smtpUsername,
    smtpPassword,
  } = options;

  let transporter: nodemailer.Transporter;

  try {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUsername,
        pass: smtpPassword,
      },
    });

    await transporter.verify();
  } catch (error) {
    console.error("[v0] SMTP connection error:", error);
    broadcastUpdate(job, {
      type: "completed",
      succeeded: 0,
      failed: recipients.length,
    });
    job.status = "completed";
    return;
  }

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < recipients.length; i++) {
    if (job.status === "stopped") break;

const recipient = recipients[i];
const email = recipient.email;
    // Progress: sending
    broadcastUpdate(job, {
      type: "progress",
      index: i,
      email,
      status: "sending",
    });

    try {
      const personalizedBody = body.replace(
  /\{\{name\}\}/g,
  recipient.name || email.split("@")[0]
);

const mailOptions: nodemailer.SendMailOptions = {
  from: senderName ? `${senderName} <${senderEmail}>` : senderEmail,
  to: email,
  subject,
  text: personalizedBody,
  html: personalizedBody
};

      // Handle attachments
      const attachments: nodemailer.Attachment[] = [];

      const singleAttachment = formData.get("singleAttachment") as File | null;
      if (singleAttachment) {
        const buffer = await singleAttachment.arrayBuffer();
        attachments.push({
          filename: singleAttachment.name,
          content: Buffer.from(buffer),
        });
      }

      const perRecipientAttachment = formData.get(`attachment_${i}`) as File | null;
      if (perRecipientAttachment) {
        const buffer = await perRecipientAttachment.arrayBuffer();
        attachments.push({
          filename: perRecipientAttachment.name,
          content: Buffer.from(buffer),
        });
      }

      if (attachments.length > 0) {
        mailOptions.attachments = attachments;
      }

      await transporter.sendMail(mailOptions);

      // Success
      broadcastUpdate(job, {
        type: "progress",
        index: i,
        email,
        status: "sent",
      });

      succeeded++;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[v0] Error sending to ${email}:`, message);

      broadcastUpdate(job, {
        type: "progress",
        index: i,
        email,
        status: "error",
        message,
      });

      failed++;
    }

    // Delay before next email (except last one)
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

  // Final completion update
  broadcastUpdate(job, {
    type: "completed",
    succeeded,
    failed,
  });

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

      // Send all previous updates immediately
      job.updates.forEach((update) => {
        controller.enqueue(`data: ${JSON.stringify(update)}\n\n`);
      });

      // Cleanup when job is done and client disconnects
      const interval = setInterval(() => {
        if (job.status === "completed" && job.subscribers.size <= 1) {
          clearInterval(interval);
          job.subscribers.delete(subscriber);
          controller.close();
        }
      }, 1000);
    },

    cancel() {
      // Client disconnected
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}