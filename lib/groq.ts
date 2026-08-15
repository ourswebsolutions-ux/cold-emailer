import Groq from "groq-sdk"

const groqApiKeys = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY1,
  process.env.GROQ_API_KEYY2,
    process.env.GROQ_API_KEY3,
    process.env.GROQ_API_KEY4,
    process.env.GROQ_API_KEY5
].filter((key): key is string => Boolean(key))

if (groqApiKeys.length === 0) {
  throw new Error("No GROQ API keys are configured")
}

export const GROQ_MODEL =
  process.env.GROQ_MODEL ||
  "llama-3.3-70b-versatile"

/**
 * Executes a Groq request with automatic API-key fallback.
 *
 * Key 1 → Key 2 → Key 3
 *
 * If a key fails, the next available key is tried.
 */
export async function withGroqFallback<T>(
  callback: (client: Groq) => Promise<T>
): Promise<T> {
  let lastError: unknown = null

  for (let i = 0; i < groqApiKeys.length; i++) {
    const apiKey = groqApiKeys[i]

    try {
      const client = new Groq({
        apiKey,
      })

      console.log(
        `[Groq] Trying API key ${i + 1}/${groqApiKeys.length}`
      )

      const result = await callback(client)

      console.log(
        `[Groq] API key ${i + 1} succeeded`
      )

      return result
    } catch (error) {
      lastError = error

      console.error(
        `[Groq] API key ${i + 1} failed`
      )

      // Try next key
      if (i < groqApiKeys.length - 1) {
        console.log(
          `[Groq] Falling back to API key ${i + 2}`
        )
      }
    }
  }

  throw lastError || new Error("All Groq API keys failed")
}