import { type NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import nodemailer from "nodemailer";
// import { PrismaClient } from "@prisma/client";
import dns from "dns/promises";
import { sendGmailEmail } from "@/services/email/gmail.service";
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
    skipped?: number;
    stats?: {
      total: number;
      valid: number;
      invalid: number;
      disposable: number;
      mxFailures: number;
      sent: number;
    };
  }>;

  subscribers: Set<(data: string) => void>;
}

interface EmailAccount {
  id: string;

  provider: "SMTP" | "GMAIL" | "OUTLOOK";

  host: string | null;
  port: number | null;

  username: string | null;
  password: string | null;

  senderEmail: string;
  senderName?: string | null;

  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiry?: Date | null;

  transporter?: nodemailer.Transporter;
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

const validationCache = new Map<
  string,
  {
    valid: boolean;
    reason?: string;
    timestamp: number;
  }
>();

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "yopmail.com",
  "throwawaymail.com",
  "temp-mail.org",
]);

// ======================================================
// EMAIL NORMALIZATION
// ======================================================

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

// ======================================================
// EMAIL SYNTAX VALIDATION
// ======================================================

function validateSyntax(email: string): boolean {
  if (!email || !email.includes("@")) {
    return false;
  }

  const [local, domain] = email.split("@");

  if (
    !local ||
    local.length > 64 ||
    !domain ||
    domain.length > 255
  ) {
    return false;
  }

  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(
    email
  );
}

// ======================================================
// MX CHECK
// ======================================================

async function checkMX(domain: string): Promise<boolean> {
  try {
    const mx = await dns.resolveMx(domain);

    return mx && mx.length > 0;
  } catch {
    return false;
  }
}

// ======================================================
// DISPOSABLE CHECK
// ======================================================

function isDisposable(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain);
}

// ======================================================
// ERROR CLASSIFICATION
// ======================================================

function classifySMTPError(error: any): {
  status: string;
  message: string;
} {
  const msg = (
    error?.message ||
    ""
  ).toLowerCase();

  if (
    msg.includes("550") ||
    msg.includes("user not found") ||
    msg.includes("recipient rejected") ||
    msg.includes("mailbox unavailable")
  ) {
    return {
      status: "bounced",
      message: "Recipient does not exist",
    };
  }

  if (msg.includes("quota")) {
    return {
      status: "failed",
      message: "Mailbox quota exceeded",
    };
  }

  if (
    msg.includes("auth") ||
    msg.includes("unauthorized") ||
    msg.includes("invalid_grant")
  ) {
    return {
      status: "failed",
      message: "Authentication failed",
    };
  }

  if (
    msg.includes("timeout") ||
    msg.includes("connection refused")
  ) {
    return {
      status: "failed",
      message: "Connection timeout",
    };
  }

  return {
    status: "failed",
    message: msg || "Unknown error",
  };
}

// ======================================================
// RECIPIENT VALIDATION
// ======================================================

async function validateRecipient(
  email: string
): Promise<ValidationResult> {
  const normalized = normalizeEmail(email);

  const cacheKey = normalized;

  const cached =
    validationCache.get(cacheKey);

  if (
    cached &&
    Date.now() - cached.timestamp < 3600000
  ) {
    return {
      valid: cached.valid,
      reason: cached.reason,
      normalizedEmail: normalized,
    };
  }

  console.log(
    `Validating recipient: ${normalized}`
  );

  // Syntax
  if (!validateSyntax(normalized)) {
    const result = {
      valid: false,
      reason: "Invalid syntax",
      normalizedEmail: normalized,
    };

    validationCache.set(cacheKey, {
      ...result,
      timestamp: Date.now(),
    });

    return result;
  }

  const domain =
    normalized.split("@")[1];

  // Disposable
  if (isDisposable(domain)) {
    const result = {
      valid: false,
      reason: "Disposable email",
      normalizedEmail: normalized,
    };

    validationCache.set(cacheKey, {
      ...result,
      timestamp: Date.now(),
    });

    return result;
  }

  // MX
  const hasMX = await checkMX(domain);

  if (!hasMX) {
    const result = {
      valid: false,
      reason: "Domain has no MX records",
      normalizedEmail: normalized,
    };

    validationCache.set(cacheKey, {
      ...result,
      timestamp: Date.now(),
    });

    return result;
  }

  const result = {
    valid: true,
    normalizedEmail: normalized,
  };

  validationCache.set(cacheKey, {
    valid: true,
    timestamp: Date.now(),
  });

  return result;
}

