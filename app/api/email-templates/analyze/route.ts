import { NextResponse } from "next/server"
import {
  withGroqFallback,
  GROQ_MODEL,
} from "@/lib/groq"

export const runtime = "nodejs"
export const maxDuration = 30

type EmailAnalysis = {
  score: number
  riskLevel: "LOW" | "MEDIUM" | "HIGH"
  detectedWords: string[]
  detectedPhrases: string[]
  issues: string[]
  suggestions: string[]
}

function stripHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function validateAnalysis(data: unknown): EmailAnalysis {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid AI response")
  }

  const value = data as Record<string, unknown>

  const score = Number(value.score)

  if (
    !Number.isInteger(score) ||
    score < 0 ||
    score > 100
  ) {
    throw new Error("Invalid spam score from AI")
  }

  const riskLevel = value.riskLevel

  if (
    riskLevel !== "LOW" &&
    riskLevel !== "MEDIUM" &&
    riskLevel !== "HIGH"
  ) {
    throw new Error("Invalid risk level from AI")
  }

  const detectedWords = Array.isArray(value.detectedWords)
    ? value.detectedWords.filter(
        (item): item is string => typeof item === "string"
      )
    : []

  const detectedPhrases = Array.isArray(value.detectedPhrases)
    ? value.detectedPhrases.filter(
        (item): item is string => typeof item === "string"
      )
    : []

  const issues = Array.isArray(value.issues)
    ? value.issues.filter(
        (item): item is string => typeof item === "string"
      )
    : []

  const suggestions = Array.isArray(value.suggestions)
    ? value.suggestions.filter(
        (item): item is string => typeof item === "string"
      )
    : []

  return {
    score,
    riskLevel,
    detectedWords,
    detectedPhrases,
    issues,
    suggestions,
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const subject =
      typeof body.subject === "string"
        ? body.subject.trim()
        : ""

    const emailBody =
      typeof body.body === "string"
        ? body.body
        : ""

    if (!subject && !emailBody) {
      return NextResponse.json(
        {
          success: false,
          error: "Subject or email body is required",
        },
        { status: 400 }
      )
    }

    if (emailBody.length > 100_000) {
      return NextResponse.json(
        {
          success: false,
          error: "Email body is too large",
        },
        { status: 413 }
      )
    }

    const plainText = stripHtml(emailBody)

    const completion = await withGroqFallback((groq) =>
      groq.chat.completions.create({
        model: GROQ_MODEL,

        temperature: 0.1,

        messages: [
          {
            role: "system",
            content: `
You are an expert email content quality and spam-risk analyzer.

Analyze the provided email for CONTENT-BASED spam risk.

IMPORTANT:

- Do not claim that your score guarantees inbox placement.
- Do not judge sender reputation.
- Do not judge domain reputation.
- Do not judge SPF, DKIM, or DMARC.
- Do not judge IP reputation.
- Do not judge recipient engagement.
- Only analyze the actual subject and email content.
- Identify genuinely suspicious or excessively promotional wording.
- Do not flag normal professional/business language unnecessarily.
- Do not treat every marketing word as spam.
- Focus on:
  - excessive urgency
  - misleading claims
  - aggressive sales language
  - suspicious promises
  - excessive capitalization
  - excessive punctuation
  - manipulative wording
  - unrealistic claims
  - common content-level spam signals

SCORING:

0 = very low content risk
100 = very high content risk

Risk levels:

LOW = 0-34
MEDIUM = 35-69
HIGH = 70-100

DETECTED WORDS AND PHRASES:

You must analyze BOTH individual words AND multi-word phrases.

detectedWords:
- Return individual words that may contribute to promotional, sales-heavy,
  urgency-based, manipulative, exaggerated, or spam-like content.
- Return the EXACT word as it appears in the email whenever possible.
- Examples may include words such as:
  "free", "limited", "urgent", "bonus", "exclusive",
  "guaranteed", "deal", "offer", "discount", "save", "act", "now".
- Do NOT automatically flag normal business words.
- Only include a word when its context makes it potentially relevant.
- Keep each item to a single word whenever possible.
- Do not duplicate words.

detectedPhrases:
- Return multi-word phrases that may contribute to content-level spam risk.
- Return the EXACT phrase as it appears in the email whenever possible.
- Examples:
  "100 API requests free every month"
  "Start with a free plan"
  "Act now"
  "Limited time offer"
- Keep phrases concise.
- Do not duplicate phrases.

IMPORTANT:

If a risky promotional phrase contains a separately relevant individual
word, return BOTH.

Example:

Email:
"Get 100 API requests free every month"

Return:

"detectedWords": [
  "free"
]

"detectedPhrases": [
  "100 API requests free every month"
]

Do not return explanations inside detectedWords or detectedPhrases.

ISSUES:

Explain why the detected content may be risky.

SUGGESTIONS:

Provide practical improvements.

IMPORTANT JSON REQUIREMENT:

Return ONLY valid JSON.

Do NOT return Markdown.

Do NOT return:

\`\`\`json

Do NOT return any explanation before or after the JSON.

The response MUST follow EXACTLY this structure:

{
  "score": 0,
  "riskLevel": "LOW",
  "detectedWords": [],
  "detectedPhrases": [],
  "issues": [],
  "suggestions": []
}

Rules:

- score must be an integer between 0 and 100.
- riskLevel must be exactly LOW, MEDIUM, or HIGH.
- detectedWords must be an array of strings.
- detectedPhrases must be an array of strings.
- issues must be an array of strings.
- suggestions must be an array of strings.
            `.trim(),
          },

          {
            role: "user",
            content: `
SUBJECT:

${subject}

EMAIL HTML:

${emailBody}

PLAIN TEXT:

${plainText}

Analyze this email now.
            `.trim(),
          },
        ],

        response_format: {
          type: "json_object",
        },
      })
    )

    const content =
      completion.choices[0]?.message?.content

    if (!content) {
      throw new Error("Groq returned an empty response")
    }

    let parsed: unknown

    try {
      parsed = JSON.parse(content)
    } catch {
      console.error(
        "Invalid JSON returned by Groq:",
        content
      )

      throw new Error(
        "AI returned an invalid JSON response"
      )
    }

    const analysis = validateAnalysis(parsed)

    return NextResponse.json({
      success: true,
      analysis,
    })
  } catch (error) {
    console.error(
      "Email analysis error:",
      error
    )

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to analyze email with AI",
      },
      { status: 500 }
    )
  }
}