import { type NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import nodemailer from "nodemailer"

interface SendJob {
  id: string
  status: "running" | "completed" | "stopped"
  updates: Array<{
    type: "progress" | "completed"
    index?: number
    email?: string
    status?: string
    message?: string
    succeeded?: number
    failed?: number
  }>
  subscribers: Set<(data: string) => void>
}

const jobs = new Map<string, SendJob>()

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()

    const senderEmail = formData.get("senderEmail") as string
    const senderName = formData.get("senderName") as string
    const subject = formData.get("subject") as string
    const body = formData.get("body") as string
    const delay = Number.parseInt(formData.get("delay") as string) || 500
    const recipients = JSON.parse(formData.get("recipients") as string)

    const smtpHost = request.headers.get("x-smtp-host") || process.env.SMTP_HOST
    const smtpPort = Number.parseInt(request.headers.get("x-smtp-port") || process.env.SMTP_PORT || "2525")
    const smtpUsername = request.headers.get("x-smtp-username") || process.env.SMTP_USERNAME
    const smtpPassword = request.headers.get("x-smtp-password") || process.env.SMTP_PASSWORD

    if (!senderEmail || !subject || !body || !recipients.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!smtpHost || !smtpUsername || !smtpPassword) {
      return NextResponse.json({ error: "SMTP configuration missing" }, { status: 400 })
    }

    const jobId = randomBytes(16).toString("hex")
    const job: SendJob = {
      id: jobId,
      status: "running",
      updates: [],
      subscribers: new Set(),
    }

    jobs.set(jobId, job)

    processSendJob(jobId, {
      senderEmail,
      senderName,
      subject,
      body,
      delay,
      recipients,
      formData,
      smtpHost,
      smtpPort,
      smtpUsername,
      smtpPassword,
    }).catch((error) => {
      console.error("[v0] Send job error:", error)
      job.status = "stopped"
      broadcastUpdate(job, {
        type: "completed",
        succeeded: 0,
        failed: recipients.length,
      })
    })

    return NextResponse.json({ jobId })
  } catch (error) {
    console.error("[v0] POST error:", error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `Failed to start send job: ${message}` }, { status: 500 })
  }
}

async function processSendJob(
  jobId: string,
  options: {
    senderEmail: string
    senderName: string
    subject: string
    body: string
    delay: number
    recipients: string[]
    formData: FormData
    smtpHost: string
    smtpPort: number
    smtpUsername: string
    smtpPassword: string
  },
) {
  const job = jobs.get(jobId)
  if (!job) return

  const {
    senderEmail,
    senderName,
    subject,
    body,
    delay,
    recipients,
    formData,
    smtpHost,
    smtpPort,
    smtpUsername,
    smtpPassword,
  } = options

  let transporter
  try {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUsername,
        pass: smtpPassword,
      },
    })

    // Verify connection
    await transporter.verify()
  } catch (error) {
    console.error("[v0] SMTP connection error:", error)
    broadcastUpdate(job, {
      type: "completed",
      succeeded: 0,
      failed: recipients.length,
    })
    job.status = "completed"
    return
  }

  let succeeded = 0
  let failed = 0

  for (let i = 0; i < recipients.length; i++) {
    if (job.status === "stopped") break

    const email = recipients[i]

    // Notify progress
    broadcastUpdate(job, {
      type: "progress",
      index: i,
      email,
      status: "sending",
    })

    try {
      const mailOptions: any = {
        from: senderName ? `${senderName} <${senderEmail}>` : senderEmail,
        to: email,
        subject,
        text: body.replace(/\{\{name\}\}/g, email.split("@")[0]),
        html: body.replace(/\{\{name\}\}/g, email.split("@")[0]),
        attachments: [],
      }

      const singleAttachment = formData.get("singleAttachment") as File | null
      if (singleAttachment) {
        const buffer = await singleAttachment.arrayBuffer()
        mailOptions.attachments.push({
          filename: singleAttachment.name,
          content: Buffer.from(buffer),
        })
        console.log(`[v0] Added single attachment for recipient ${i}: ${singleAttachment.name}`)
      }

      const perRecipientAttachment = formData.get(`attachment_${i}`) as File | null
      if (perRecipientAttachment) {
        const buffer = await perRecipientAttachment.arrayBuffer()
        mailOptions.attachments.push({
          filename: perRecipientAttachment.name,
          content: Buffer.from(buffer),
        })
        console.log(`[v0] Added per-recipient attachment for recipient ${i}: ${perRecipientAttachment.name}`)
      }

      // Remove empty attachments array if no files were added
      if (mailOptions.attachments.length === 0) {
        delete mailOptions.attachments
      }

      await transporter.sendMail(mailOptions)

      // Notify success
      broadcastUpdate(job, {
        type: "progress",
        index: i,
        email,
        status: "sent",
      })

      succeeded++
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      console.error(`[v0] Error sending to ${email}:`, message)

      // Notify error
      broadcastUpdate(job, {
        type: "progress",
        index: i,
        email,
        status: "error",
        message,
      })

      failed++
    }

    // Wait for delay
    if (i < recipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  // Notify completion
  broadcastUpdate(job, {
    type: "completed",
    succeeded,
    failed,
  })

  job.status = "completed"
}

function broadcastUpdate(job: SendJob, update: SendJob["updates"][0]) {
  job.updates.push(update)
  const message = JSON.stringify(update)

  job.subscribers.forEach((subscriber) => {
    try {
      subscriber(message)
    } catch (error) {
      console.error("[v0] Error sending update:", error)
    }
  })
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId")

  if (!jobId) {
    return NextResponse.json({ error: "Missing jobId" }, { status: 400 })
  }

  const job = jobs.get(jobId)
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  // Return SSE stream
  const stream = new ReadableStream({
    start(controller) {
      const subscriber = (message: string) => {
        controller.enqueue(`data: ${message}\n\n`)
      }

      job.subscribers.add(subscriber)

      // Send existing updates
      job.updates.forEach((update) => {
        controller.enqueue(`data: ${JSON.stringify(update)}\n\n`)
      })

      // Keep connection alive
      const interval = setInterval(() => {
        if (job.status === "completed" && job.subscribers.size === 1) {
          clearInterval(interval)
          job.subscribers.delete(subscriber)
          controller.close()
        }
      }, 1000)
    },
  })

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
