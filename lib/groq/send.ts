import Groq from "groq-sdk";

/**
 * =========================================================
 * GROQ API KEYS
 * =========================================================
 */

const groqKeys = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY1,
  process.env.GROQ_API_KEY2,
  process.env.GROQ_API_KEY3,
  process.env.GROQ_API_KEY4,
].filter(Boolean) as string[];

/**
 * =========================================================
 * TYPES
 * =========================================================
 */

type WarmupTemplateInput = {
  subject: string;
  body: string;

  receiver: {
    email?: string;
    username?: string;

    name?: string;
    firstName?: string;
    lastName?: string;
    company?: string;
  };
};

/**
 * =========================================================
 * MAIN PERSONALIZATION FUNCTION
 * =========================================================
 */

export async function personalizeWarmupTemplate(
  input: WarmupTemplateInput
) {
  const subject = String(
    input.subject || ""
  ).trim();

  const body = String(
    input.body || ""
  ).trim();

  const receiverEmail =
    input.receiver.email ||
    input.receiver.username ||
    "";

  console.log("");
  console.log(
    "🤖 AI PERSONALIZATION ENGINE"
  );

  console.log(
    `   Subject : "${subject}"`
  );

  console.log(
    `   Body    : ${body.length} chars`
  );

  console.log(
    `   Receiver: ${receiverEmail || "N/A"}`
  );

  console.log(
    `   Groq Keys Available : ${groqKeys.length}`
  );

  /**
   * =======================================================
   * EMPTY BODY
   * =======================================================
   */

  if (!body) {
    console.log(
      "⚠️ Empty email body. Skipping AI generation."
    );

    return {
      subject: replaceEmailVariable(
        subject,
        receiverEmail
      ),
      body: "",
    };
  }

  /**
   * =======================================================
   * NO GROQ KEYS
   * =======================================================
   */

  if (!groqKeys.length) {
    console.error(
      "❌ No Groq API keys configured."
    );

    return {
      subject: cleanupVariables(
        replaceEmailVariable(
          subject,
          receiverEmail
        )
      ),

      body: normalizeEmailHtml(
        cleanupVariables(
          replaceEmailVariable(
            body,
            receiverEmail
          )
        )
      ),
    };
  }

  /**
   * =======================================================
   * TRY ALL GROQ KEYS
   * =======================================================
   */

  for (
    let keyIndex = 0;
    keyIndex < groqKeys.length;
    keyIndex++
  ) {
    const key =
      groqKeys[keyIndex];

    const keyNumber =
      keyIndex + 1;

    const startedAt =
      Date.now();

    try {
      console.log("");
      console.log(
        `🔑 GROQ KEY ${keyNumber}/${groqKeys.length}`
      );

      console.log(
        `🚀 Request started...`
      );

      const groq =
        new Groq({
          apiKey: key,
        });

      /**
       * ===================================================
       * GROQ REQUEST
       * ===================================================
       */

      const completion =
        await groq.chat.completions.create({
          model:
            "llama-3.3-70b-versatile",

          temperature: 0.7,

          max_tokens: 700,

          messages: [
            {
              role: "system",

              content: `
You are a professional email personalization engine.

Your job is to personalize the provided email template while
preserving its original meaning.

=========================================================
SUPPORTED VARIABLES
=========================================================

The template may contain:

{{name}}
{{firstName}}
{{lastName}}
{{company}}
{{companyName}}
{{email}}

Also:

{name}
{firstName}
{lastName}
{company}
{companyName}
{email}

Also with spaces:

{{ name }}
{{ firstName }}
{{ lastName }}
{{ company }}
{{ companyName }}
{{ email }}

=========================================================
PERSONALIZATION
=========================================================

For warmup emails, generate a realistic synthetic business
contact profile.

Generate:

name
firstName
lastName
company
companyName

The values must be internally consistent.

Example:

Name:
Daniel Carter

First Name:
Daniel

Last Name:
Carter

Company:
Northstar Digital

Company Name:
Northstar Digital

Do not use celebrities, politicians, public figures, or famous
companies.

Do not use:

John Doe
Jane Doe
Test User
Demo User
Random Person

Do not use famous companies such as:

Google
Microsoft
Apple
Amazon
Meta
OpenAI
Tesla
Netflix
IBM

=========================================================
EMAIL VARIABLE
=========================================================

{{email}} and {email} MUST ALWAYS use the exact real recipient
email supplied by the application.

Never invent or modify the email address.

REAL RECIPIENT EMAIL:

${receiverEmail}

=========================================================
PLACEHOLDER RULE
=========================================================

Replace EVERY supported variable.

Never leave:

{{name}}
{{firstName}}
{{lastName}}
{{company}}
{{companyName}}
{{email}}

or their single-brace versions unresolved.

Do not leave any placeholder in the final email.

=========================================================
WRITING RULES
=========================================================

Keep the original meaning.

Do not completely rewrite the email.

Make only small natural wording changes.

Do not add unsupported claims.

Do not add fake achievements.

Do not add fake statistics.

Do not mention:

AI
Groq
warmup
testing
personalization
automation

=========================================================
HTML EMAIL RULES
=========================================================

The final email body MUST be valid email-safe HTML.

DO NOT use Markdown.

NEVER output:

**bold text**

[link text](https://example.com)

*italic text*

\`\`\`
code
\`\`\`

Instead use HTML.

Bold:

<strong>bold text</strong>

Italic:

<em>italic text</em>

Link:

<a href="https://example.com">example.com</a>

Paragraph:

<p>Hello Ethan,</p>

Line break:

<br>

Allowed HTML tags only:

<p>
<br>
<strong>
<b>
<em>
<i>
<a>
<ul>
<li>

Do not use:

<html>
<head>
<body>
<style>
<script>
iframe
table

unless the original email absolutely requires it.

The body must be suitable for directly passing to Nodemailer
using the "html" property.

=========================================================
IMPORTANT HTML RULE
=========================================================

Never output broken HTML.

Never output:

</strong>

unless a matching <strong> was opened.

Never output:

</b>

unless <b> was opened.

Never output Markdown formatting.

Never output raw Markdown links.

=========================================================
OUTPUT FORMAT
=========================================================

Return ONLY:

SUBJECT:
<final subject>

---BODY---

<final HTML email body>

Nothing before SUBJECT.

Nothing after the final HTML body.
`,
            },

            {
              role: "user",

              content: `
Personalize this email.

REAL RECIPIENT EMAIL:
${receiverEmail}

Use the real recipient email ONLY for {{email}}.

For the other personalization variables, generate a realistic
synthetic business contact profile.

--------------------------------------------------

ORIGINAL SUBJECT:

${subject}

--------------------------------------------------

ORIGINAL BODY:

${body}

--------------------------------------------------

Return the final personalized email using the required format.
`,
            },
          ],
        });

      /**
       * ===================================================
       * RAW RESPONSE
       * ===================================================
       */

      const raw =
        completion
          .choices[0]
          ?.message
          ?.content
          ?.trim();

      const duration =
        Date.now() -
        startedAt;

      console.log(
        `⏱️ Groq response time: ${duration}ms`
      );

      if (!raw) {
        throw new Error(
          "Groq returned an empty response"
        );
      }

      console.log(
        `📥 Groq response received`
      );

      /**
       * ===================================================
       * PARSE RESPONSE
       * ===================================================
       */

      const separator =
        "---BODY---";

      if (
        !raw.includes(separator)
      ) {
        throw new Error(
          "Missing ---BODY--- separator"
        );
      }

      const parts =
        raw.split(separator);

      /**
       * ===================================================
       * SUBJECT
       * ===================================================
       */

      let finalSubject =
        parts[0]
          ?.replace(
            /^SUBJECT\s*:\s*/i,
            ""
          )
          .trim() || subject;

      /**
       * ===================================================
       * BODY
       * ===================================================
       */

      let finalBody =
        parts
          .slice(1)
          .join(separator)
          .trim();

      if (!finalBody) {
        throw new Error(
          "Groq returned an empty email body"
        );
      }

      /**
       * ===================================================
       * CLEAN AI OUTPUT
       * ===================================================
       */

      finalSubject =
        cleanAIOutput(
          finalSubject
        );

      finalBody =
        cleanAIOutput(
          finalBody
        );

      /**
       * ===================================================
       * RESOLVE EMAIL
       * ===================================================
       */

      finalSubject =
        replaceEmailVariable(
          finalSubject,
          receiverEmail
        );

      finalBody =
        replaceEmailVariable(
          finalBody,
          receiverEmail
        );

      /**
       * ===================================================
       * CONVERT / CLEAN HTML
       * ===================================================
       */

      finalBody =
        normalizeEmailHtml(
          finalBody
        );

      /**
       * ===================================================
       * REMOVE OUTER HTML DOCUMENT
       * ===================================================
       */

      finalBody =
        stripOuterHtmlDocument(
          finalBody
        );

      /**
       * ===================================================
       * VALIDATE VARIABLES
       * ===================================================
       */

      const unresolved =
        findUnresolvedVariables(
          `${finalSubject}\n${finalBody}`
        );

      if (
        unresolved.length
      ) {
        console.warn(
          `⚠️ Unresolved variables: ${unresolved.join(
            ", "
          )}`
        );

        throw new Error(
          `AI left unresolved variables: ${unresolved.join(
            ", "
          )}`
        );
      }

      /**
       * ===================================================
       * VALIDATE EMAIL
       * ===================================================
       */

      if (
        receiverEmail &&
        finalBody.includes(
          "{{email}}"
        )
      ) {
        throw new Error(
          "Email placeholder still exists after replacement"
        );
      }

      /**
       * ===================================================
       * SUCCESS
       * ===================================================
       */

      console.log("");
      console.log(
        `✅ AI PERSONALIZATION SUCCESS`
      );

      console.log(
        `   Groq Key : ${keyNumber}/${groqKeys.length}`
      );

      console.log(
        `   Subject  : "${finalSubject}"`
      );

      console.log(
        `   Body     : ${finalBody.length} chars`
      );

      console.log(
        `   Duration : ${duration}ms`
      );

      console.log(
        `   Format   : HTML`
      );

      console.log(
        `   Status   : SUCCESS`
      );

      return {
        subject: finalSubject,
        body: finalBody,
      };
    } catch (error: any) {
      const duration =
        Date.now() -
        startedAt;

      const message =
        error?.message ||
        String(error);

      console.error("");
      console.error(
        `❌ GROQ KEY ${keyNumber} FAILED`
      );

      console.error(
        `   Duration : ${duration}ms`
      );

      console.error(
        `   Error    : ${message}`
      );

      /**
       * ===================================================
       * RATE LIMIT
       * ===================================================
       */

      if (
        error?.status === 429 ||
        error?.code ===
          "rate_limit_exceeded" ||
        message.includes("429") ||
        message
          .toLowerCase()
          .includes("rate limit")
      ) {
        console.warn(
          `⏳ Groq key ${keyNumber} rate limited`
        );
      }

      if (
        keyIndex <
        groqKeys.length - 1
      ) {
        console.log(
          `➡️ Switching to Groq key ${
            keyNumber + 1
          }...`
        );
      }
    }
  }

  /**
   * =======================================================
   * ALL GROQ KEYS FAILED
   * =======================================================
   */

  console.error("");
  console.error(
    "❌ ALL GROQ KEYS FAILED"
  );

  console.error(
    "⚠️ Using safe local fallback"
  );

  const fallbackSubject =
    cleanupVariables(
      replaceEmailVariable(
        subject,
        receiverEmail
      )
    );

  const fallbackBody =
    normalizeEmailHtml(
      cleanupVariables(
        replaceEmailVariable(
          body,
          receiverEmail
        )
      )
    );

  return {
    subject:
      fallbackSubject,

    body:
      stripOuterHtmlDocument(
        fallbackBody
      ),
  };
}

