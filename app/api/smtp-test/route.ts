import { type NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request: NextRequest) {
  try {
    const { host, port, username, password } = await request.json();

    if (!host || !port || !username || !password) {
      return NextResponse.json(
        { error: "Missing SMTP credentials" },
        { status: 400 }
      );
    }

    const smtpPort = Number(port);

    const transporter = nodemailer.createTransport({
      host: String(host).trim(),
      port: smtpPort,

      // 587 = STARTTLS
      secure: smtpPort === 465,

      auth: {
        user: String(username).trim(),
        pass: String(password),
      },

      // STARTTLS on 587
      requireTLS: smtpPort === 587,
    });

    await transporter.verify();

    return NextResponse.json({
      success: true,
      message: "SMTP connection successful",
    });
  } catch (error: any) {
    console.error("SMTP TEST ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "SMTP test failed",
        code: error?.code || null,
        response: error?.response || null,
        responseCode: error?.responseCode || null,
      },
      { status: 500 }
    );
  }
}