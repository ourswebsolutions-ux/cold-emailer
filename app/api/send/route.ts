import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";
import dns from "dns/promises";

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

interface ValidationResult {
  valid: boolean;
  reason?: string;
  normalizedEmail?: string;
}

const jobs = new Map<string, SendJob>();
const validationCache = new Map<string, { valid: boolean; reason?: string; timestamp: number }>();

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
  "yopmail.com", "throwawaymail.com", "temp-mail.org", // add more as needed
]);

function normalizeEmail(email: string): string {
  let e = email.trim().toLowerCase();
  const commonFixes: [RegExp, string][] = [
    [/gm(?:ail)?\.(?:com?)?$/, "gmail.com"],
    [/gmial\.com$/, "gmail.com"],
    [/gamil\.com$/, "gmail.com"],
    [/hotmial\.com$/, "hotmail.com"],
    [/yaho\.com$/, "yahoo.com"],
    [/outllok\.com$/, "outlook.com"],
  ];
  for (const [regex, fix] of commonFixes) {
    e = e.replace(regex, fix);
  }
  return e;
}

function validateSyntax(email: string): boolean {
  if (!email || !email.includes("@")) return false;
  const [local, domain] = email.split("@");
  if (!local || local.length > 64 || !domain || domain.length > 255) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

async function checkMX(domain: string): Promise<boolean> {
  try {
    const mx = await dns.resolveMx(domain);
    return mx && mx.length > 0;
  } catch {
    return false;
  }
}

function isDisposable(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain);
}

function classifySMTPError(error: any): { status: string; message: string } {
  const msg = (error?.message || "").toLowerCase();
  if (msg.includes("550") || msg.includes("user not found") || msg.includes("recipient rejected") || msg.includes("mailbox unavailable")) {
    return { status: "bounced", message: "Recipient does not exist" };
  }
  if (msg.includes("quota")) return { status: "failed", message: "Mailbox quota exceeded" };
  if (msg.includes("auth")) return { status: "failed", message: "Authentication failed" };
  if (msg.includes("timeout") || msg.includes("connection refused")) return { status: "failed", message: "Connection timeout" };
  return { status: "failed", message: msg || "Unknown error" };
}

async function validateRecipient(email: string): Promise<ValidationResult> {
  const normalized = normalizeEmail(email);
  const cacheKey = normalized;
  const cached = validationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 3600000) { // 1h cache
    return { valid: cached.valid, reason: cached.reason, normalizedEmail: normalized };
  }

  console.log(`Validating ${email}`);

  if (!validateSyntax(normalized)) {
    const res = { valid: false, reason: "Invalid syntax", normalizedEmail: normalized };
    validationCache.set(cacheKey, { ...res, timestamp: Date.now() });
    return res;
  }

  const domain = normalized.split("@")[1];
  if (isDisposable(domain)) {
    const res = { valid: false, reason: "Disposable email", normalizedEmail: normalized };
    validationCache.set(cacheKey, { ...res, timestamp: Date.now() });
    return res;
  }

  const hasMX = await checkMX(domain);
  if (!hasMX) {
    const res = { valid: false, reason: "Domain has no MX records", normalizedEmail: normalized };
    validationCache.set(cacheKey, { ...res, timestamp: Date.now() });
    return res;
  }

  const res = { valid: true, normalizedEmail: normalized };
  validationCache.set(cacheKey, { valid: true, timestamp: Date.now() });
  return res;
}

  const GREETINGS = [
  "Hi",
  "Hello",
  "Hey"
];

