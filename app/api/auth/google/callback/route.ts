import { NextRequest, NextResponse } from "next/server";
import https from "https";
import { prisma } from "@/services/database/prisma";

interface GoogleTokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

interface GoogleUserInfo {
  email?: string;
  name?: string;
  picture?: string;
}

function httpsRequest<T>(
  options: https.RequestOptions,
  body?: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        ...options,
        family: 4,
        timeout: 15000,
      },
      (response) => {
        let responseBody = "";

        response.on("data", (chunk) => {
          responseBody += chunk;
        });

        response.on("end", () => {
          const statusCode = response.statusCode || 0;

          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new Error(
                `Google API error ${statusCode}: ${responseBody}`
              )
            );
            return;
          }

          try {
            resolve(JSON.parse(responseBody) as T);
          } catch {
            reject(
              new Error("Invalid JSON response from Google")
            );
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(
        new Error("Google request timed out")
      );
    });

    request.on("error", (error) => {
      reject(error);
    });

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

async function exchangeGoogleCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<GoogleTokenResponse> {
  const postData = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  }).toString();

  return httpsRequest<GoogleTokenResponse>(
    {
      hostname: "oauth2.googleapis.com",
      port: 443,
      path: "/token",
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    },
    postData
  );
}

async function getGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo> {
  return httpsRequest<GoogleUserInfo>({
    hostname: "www.googleapis.com",
    port: 443,
    path: "/oauth2/v2/userinfo",
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const oauthError = req.nextUrl.searchParams.get("error");

    // Google OAuth cancelled/failed
    if (oauthError) {
      console.error(
        "Google OAuth error:",
        oauthError
      );

      return NextResponse.redirect(
        new URL("/env?oauth=cancelled", req.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL("/env?oauth=failed", req.url)
      );
    }

    // Decode state
    let stateData: { userId: string };

    try {
      stateData = JSON.parse(
        Buffer.from(state, "base64url").toString("utf8")
      );
    } catch {
      return NextResponse.redirect(
        new URL("/env?oauth=invalid_state", req.url)
      );
    }

    const userId = stateData.userId;

    if (!userId) {
      return NextResponse.redirect(
        new URL("/env?oauth=invalid_user", req.url)
      );
    }

    // Verify logged-in user
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      return NextResponse.redirect(
        new URL("/env?oauth=user_not_found", req.url)
      );
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret =
      process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri =
      process.env.GOOGLE_REDIRECT_URI;

    if (
      !clientId ||
      !clientSecret ||
      !redirectUri
    ) {
      throw new Error(
        "Google OAuth environment variables are missing"
      );
    }

    console.log(
      "Exchanging Google authorization code..."
    );

    // --------------------------------------------------
    // 1. Exchange authorization code for Google tokens
    // --------------------------------------------------

    const tokens = await exchangeGoogleCode(
      code,
      clientId,
      clientSecret,
      redirectUri
    );

    if (!tokens.access_token) {
      throw new Error(
        "Google access token was not returned"
      );
    }

    console.log("Google token exchange successful");

    // --------------------------------------------------
    // 2. Get Google account email
    // --------------------------------------------------

    const profile = await getGoogleUserInfo(
      tokens.access_token
    );

    const senderEmail = profile.email;

    if (!senderEmail) {
      throw new Error(
        "Could not get Google account email"
      );
    }

    console.log(
      "Google account:",
      senderEmail
    );

    // --------------------------------------------------
    // 3. Calculate token expiry
    // --------------------------------------------------

    const tokenExpiry = tokens.expires_in
      ? new Date(
          Date.now() + tokens.expires_in * 1000
        )
      : null;

    // --------------------------------------------------
    // 4. Check existing account
    // --------------------------------------------------

    const existingAccount =
      await prisma.sMTPConfig.findUnique({
        where: {
          userId_senderEmail: {
            userId,
            senderEmail,
          },
        },
      });

    // --------------------------------------------------
    // 5. Update existing Gmail account
    // --------------------------------------------------

    if (existingAccount) {
      const updatedAccount =
        await prisma.sMTPConfig.update({
          where: {
            id: existingAccount.id,
          },
          data: {
            provider: "GMAIL",

            accessToken: tokens.access_token,

            refreshToken:
              tokens.refresh_token ||
              existingAccount.refreshToken,

            tokenExpiry,

            senderEmail,

            senderName:
              profile.name ||
              existingAccount.senderName,

            isActive: existingAccount.isActive,
          },
        });

      console.log(
        "Google account updated:",
        updatedAccount.senderEmail
      );
    }

    // --------------------------------------------------
    // 6. Create new Gmail account
    // --------------------------------------------------

   else {
  const newAccount = await prisma.sMTPConfig.create({
    data: {
      provider: "GMAIL",

      host: null,
      port: null,
      username: null,
      password: null,

      senderEmail,

      senderName:
        profile.name || null,

      accessToken:
        tokens.access_token,

      refreshToken:
        tokens.refresh_token || null,

      tokenExpiry,

      isActive: false,
      warmup: false,

      user: {
        connect: {
          id: userId,
        },
      },
    },
  });

  console.log(
    "Google account connected:",
    newAccount.senderEmail
  );
}

    // --------------------------------------------------
    // 7. Return to configuration page
    // --------------------------------------------------

    return NextResponse.redirect(
      new URL(
        "/env?oauth=success",
        req.url
      )
    );
  } catch (error) {
    console.error(
      "Google OAuth callback error:",
      error
    );

    return NextResponse.redirect(
      new URL(
        "/env?oauth=failed",
        req.url
      )
    );
  }
}