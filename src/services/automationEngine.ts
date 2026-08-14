import { getRules, getSettings } from "@/database/automationRuleRepository";
import { getAIResponse } from "@/lib/ai";
import { INSTAGRAM_SYSTEM_PROMPT } from "@/lib/system-prompt";
import { createLogger } from "@/lib/logger";
import type { AutomationRule, EventType } from "@/lib/types";

const log = createLogger("automationEngine");

export interface AutomationContext {
  eventType: EventType;
  username: string | null;
  /** Comment body. Null for follows and likes. */
  text?: string | null;
  permalink?: string | null;
}

export interface AutomationDecision {
  publicReply: string | null;
  dm: string | null;
  ruleId: string | null;
  usedAi: boolean;
  /** Set when nothing will be sent, for logging and event status. */
  skipReason?: string;
}

const NO_ACTION: AutomationDecision = {
  publicReply: null,
  dm: null,
  ruleId: null,
  usedAi: false,
};

/**
 * Word-boundary, case-insensitive keyword match. Substring matching would fire
 * a "price" rule on the word "surprise".
 */
export function matchesKeywords(
  keywords: string[] | null,
  text: string | null | undefined
): boolean {
  if (!keywords || keywords.length === 0) return true; // catch-all
  if (!text) return false;

  const haystack = text.toLowerCase();
  return keywords.some((keyword) => {
    const needle = keyword.trim().toLowerCase();
    if (!needle) return false;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(haystack);
  });
}

function render(template: string, ctx: AutomationContext): string {
  return template
    .replace(/\{\{\s*username\s*\}\}/g, ctx.username ?? "there")
    .replace(/\{\{\s*text\s*\}\}/g, ctx.text ?? "")
    .replace(/\{\{\s*permalink\s*\}\}/g, ctx.permalink ?? "");
}

function pickRule(rules: AutomationRule[], ctx: AutomationContext): AutomationRule | null {
  // Rules arrive priority-desc; the first match wins.
  return rules.find((rule) => matchesKeywords(rule.match_keywords, ctx.text)) ?? null;
}

function buildUserTurn(ctx: AutomationContext): string {
  switch (ctx.eventType) {
    case "comment":
      return `@${ctx.username ?? "someone"} commented on your post: "${ctx.text ?? ""}"`;
    case "follow":
      return `@${ctx.username ?? "someone"} just followed your account.`;
    case "like":
      return `@${ctx.username ?? "someone"} just liked your post.`;
  }
}

/**
 * The shared brain for all three event types: pick a rule, then produce the
 * reply text either from its template or from the AI service.
 */
export async function decide(ctx: AutomationContext): Promise<AutomationDecision> {
  const [rules, settings] = await Promise.all([getRules(ctx.eventType), getSettings()]);

  const enabledFor: Record<EventType, boolean> = {
    comment: settings.comment_automation_enabled,
    follow: settings.follow_automation_enabled,
    like: settings.like_automation_enabled,
  };

  if (!enabledFor[ctx.eventType]) {
    return { ...NO_ACTION, skipReason: `${ctx.eventType} automation disabled` };
  }

  const rule = pickRule(rules, ctx);
  if (!rule) {
    return { ...NO_ACTION, skipReason: "no matching rule" };
  }

  // A rule can ask for AI, but the global switch always wins.
  const useAi = rule.use_ai && settings.use_ai;

  if (!useAi) {
    return {
      publicReply: rule.public_reply_template ? render(rule.public_reply_template, ctx) : null,
      dm: rule.dm_template ? render(rule.dm_template, ctx) : null,
      ruleId: rule.id,
      usedAi: false,
    };
  }

  const systemPrompt = rule.ai_instruction
    ? `${INSTAGRAM_SYSTEM_PROMPT}\n\n## Additional instruction for this ${ctx.eventType} event\n${rule.ai_instruction}`
    : INSTAGRAM_SYSTEM_PROMPT;

  try {
    const generated = await getAIResponse([{ role: "user", content: buildUserTurn(ctx) }], {
      systemPrompt,
      maxTokens: 300,
    });

    return {
      // A rule that defines a public template keeps it; AI drives the DM.
      publicReply: rule.public_reply_template ? render(rule.public_reply_template, ctx) : null,
      dm: generated,
      ruleId: rule.id,
      usedAi: true,
    };
  } catch (err) {
    log.error("AI generation failed, falling back to templates", {
      error: err,
      ruleId: rule.id,
      eventType: ctx.eventType,
    });

    // Templates are the safety net — never drop the event because the LLM died.
    return {
      publicReply: rule.public_reply_template ? render(rule.public_reply_template, ctx) : null,
      dm: rule.dm_template ? render(rule.dm_template, ctx) : null,
      ruleId: rule.id,
      usedAi: false,
    };
  }
}

/** Exposed for the daily-cap check in the follow/like paths. */
export async function isWithinDailyCap(sentToday: number): Promise<boolean> {
  const settings = await getSettings();
  return sentToday < settings.daily_dm_cap;
}
