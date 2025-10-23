import { type NextRequest, NextResponse } from "next/server"
import nodemailer from "nodemailer"

export async function POST(request: NextRequest) {
  try {
    const { host, port, username, password } = await request.json()

    if (!host || !port || !username || !password) {
      return NextResponse.json({ error: "Missing SMTP credentials" }, { status: 400 })
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      auth: {
        user: username,
        pass: password,
      },
    })

    await transporter.verify()

    return NextResponse.json({ success: true, message: "SMTP connection successful" })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: `SMTP test failed: ${message}` }, { status: 500 })
  }
}