/**
 * =========================================================
 * CLEAN AI OUTPUT
 * =========================================================
 */

function cleanAIOutput(
  value: string
) {
  return value
    .replace(
      /^```(?:html|text)?\s*/i,
      ""
    )
    .replace(
      /\s*```$/i,
      ""
    )
    .replace(
      /^SUBJECT\s*:\s*/i,
      ""
    )
    .trim();
}

/**
 * =========================================================
 * NORMALIZE EMAIL HTML
 * =========================================================
 *
 * Converts accidental Markdown into HTML.
 */

function normalizeEmailHtml(
  html: string
) {
  let result =
    String(html || "")
      .trim();

  /**
   * -------------------------------------------------------
   * Remove code fences
   * -------------------------------------------------------
   */

  result =
    result
      .replace(
        /^```html\s*/i,
        ""
      )
      .replace(
        /^```\s*/i,
        ""
      )
      .replace(
        /\s*```$/i,
        ""
      );

  /**
   * -------------------------------------------------------
   * Markdown links
   *
   * [Example](https://example.com)
   * ->
   * <a href="https://example.com">Example</a>
   * -------------------------------------------------------
   */

  result =
    result.replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi,
      (
        _match,
        text,
        url
      ) => {
        return `<a href="${escapeHtmlAttribute(
          url
        )}">${escapeHtml(
          text
        )}</a>`;
      }
    );

  /**
   * -------------------------------------------------------
   * Markdown bold
   *
   * **text**
   * ->
   * <strong>text</strong>
   * -------------------------------------------------------
   */

  result =
    result.replace(
      /\*\*(.*?)\*\*/gs,
      "<strong>$1</strong>"
    );

  /**
   * -------------------------------------------------------
   * Markdown italic
   *
   * *text*
   * ->
   * <em>text</em>
   * -------------------------------------------------------
   */

  result =
    result.replace(
      /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
      "<em>$1</em>"
    );

  /**
   * -------------------------------------------------------
   * Convert plain URLs to links
   * -------------------------------------------------------
   */

  result =
    result.replace(
      /(?<!["'=])(https?:\/\/[^\s<]+)/gi,
      (
        _match,
        url
      ) => {
        const cleanUrl =
          url.replace(
            /[.,!?;:)\]]+$/,
            ""
          );

        return `<a href="${escapeHtmlAttribute(
          cleanUrl
        )}">${escapeHtml(
          cleanUrl
        )}</a>`;
      }
    );

  /**
   * -------------------------------------------------------
   * Fix common malformed closing tags
   * -------------------------------------------------------
   */

  result =
    result
      .replace(
        /<strong>\s*<\/strong>/gi,
        ""
      )
      .replace(
        /<b>\s*<\/b>/gi,
        ""
      )
      .replace(
        /<em>\s*<\/em>/gi,
        ""
      )
      .replace(
        /<i>\s*<\/i>/gi,
        ""
      );

  /**
   * -------------------------------------------------------
   * Remove accidental standalone broken closing tags
   * -------------------------------------------------------
   *
   * This specifically prevents:
   *
   * </strong>
   *
   * appearing in the actual email.
   * -------------------------------------------------------
   */

  result =
    result
      .replace(
        /(^|[\s>])<\/strong>(?=\s|$)/gi,
        "$1"
      )
      .replace(
        /(^|[\s>])<\/b>(?=\s|$)/gi,
        "$1"
      )
      .replace(
        /(^|[\s>])<\/em>(?=\s|$)/gi,
        "$1"
      )
      .replace(
        /(^|[\s>])<\/i>(?=\s|$)/gi,
        "$1"
      );

  /**
   * -------------------------------------------------------
   * Convert plain text lines to paragraphs
   * -------------------------------------------------------
   */

  if (
    !/<(?:p|div|br|ul|ol|li|strong|b|em|i|a)\b/i.test(
      result
    )
  ) {
    const lines =
      result
        .split(/\n\s*\n/)
        .map(
          (line) =>
            line.trim()
        )
        .filter(Boolean);

    if (lines.length) {
      result =
        lines
          .map(
            (line) =>
              `<p>${line
                .replace(
                  /\n/g,
                  "<br>"
                )
                .trim()}</p>`
          )
          .join("\n");
    }
  }

  return result.trim();
}

/**
 * =========================================================
 * STRIP OUTER HTML DOCUMENT
 * =========================================================
 */

function stripOuterHtmlDocument(
  html: string
) {
  return String(html || "")
    .replace(
      /<!DOCTYPE[^>]*>/gi,
      ""
    )
    .replace(
      /<\/?html[^>]*>/gi,
      ""
    )
    .replace(
      /<head[\s\S]*?<\/head>/gi,
      ""
    )
    .replace(
      /<\/?body[^>]*>/gi,
      ""
    )
    .trim();
}

/**
 * =========================================================
 * EMAIL VARIABLE
 * =========================================================
 */

function replaceEmailVariable(
  text: string,
  email: string
) {
  return String(text || "")
    .replace(
      /\{\{\s*email\s*\}\}/gi,
      email
    )
    .replace(
      /\{\s*email\s*\}/gi,
      email
    );
}

/**
 * =========================================================
 * FIND UNRESOLVED VARIABLES
 * =========================================================
 */

function findUnresolvedVariables(
  text: string
) {
  const matches =
    text.match(
      /\{\{\s*(name|firstName|lastName|company|companyName|email)\s*\}\}|\{\s*(name|firstName|lastName|company|companyName|email)\s*\}/gi
    );

  return [
    ...new Set(
      matches || []
    ),
  ];
}

/**
 * =========================================================
 * SAFE LOCAL FALLBACK
 * =========================================================
 */

function cleanupVariables(
  text: string
) {
  return String(text || "")
    /**
     * Double braces
     */
    .replace(
      /\{\{\s*name\s*\}\}/gi,
      ""
    )
    .replace(
      /\{\{\s*firstName\s*\}\}/gi,
      ""
    )
    .replace(
      /\{\{\s*lastName\s*\}\}/gi,
      ""
    )
    .replace(
      /\{\{\s*company\s*\}\}/gi,
      "your company"
    )
    .replace(
      /\{\{\s*companyName\s*\}\}/gi,
      "your company"
    )

    /**
     * Single braces
     */
    .replace(
      /\{\s*name\s*\}/gi,
      ""
    )
    .replace(
      /\{\s*firstName\s*\}/gi,
      ""
    )
    .replace(
      /\{\s*lastName\s*\}/gi,
      ""
    )
    .replace(
      /\{\s*company\s*\}/gi,
      "your company"
    )
    .replace(
      /\{\s*companyName\s*\}/gi,
      "your company"
    )

    /**
     * Cleanup excessive whitespace
     */
    .replace(
      /[ \t]{2,}/g,
      " "
    )
    .replace(
      /\n{3,}/g,
      "\n\n"
    )
    .trim();
}

/**
 * =========================================================
 * HTML ESCAPE
 * =========================================================
 */

function escapeHtml(
  value: string
) {
  return String(value || "")
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

/**
 * =========================================================
 * HTML ATTRIBUTE ESCAPE
 * =========================================================
 */

function escapeHtmlAttribute(
  value: string
) {
  return String(value || "")
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    );
}