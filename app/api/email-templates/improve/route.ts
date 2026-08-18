import { NextResponse } from "next/server"
import { withGroqFallback, GROQ_MODEL } from "@/lib/groq"

export const runtime = "nodejs"
export const maxDuration = 45

type ImprovedEmail = {
  subject: string
  body: string
  wordCount: number
  estimatedRiskScore: number
  changedItems: string[]
}

function countWords(text: string) {
  return text
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
    .split(/\s+/)
    .filter(Boolean)
    .length
}

function validateImprovedEmail(
  data: unknown
): ImprovedEmail {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid AI response")
  }

  const value = data as Record<string, unknown>

  if (typeof value.subject !== "string") {
    throw new Error("AI returned an invalid subject")
  }

  if (typeof value.body !== "string") {
    throw new Error("AI returned an invalid email body")
  }

  const estimatedRiskScore = Number(
    value.estimatedRiskScore
  )

  if (
    !Number.isInteger(estimatedRiskScore) ||
    estimatedRiskScore < 0 ||
    estimatedRiskScore > 100
  ) {
    throw new Error(
      "AI returned an invalid risk score"
    )
  }

  const changedItems = Array.isArray(
    value.changedItems
  )
    ? value.changedItems.filter(
        (item): item is string =>
          typeof item === "string"
      )
    : []

  return {
    subject: value.subject,
    body: value.body,
    wordCount: 0,
    estimatedRiskScore,
    changedItems,
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()

    const subject =
      typeof data.subject === "string"
        ? data.subject.trim()
        : ""

    const emailBody =
      typeof data.body === "string"
        ? data.body
        : ""

    const analysis =
      data.analysis &&
      typeof data.analysis === "object"
        ? data.analysis
        : {}

    if (!subject && !emailBody) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Subject or email body is required",
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

    const originalWordCount = countWords(
      `${subject} ${emailBody}`
    )

    const completion = await withGroqFallback(
      (groq) =>
        groq.chat.completions.create({
          model: GROQ_MODEL,

          temperature: 0.35,

         messages: [
  {
    role: "system",
    content: `
You are an expert professional email editor.

Your job is to improve an email's CONTENT QUALITY and reduce unnecessary
content-based spam risk.

This is NOT an attempt to bypass spam filters or email security systems.

The goal is to make the email sound natural, professional, trustworthy,
informative, and less unnecessarily promotional while preserving factual
accuracy.

--------------------------------------------------
STRICT RULES
--------------------------------------------------

1. Preserve the original meaning.
2. Preserve the original intent.
3. Preserve all important factual information.
4. Preserve the overall structure.
5. Preserve paragraph structure.
6. Preserve headings.
7. Preserve lists.
8. Preserve links and URLs exactly.
9. Preserve template variables such as {{name}} exactly.
10. Preserve the HTML structure as closely as reasonably possible.
11. Return valid HTML.
12. Do not add new claims.
13. Do not invent offers, discounts, guarantees, statistics, features,
    benefits, or facts.
14. Do not remove important information.
15. Do not dramatically change the tone.
16. Keep approximately the same number of words.
17. Remove unnecessary urgency.
18. Reduce aggressive promotional wording.
19. Reduce excessive capitalization.
20. Reduce excessive exclamation marks.
21. Avoid manipulative language.
22. Avoid misleading promises.
23. Do not make the email sound robotic or obviously AI-generated.
24. Do not add an introduction or explanation outside the HTML.
25. Do not blindly replace words with synonyms.
26. Rewrite complete sentences naturally when needed.

--------------------------------------------------
IMPORTANT: USE THE AI ANALYSIS
--------------------------------------------------

The user provides an AI analysis containing:

- detectedWords
- detectedPhrases
- issues
- suggestions

You MUST actively review these items before generating the improved email.

The detected words and phrases are the PRIMARY areas that should be
reviewed for unnecessary promotional or aggressive wording.

Do NOT simply preserve detected wording because it existed in the original.

For every detected word:

1. Find where it appears in the subject/body.
2. Understand its context.
3. Determine whether it contributes to unnecessary promotional,
   aggressive, urgent, or manipulative wording.
4. If it does, rewrite the surrounding sentence naturally.
5. If it is factually necessary, preserve the factual meaning while
   improving the surrounding wording where possible.

For every detected phrase:

1. Find the phrase in the email.
2. Review the complete sentence containing it.
3. Rewrite the sentence naturally if the phrase contributes to
   unnecessary promotional language.
4. Preserve the factual information.

--------------------------------------------------
EXAMPLE
--------------------------------------------------

If detectedWords contains:

["free"]

and detectedPhrases contains:

["100 API requests free every month"]

Do NOT simply return:

"100 API requests free every month"

if the wording can be made more natural.

Prefer something like:

"100 API requests are included each month at no additional cost"

or:

"The plan includes 100 API requests each month at no additional cost"

Choose the wording that best fits the original email.

--------------------------------------------------
ANOTHER EXAMPLE
--------------------------------------------------

If the email contains:

"Start with a free plan that includes 100 requests/month"

and this phrase was detected, prefer a natural alternative such as:

"Begin with an introductory plan that includes 100 requests/month"

or:

"The introductory plan includes 100 requests/month"

Do NOT change the factual information.

--------------------------------------------------
SUBJECT IMPROVEMENT
--------------------------------------------------

The subject MUST also be reviewed.

If promotional wording in the subject was identified by the analysis,
rewrite it naturally.

For example:

Original:

"Developers: 100 Free WhatsApp API Requests Every Month — No Credit Card"

A more neutral version could be:

"WhatsApp API for Developers — 100 Requests Included Monthly"

However, do NOT remove factual information unnecessarily.

Do not invent new claims.

--------------------------------------------------
IMPORTANT: DO NOT BLINDLY REMOVE WORDS
--------------------------------------------------

Do NOT perform simple global replacements such as:

free → complimentary

free → zero-cost

limited → restricted

offer → opportunity

This can sound unnatural and may not improve the email.

Instead, rewrite the complete sentence or phrase naturally.

--------------------------------------------------
FACTUAL INFORMATION
--------------------------------------------------

Facts MUST remain unchanged.

For example:

100 API requests/month

must remain:

100 API requests/month

PKR 2,000/month

must remain:

PKR 2,000/month

10,000 API requests

must remain:

10,000 API requests

URLs MUST remain exactly unchanged.

Template variables such as {{name}} MUST remain exactly unchanged.

Do not invent or modify:

- pricing
- numbers
- URLs
- product capabilities
- statistics
- guarantees
- offers
- claims

--------------------------------------------------
WORD COUNT
--------------------------------------------------

Original approximate word count:

${originalWordCount}

Try to keep the rewritten version within approximately ±10% of the
original word count.

Natural writing is more important than exact word-count matching.

Do not add unnecessary content just to reach the original word count.

--------------------------------------------------
STYLE
--------------------------------------------------

The final email should sound:

- natural
- professional
- human-written
- trustworthy
- informative
- clear
- concise
- developer-friendly

Avoid:

- aggressive sales language
- excessive urgency
- exaggerated claims
- manipulative CTAs
- unnecessary promotional adjectives
- excessive capitalization
- excessive punctuation
- repetitive calls to action
- robotic AI language

--------------------------------------------------
HTML
--------------------------------------------------

The "body" field MUST contain valid HTML suitable for ReactQuill.

Allowed/common HTML:

<p>
<strong>
<em>
<u>
<h1>
<h2>
<h3>
<ul>
<ol>
<li>
<a>
<blockquote>

Preserve the existing HTML structure as closely as possible.

Preserve links exactly.

Do NOT wrap HTML in Markdown code fences.

--------------------------------------------------
FINAL SELF-CHECK
--------------------------------------------------

Before returning the response, verify:

1. Did I review every detected word?
2. Did I review every detected phrase?
3. Did I review the subject?
4. Did I address the issues from the AI analysis?
5. Did I reduce unnecessary promotional wording?
6. Did I preserve factual information?
7. Did I preserve all URLs?
8. Did I preserve all template variables?
9. Did I preserve the overall structure?
10. Is the rewritten email natural?
11. Did I avoid simple synonym replacement?
12. Is the word count approximately within ±10%?
13. Did I avoid adding new claims?
14. Did I meaningfully improve the wording where issues existed?

If a detected phrase is unnecessarily promotional, do NOT return the same
phrase unchanged.

--------------------------------------------------
RISK SCORE
--------------------------------------------------

estimatedRiskScore is only an AI estimate.

Do NOT claim that the score guarantees inbox placement.

The final and authoritative content analysis is performed separately by
the /api/email-templates/analyze endpoint after the improved email is
generated.

--------------------------------------------------
JSON OUTPUT
--------------------------------------------------

Return ONLY valid JSON.

Do NOT return Markdown.

Do NOT return an explanation.

The response MUST follow exactly this structure:

{
  "subject": "string",
  "body": "valid HTML string",
  "wordCount": 0,
  "estimatedRiskScore": 0,
  "changedItems": []
}

Rules:

- subject must be a string.
- body must be valid HTML.
- wordCount must be an integer.
- estimatedRiskScore must be an integer from 0 to 100.
- changedItems must be an array of strings.
- Do not add any other fields.
    `.trim(),
  },

  {
    role: "user",
    content: `
ORIGINAL SUBJECT:
${subject}

ORIGINAL HTML:
${emailBody}

AI ANALYSIS:
${JSON.stringify(analysis, null, 2)}

IMPORTANT:

Use the AI ANALYSIS above to identify the specific wording that needs
improvement.

Do not blindly preserve detected words or detected phrases.

Review the subject and complete email carefully, then generate a natural
improved version while preserving all factual information, URLs,
template variables, structure, and approximate word count.

Generate the improved version now.
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
      throw new Error(
        "Groq returned an empty response"
      )
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

    const result =
      validateImprovedEmail(parsed)

    // Always calculate this on the server.
    // Never trust the AI's wordCount.
    result.wordCount = countWords(
      `${result.subject} ${result.body}`
    )

    return NextResponse.json({
      success: true,
      originalWordCount,
      result,
    })
  } catch (error) {
    console.error(
      "Email improvement error:",
      error
    )

    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to improve email with AI",
      },
      { status: 500 }
    )
  }
}