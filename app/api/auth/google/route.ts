import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(req: NextRequest) {
  try {
    const userId = req.cookies.get("userId")?.value;

    if (!userId) {
      return NextResponse.json(
        {
          success: false,
          message: "Please login first",
        },
        { status: 401 }
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error("Google OAuth environment variables are missing");

      return NextResponse.json(
        {
          success: false,
          message: "Google OAuth is not configured",
        },
        { status: 500 }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const scopes = [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
    ];

    const state = Buffer.from(
      JSON.stringify({
        userId,
      })
    ).toString("base64url");

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: scopes,
      state,
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("Google OAuth start error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to start Google OAuth",
      },
      { status: 500 }
    );
  }
}