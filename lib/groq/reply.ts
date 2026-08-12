import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

function cleanEmailBody(email: any): string {
  let body = String(email.text || "").trim();

  if (!body && email.html) {
    body = String(email.html)
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return body;
}

export async function generateAIReply(email: any): Promise<string> {
  console.log("🤖 Generating reply using Groq...");

  const subject = String(email.subject || "").trim();
  const body = cleanEmailBody(email);

  if (!body) {
    return `Hi,

Thanks for your reply. I've received your message and will get back to you shortly.

Best regards`;
  }

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 180,

      messages: [
        {
          role: "system",
          content: `
You are writing a natural human email reply.

Rules:
- Understand the incoming email before replying.
- Reply according to the actual message.
- If the sender asks a question, respond naturally.
- If they say thanks, acknowledge naturally.
- Keep the reply short, usually 2-5 sentences.
- Sound like a normal human.
- Do not invent facts.
- Do not mention AI, Groq, automation, bots, warmup or testing.
- Do not use markdown.
- Do not add a subject line.
- Return only the email reply.
          `,
        },
        {
          role: "user",
          content: `
Subject:
${subject}

Incoming email:
${body}

Write the appropriate reply.
          `,
        },
      ],
    });

    const reply =
      completion.choices[0]?.message?.content?.trim();

    if (!reply) {
      throw new Error("Groq returned empty response");
    }

    console.log("✅ Groq reply generated");

    return reply;
  } catch (error) {
    console.error("❌ Groq API error:", error);

    return `Hi,

Thanks for your reply. I've received your message and will get back to you shortly.

Best regards`;
  }
}