function randomGreeting() {
  return GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
}

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
    let recipients: Recipient[] = recipientsRaw ? JSON.parse(recipientsRaw) : [];

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let smtpAccounts: SMTPAccount[] = [];

    if (!shuffle) {
      const smtpConfig = await prisma.sMTPConfig.findFirst({ where: { userId, isActive: true } });
      if (!smtpConfig) return NextResponse.json({ error: "No active SMTP configuration found." }, { status: 400 });
      try {
        const transporter = nodemailer.createTransport({
          host: smtpConfig.host, port: smtpConfig.port, secure: smtpConfig.port === 465,
          auth: { user: smtpConfig.username, pass: smtpConfig.password },
        });
        await transporter.verify();
        smtpAccounts = [{ ...smtpConfig, senderName: smtpConfig.senderName || undefined, transporter }];
      } catch (error) {
        console.error("[v0] SMTP connection error:", error);
        return NextResponse.json({ error: "Failed to verify SMTP configuration." }, { status: 400 });
      }
    } else {
      const smtpConfigs = await prisma.sMTPConfig.findMany({ where: { userId } });
      if (smtpConfigs.length === 0) return NextResponse.json({ error: "No SMTP configurations found." }, { status: 400 });
      for (const config of smtpConfigs) {
        try {
          const transporter = nodemailer.createTransport({
            host: config.host, port: config.port, secure: config.port === 465,
            auth: { user: config.username, pass: config.password },
          });
          await transporter.verify();
          smtpAccounts.push({ ...config, senderName: config.senderName || undefined, transporter });
        } catch (error) {
          console.error(`[v0] Failed to verify SMTP ${config.host}:`, error);
        }
      }
      if (smtpAccounts.length === 0) return NextResponse.json({ error: "No valid SMTP configurations could be verified." }, { status: 400 });
    }

    if (!subject || !body || !recipients.length) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    // Deduplicate
    const seen = new Set<string>();
    recipients = recipients.filter(r => {
      const norm = normalizeEmail(r.email);
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });

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
  let skipped = 0;
  let invalid = 0;
  let disposable = 0;
  let mxFailures = 0;

  for (let i = 0; i < recipients.length; i++) {
    if (job.status === "stopped") break;

    const recipient = recipients[i];
    let email = recipient.email;
    const validation = await validateRecipient(email);

    if (!validation.valid) {
      console.log(`Skipping invalid: ${email} - ${validation.reason}`);
      const reason = validation.reason || "Invalid email";
      broadcastUpdate(job, { type: "progress", index: i, email, status: "skipped", message: reason });
      skipped++;
      if (reason.includes("syntax") || reason.includes("invalid")) invalid++;
      if (reason.includes("Disposable")) disposable++;
      if (reason.includes("MX")) mxFailures++;
      continue;
    }

    email = validation.normalizedEmail!;
    const smtp = smtpAccounts[i % smtpAccounts.length];
    const senderEmail = smtp.senderEmail;
    const senderName = smtp.senderName || "";

    broadcastUpdate(job, { type: "progress", index: i, email, status: "sending" });

    try {
      const personalizedBody = body
  .replace(/\{\{greeting\}\}/g, randomGreeting())
  .replace(/\{\{name\}\}/g, recipient.name || email.split("@")[0]);

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
      if (attachments.length > 0) mailOptions.attachments = attachments;

      await smtp.transporter.sendMail(mailOptions);

      broadcastUpdate(job, { type: "progress", index: i, email, status: "sent" });
      succeeded++;
    } catch (error) {
      const { status, message } = classifySMTPError(error);
      console.error(`[v0] Error sending to ${email}:`, message);
      broadcastUpdate(job, { type: "progress", index: i, email, status, message });
      if (status === "bounced") {
        // TODO: future suppression list
      }
      failed++;
    }

    if (i < recipients.length - 1) {
      let waitTime = delay;
      if (autoDelay) {
        const min = minDelay * 60 * 1000;
        const max = maxDelay * 60 * 1000;
        waitTime = Math.floor(Math.random() * (max - min + 1)) + min;
      }
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  broadcastUpdate(job, { 
    type: "completed", 
    succeeded, 
    failed,
    skipped,
    stats: { total: recipients.length, valid: succeeded + failed, invalid, disposable, mxFailures, sent: succeeded }
  });
  job.status = "completed";
}

function broadcastUpdate(job: SendJob, update: SendJob["updates"][0]) {
  job.updates.push(update);
  const message = JSON.stringify(update);
  job.subscribers.forEach((subscriber) => {
    try { subscriber(message); } catch (err) { console.error("[v0] Subscriber error:", err); }
  });
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const stream = new ReadableStream({
    start(controller) {
      const subscriber = (message: string) => controller.enqueue(`data: ${message}\n\n`);
      job.subscribers.add(subscriber);
      job.updates.forEach((update) => controller.enqueue(`data: ${JSON.stringify(update)}\n\n`));
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
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}