// ======================================================
// SPIN GREETING
// ======================================================

async function getSpinGreetings(
  userId: string
) {
  const greetings =
    await prisma.spinGreeting.findMany({
      where: {
        userId,
        spixwork: true,
      },

      select: {
        value: true,
      },
    });

  return greetings
    .map((g) => g.value)
    .filter(Boolean);
}

function randomGreeting(
  greetings: string[]
) {
  if (greetings.length === 0) {
    return "Hi";
  }

  return greetings[
    Math.floor(
      Math.random() * greetings.length
    )
  ];
}

// ======================================================
// POST - START EMAIL JOB
// ======================================================

export async function POST(
  request: NextRequest
) {
  try {
    const formData =
      await request.formData();

    const subject =
      formData.get("subject") as string;

    const userId =
      formData.get("userId") as string;

    const body =
      formData.get("body") as string;

    const delay =
      Number.parseInt(
        formData.get("delay") as string
      ) || 500;

    const autoDelay =
      formData.get("autoDelay") === "true";

    const minDelay =
      Number(
        formData.get("minDelay")
      ) || 1;

    const maxDelay =
      Number(
        formData.get("maxDelay")
      ) || 2;

    const shuffle =
      formData.get("shuffle") === "true";

    const spinGreeting =
      formData.get("spinGreeting") ===
      "true";

    const recipientsRaw =
      formData.get("recipients") as string;

    let recipients: Recipient[] =
      recipientsRaw
        ? JSON.parse(recipientsRaw)
        : [];

    // ==================================================
    // USER CHECK
    // ==================================================

    if (!userId) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // ==================================================
    // REQUIRED FIELDS
    // ==================================================

    if (
      !subject ||
      !body ||
      !recipients.length
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields",
        },
        {
          status: 400,
        }
      );
    }

    // ==================================================
    // LOAD EMAIL ACCOUNTS
    // ==================================================

    let emailAccounts: EmailAccount[] =
      [];

    // ==================================================
    // SINGLE ACTIVE ACCOUNT
    // ==================================================

    if (!shuffle) {
      const account =
        await prisma.sMTPConfig.findFirst({
          where: {
            userId,
            isActive: true,
          },
        });

      if (!account) {
        return NextResponse.json(
          {
            error:
              "No active email configuration found.",
          },
          {
            status: 400,
          }
        );
      }

      // ================================================
      // GMAIL
      // ================================================

      if (
        account.provider === "GMAIL"
      ) {
        if (!account.accessToken) {
          return NextResponse.json(
            {
              error:
                "Gmail access token is missing. Please reconnect Gmail.",
            },
            {
              status: 400,
            }
          );
        }

        emailAccounts.push({
          id: account.id,

          provider: "GMAIL",

          host: account.host,
          port: account.port,

          username:
            account.username,

          password:
            account.password,

          senderEmail:
            account.senderEmail,

          senderName:
            account.senderName,

          accessToken:
            account.accessToken,

          refreshToken:
            account.refreshToken,

          tokenExpiry:
            account.tokenExpiry,
        });
      }

      // ================================================
      // SMTP
      // ================================================

      else if (
        account.provider === "SMTP"
      ) {
        if (
          !account.host ||
          !account.port ||
          !account.username ||
          !account.password
        ) {
          return NextResponse.json(
            {
              error:
                "SMTP configuration is incomplete.",
            },
            {
              status: 400,
            }
          );
        }

        try {
          const transporter =
            nodemailer.createTransport({
              host: account.host,

              port: account.port,

              secure:
                account.port === 465,

              auth: {
                user:
                  account.username,

                pass:
                  account.password,
              },
            });

          await transporter.verify();

          emailAccounts.push({
            id: account.id,

            provider: "SMTP",

            host: account.host,

            port: account.port,

            username:
              account.username,

            password:
              account.password,

            senderEmail:
              account.senderEmail,

            senderName:
              account.senderName,

            transporter,
          });
        } catch (error) {
          console.error(
            "[EMAIL] SMTP verification error:",
            error
          );

          return NextResponse.json(
            {
              error:
                "Failed to verify SMTP configuration.",
            },
            {
              status: 400,
            }
          );
        }
      }

      // ================================================
      // OUTLOOK - NOT IMPLEMENTED YET
      // ================================================

      else {
        return NextResponse.json(
          {
            error:
              `Provider ${account.provider} is not supported yet.`,
          },
          {
            status: 400,
          }
        );
      }
    }

    // ==================================================
    // MULTIPLE / SHUFFLE ACCOUNTS
    // ==================================================

    else {
      const accounts =
        await prisma.sMTPConfig.findMany({
          where: {
            userId,
            isActive: true,
          },
        });

      if (accounts.length === 0) {
        return NextResponse.json(
          {
            error:
              "No active email configurations found.",
          },
          {
            status: 400,
          }
        );
      }

      for (const account of accounts) {
        // ==============================================
        // GMAIL
        // ==============================================

        if (
          account.provider === "GMAIL"
        ) {
          if (!account.accessToken) {
            console.warn(
              `[EMAIL] Skipping Gmail ${account.senderEmail}: access token missing`
            );

            continue;
          }

          emailAccounts.push({
            id: account.id,

            provider: "GMAIL",

            host: account.host,
            port: account.port,

            username:
              account.username,

            password:
              account.password,

            senderEmail:
              account.senderEmail,

            senderName:
              account.senderName,

            accessToken:
              account.accessToken,

            refreshToken:
              account.refreshToken,

            tokenExpiry:
              account.tokenExpiry,
          });

          continue;
        }

        // ==============================================
        // SMTP
        // ==============================================

        if (
          account.provider === "SMTP"
        ) {
          if (
            !account.host ||
            !account.port ||
            !account.username ||
            !account.password
          ) {
            console.warn(
              `[EMAIL] Skipping incomplete SMTP ${account.senderEmail}`
            );

            continue;
          }

          try {
            const transporter =
              nodemailer.createTransport({
                host: account.host,

                port: account.port,

                secure:
                  account.port ===
                  465,

                auth: {
                  user:
                    account.username,

                  pass:
                    account.password,
                },
              });

            await transporter.verify();

            emailAccounts.push({
              id: account.id,

              provider: "SMTP",

              host: account.host,

              port: account.port,

              username:
                account.username,

              password:
                account.password,

              senderEmail:
                account.senderEmail,

              senderName:
                account.senderName,

              transporter,
            });
          } catch (error) {
            console.error(
              `[EMAIL] Failed to verify SMTP ${account.host}:`,
              error
            );
          }

          continue;
        }

        // OUTLOOK ignored for now
        console.warn(
          `[EMAIL] Provider ${account.provider} is not supported yet.`
        );
      }

      if (
        emailAccounts.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "No valid email configurations could be verified.",
          },
          {
            status: 400,
          }
        );
      }
    }

    // ==================================================
    // DEDUPLICATE RECIPIENTS
    // ==================================================

    const seen =
      new Set<string>();

    recipients =
      recipients.filter(
        (recipient) => {
          const normalized =
            normalizeEmail(
              recipient.email
            );

          if (
            seen.has(normalized)
          ) {
            return false;
          }

          seen.add(normalized);

          return true;
        }
      );

    // ==================================================
    // CREATE JOB
    // ==================================================

    const jobId =
      randomBytes(16).toString(
        "hex"
      );

    const job: SendJob = {
      id: jobId,

      status: "running",

      updates: [],

      subscribers:
        new Set(),
    };

    jobs.set(jobId, job);

    // ==================================================
    // START BACKGROUND JOB
    // ==================================================

    processSendJob(jobId, {
      subject,

      body,

      delay,

      autoDelay,

      minDelay,

      maxDelay,

      recipients,

      formData,

      emailAccounts,

      spinGreeting,

      userId,
    }).catch((error) => {
      console.error(
        "[EMAIL] Send job error:",
        error
      );

      const currentJob =
        jobs.get(jobId);

      if (currentJob) {
        currentJob.status =
          "stopped";

        broadcastUpdate(
          currentJob,
          {
            type: "completed",

            succeeded: 0,

            failed:
              recipients.length,
          }
        );
      }
    });

    return NextResponse.json({
      jobId,
    });
  } catch (error) {
    console.error(
      "[EMAIL] POST error:",
      error
    );

    const message =
      error instanceof Error
        ? error.message
        : "Unknown error";

    return NextResponse.json(
      {
        error:
          `Failed to start send job: ${message}`,
      },
      {
        status: 500,
      }
    );
  }
}

