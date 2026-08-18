import Groq from "groq-sdk";

const groqKeys = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY1,
  process.env.GROQ_API_KEY2,
  process.env.GROQ_API_KEY3,
  process.env.GROQ_API_KEY4,
  process.env.GROQ_API_KEY5,
].filter(Boolean) as string[];

function cleanEmailBody(email: any): string {
  let body = String(email.body || "").trim();

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

const fallbackReply = `Hi,

Thanks for your reply. I've received your message and will get back to you shortly.

Best regards`;

export async function generateAIReply(email: any): Promise<string> {
  console.log("🤖 Generating reply using Groq...");

  const subject = String(email.subject || "").trim();
  const body = cleanEmailBody(email);

  console.log("📧 Email subject:", subject);
  console.log("📧 Email body:", body);

  if (!body) {
    return fallbackReply;
  }

  if (groqKeys.length === 0) {
    console.error("❌ No Groq API keys configured");
    return fallbackReply;
  }

  for (let i = 0; i < groqKeys.length; i++) {
    const key = groqKeys[i];

    try {
      console.log(`🔑 Trying Groq API key ${i + 1}/${groqKeys.length}`);

      const groq = new Groq({
        apiKey: key,
      });

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
- In place of {variable_name}, use a random USA person's name.
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

      const reply = completion.choices[0]?.message?.content?.trim();

      if (!reply) {
        throw new Error("Groq returned empty response");
      }

      console.log(`✅ Groq reply generated using API key ${i + 1}`);

      return reply;

    } catch (error: any) {
      console.error(`❌ Groq API key ${i + 1} failed:`, error?.message || error);

      if (i < groqKeys.length - 1) {
        console.log(`➡️ Switching to Groq API key ${i + 2}...`);
      }
    }
  }

  console.error("❌ All Groq API keys failed");

  return fallbackReply;
}