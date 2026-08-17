export interface Conversation {
  id: string;
  igsid: string;
  name: string | null;
  username: string | null;
  profile_pic: string | null;
  follower_count: number | null;
  is_user_follow_business: boolean | null;
  is_business_follow_user: boolean | null;
  mode: "agent" | "human";
  updated_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  instagram_msg_id: string | null;
  created_at: string;
}

export interface ConversationWithLastMessage extends Conversation {
  last_message: string | null;
}

export type EventSource = "meta" | "playwright";
export type EventType = "follow" | "like" | "comment";
export type EventStatus = "pending" | "processing" | "done" | "skipped" | "failed";
export type ActionTaken = "public_reply" | "private_dm" | "web_dm" | "none";

export interface InstagramEvent {
  id: string;
  source: EventSource;
  event_type: EventType;
  /** Stable dedupe key. Meta comment id, or a synthesised fingerprint for Playwright. */
  external_id: string;
  actor_username: string | null;
  actor_igsid: string | null;
  media_id: string | null;
  permalink: string | null;
  content: string | null;
  raw: unknown;
  status: EventStatus;
  action_taken: ActionTaken | null;
  reply_text: string | null;
  error: string | null;
  attempts: number;
  conversation_id: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface AutomationRule {
  id: string;
  event_type: EventType;
  /** null or empty means "catch-all". */
  match_keywords: string[] | null;
  public_reply_template: string | null;
  dm_template: string | null;
  use_ai: boolean;
  ai_instruction: string | null;
  enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface AutomationSettings {
  id: number;
  use_ai: boolean;
  follow_automation_enabled: boolean;
  like_automation_enabled: boolean;
  comment_automation_enabled: boolean;
  daily_dm_cap: number;
  playwright_session_valid: boolean;
  playwright_last_poll_at: string | null;
  playwright_last_error: string | null;
  dm_system_prompt: string | null;
  instagram_access_token: string | null;
  updated_at: string;
}