// ======================================================
// PROCESS SEND JOB
// ======================================================

async function processSendJob(
  jobId: string,
  options: {
    subject: string;

    body: string;

    delay: number;

    autoDelay: boolean;

    minDelay: number;

    maxDelay: number;

    spinGreeting: boolean;

    userId: string;

    recipients: Recipient[];

    formData: FormData;

    emailAccounts: EmailAccount[];
  }
) {
  const job =
    jobs.get(jobId);

  if (!job) {
    return;
  }

  const {
    subject,

    body,

    delay,

    autoDelay,

    minDelay,

    maxDelay,

    recipients,

    formData,

    emailAccounts,

    spinGreeting,

    userId,
  } = options;

  // ==================================================
  // GET GREETINGS ONCE
  // ==================================================

  let greetings: string[] =
    [];

  if (spinGreeting) {
    greetings =
      await getSpinGreetings(
        userId
      );
  }

  // ==================================================
  // COUNTERS
  // ==================================================

  let succeeded = 0;

  let failed = 0;

  let skipped = 0;

  let invalid = 0;

  let disposable = 0;

  let mxFailures = 0;

  // ==================================================
  // SEND LOOP
  // ==================================================

  for (
    let i = 0;
    i < recipients.length;
    i++
  ) {
    if (
      job.status ===
      "stopped"
    ) {
      break;
    }

    const recipient =
      recipients[i];

    let email =
      recipient.email;

    // ================================================
    // VALIDATE
    // ================================================

    const validation =
      await validateRecipient(
        email
      );

    if (!validation.valid) {
      console.log(
        `Skipping invalid: ${email} - ${validation.reason}`
      );

      const reason =
        validation.reason ||
        "Invalid email";

      broadcastUpdate(
        job,
        {
          type: "progress",

          index: i,

          email,

          status: "skipped",

          message: reason,
        }
      );

      skipped++;

      if (
        reason
          .toLowerCase()
          .includes("syntax") ||
        reason
          .toLowerCase()
          .includes("invalid")
      ) {
        invalid++;
      }

      if (
        reason
          .toLowerCase()
          .includes("disposable")
      ) {
        disposable++;
      }

      if (
        reason
          .toLowerCase()
          .includes("mx")
      ) {
        mxFailures++;
      }

      continue;
    }

    email =
      validation.normalizedEmail!;

    // ================================================
    // SELECT ACCOUNT
    // ================================================

    const account =
      emailAccounts[
        i % emailAccounts.length
      ];

    const senderEmail =
      account.senderEmail;

    const senderName =
      account.senderName || "";

    broadcastUpdate(
      job,
      {
        type: "progress",

        index: i,

        email,

        status: "sending",
      }
    );

    try {
      // ==============================================
      // PERSONALIZE BODY
      // ==============================================

      let personalizedBody =
        body;

      // Spin greeting
      if (spinGreeting) {
        personalizedBody =
          personalizedBody.replace(
            /\{\{greeting\}\}/g,
            randomGreeting(
              greetings
            )
          );
      }

      // Name
      personalizedBody =
        personalizedBody.replace(
          /\{\{name\}\}/g,
          recipient.name ||
            email.split("@")[0]
        );

      // ==============================================
      // ATTACHMENTS
      // ==============================================

      const attachments:
        nodemailer.Attachment[] =
        [];

      // Single attachment
      const singleAttachment =
        formData.get(
          "singleAttachment"
        ) as File | null;

      if (singleAttachment) {
        const buffer =
          await singleAttachment.arrayBuffer();

        attachments.push({
          filename:
            singleAttachment.name,

          content:
            Buffer.from(buffer),
        });
      }

      // Per recipient attachment
      const perRecipientAttachment =
        formData.get(
          `attachment_${i}`
        ) as File | null;

      if (
        perRecipientAttachment
      ) {
        const buffer =
          await perRecipientAttachment.arrayBuffer();

        attachments.push({
          filename:
            perRecipientAttachment.name,

          content:
            Buffer.from(buffer),
        });
      }

      // ==============================================
      // SMTP
      // ==============================================

      if (
        account.provider ===
        "SMTP"
      ) {
        if (
          !account.transporter
        ) {
          throw new Error(
            "SMTP transporter is not initialized"
          );
        }

        const mailOptions:
          nodemailer.SendMailOptions =
          {
            from: senderName
              ? `${senderName} <${senderEmail}>`
              : senderEmail,

            to: email,

            subject,

            text:
              personalizedBody,

            html:
              personalizedBody,
          };

        if (
          attachments.length >
          0
        ) {
          mailOptions.attachments =
            attachments;
        }

        await account.transporter.sendMail(
          mailOptions
        );
      }

      // ==============================================
      // GMAIL
      // ==============================================

      else if (
        account.provider ===
        "GMAIL"
      ) {
        if (
          !account.accessToken
        ) {
          throw new Error(
            "Gmail access token is missing"
          );
        }

        await sendGmailEmail({
          accessToken:
            account.accessToken,

          refreshToken:
            account.refreshToken ||
            undefined,

          from:
            senderEmail,

          fromName:
            senderName ||
            undefined,

          to: email,

          subject,

          text:
            personalizedBody,

          html:
            personalizedBody,

          attachments:
            attachments.length >
            0
              ? attachments.map(
                  (attachment) => ({
                    filename:
                      attachment.filename,

                    content:
                      Buffer.isBuffer(
                        attachment.content
                      )
                        ? attachment.content
                        : Buffer.from(
                            attachment.content as any
                          ),
                  })
                )
              : undefined,
        });
      }

      // ==============================================
      // UNSUPPORTED
      // ==============================================

      else {
        throw new Error(
          `Provider ${account.provider} is not supported yet`
        );
      }

      // ==============================================
      // SUCCESS
      // ==============================================

      broadcastUpdate(
        job,
        {
          type: "progress",

          index: i,

          email,

          status: "sent",
        }
      );

      succeeded++;
    } catch (error) {
      const {
        status,
        message,
      } =
        classifySMTPError(
          error
        );

      console.error(
        `[EMAIL] Error sending to ${email}:`,
        message
      );

      broadcastUpdate(
        job,
        {
          type: "progress",

          index: i,

          email,

          status,

          message,
        }
      );

      failed++;
    }

    // ================================================
    // DELAY
    // ================================================

    if (
      i <
      recipients.length - 1
    ) {
      let waitTime =
        delay;

      if (autoDelay) {
        const min =
          minDelay *
          60 *
          1000;

        const max =
          maxDelay *
          60 *
          1000;

        waitTime =
          Math.floor(
            Math.random() *
              (max - min + 1)
          ) + min;
      }

      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            waitTime
          )
      );
    }
  }

  // ==================================================
  // COMPLETED
  // ==================================================

  broadcastUpdate(
    job,
    {
      type: "completed",

      succeeded,

      failed,

      skipped,

      stats: {
        total:
          recipients.length,

        valid:
          succeeded + failed,

        invalid,

        disposable,

        mxFailures,

        sent:
          succeeded,
      },
    }
  );

  job.status =
    "completed";
}

