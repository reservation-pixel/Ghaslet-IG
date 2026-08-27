import OpenAI from "openai";
import { INSTAGRAM_SYSTEM_PROMPT } from "@/lib/system-prompt";

let _openai: OpenAI | null = null;

/**
 * Lazy so that importing this module (e.g. from the Playwright worker) does not
 * require the key to be present up front. Mirrors the pattern in
 * `src/lib/db.ts`.
 */
function getClient(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENROUTER_API_KEY;
    const baseURL = process.env.ANTHROPIC_API_KEY
      ? "https://api.anthropic.com/v1/"
      : "https://openrouter.ai/api/v1";
    _openai = new OpenAI({ baseURL, apiKey });
  }
  return _openai;
}

function fallbackModels(): string[] {
  if (process.env.ANTHROPIC_API_KEY) {
    return [process.env.AI_MODEL || "claude-haiku-4-5-20251001"].filter(Boolean) as string[];
  }
  return [
    process.env.AI_MODEL,
    "google/gemma-3-12b-it:free",
    "google/gemma-3-4b-it:free",
    "google/gemma-2-9b-it:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
  ].filter(Boolean) as string[];
}

export interface AIOptions {
  /** Overrides `INSTAGRAM_SYSTEM_PROMPT`. Used by per-rule comment/follow prompts. */
  systemPrompt?: string;
  maxTokens?: number;
}

export async function getAIResponse(
  messages: { role: "user" | "assistant"; content: string }[],
  options?: AIOptions
) {
  const payload = [
    { role: "system" as const, content: options?.systemPrompt ?? INSTAGRAM_SYSTEM_PROMPT },
    ...messages,
  ];

  for (const model of fallbackModels()) {
    try {
      const completion = await getClient().chat.completions.create({
        model,
        messages: payload,
        ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
      });
      return completion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      // Only fall through on rate-limit (429) or not-found (404), throw everything else
      if (status !== 429 && status !== 404) throw err;
      console.warn(`Model ${model} failed with ${status}, trying next...`);
    }
  }

  return "Sorry, I'm temporarily unavailable. Please try again shortly.";
}