// ======================================================
// SSE BROADCAST
// ======================================================

function broadcastUpdate(
  job: SendJob,
  update: SendJob["updates"][0]
) {
  job.updates.push(update);

  const message =
    JSON.stringify(update);

  job.subscribers.forEach(
    (subscriber) => {
      try {
        subscriber(message);
      } catch (error) {
        console.error(
          "[EMAIL] Subscriber error:",
          error
        );
      }
    }
  );
}

// ======================================================
// GET - SSE PROGRESS
// ======================================================

export async function GET(
  request: NextRequest
) {
  const jobId =
    request.nextUrl.searchParams.get(
      "jobId"
    );

  if (!jobId) {
    return NextResponse.json(
      {
        error:
          "Missing jobId",
      },
      {
        status: 400,
      }
    );
  }

  const job =
    jobs.get(jobId);

  if (!job) {
    return NextResponse.json(
      {
        error:
          "Job not found",
      },
      {
        status: 404,
      }
    );
  }

  const stream =
    new ReadableStream({
      start(controller) {
        const subscriber =
          (message: string) => {
            controller.enqueue(
              `data: ${message}\n\n`
            );
          };

        job.subscribers.add(
          subscriber
        );

        // Send previous updates
        job.updates.forEach(
          (update) => {
            controller.enqueue(
              `data: ${JSON.stringify(
                update
              )}\n\n`
            );
          }
        );

        const interval =
          setInterval(() => {
            if (
              job.status ===
                "completed" &&
              job.subscribers.size <=
                1
            ) {
              clearInterval(
                interval
              );

              job.subscribers.delete(
                subscriber
              );

              try {
                controller.close();
              } catch {
                // already closed
              }
            }
          }, 1000);
      },

      cancel() {},
    });

  return new NextResponse(
    stream,
    {
      headers: {
        "Content-Type":
          "text/event-stream",

        "Cache-Control":
          "no-cache",

        Connection:
          "keep-alive",
      },
    }
  );
}