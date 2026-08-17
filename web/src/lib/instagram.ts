import { getSettings } from "@/database/automationRuleRepository";

/** Shared Graph API base. `src/instagram/meta/comments.ts` reuses this. */
export const GRAPH_BASE = `https://graph.instagram.com/${process.env.GRAPH_API_VERSION || "v24.0"}`;

export async function getInstagramToken(): Promise<string> {
  const settings = await getSettings();
  const token = settings.instagram_access_token || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error("Instagram access token is not configured");
  return token;
}

export interface InstagramProfile {
  name: string | null;
  username: string | null;
  profile_pic: string | null;
  follower_count: number | null;
  is_user_follow_business: boolean | null;
  is_business_follow_user: boolean | null;
}

export async function fetchInstagramProfile(igsid: string): Promise<InstagramProfile> {
  const token = await getInstagramToken();
  const url = new URL(`${GRAPH_BASE}/${igsid}`);
  url.searchParams.set("fields", "name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user");
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString());
  const data = await res.json();

  return {
    name: data.name ?? null,
    username: data.username ?? null,
    profile_pic: data.profile_pic ?? null,
    follower_count: data.follower_count ?? null,
    is_user_follow_business: data.is_user_follow_business ?? null,
    is_business_follow_user: data.is_business_follow_user ?? null,
  };
}

export async function sendInstagramMessage(recipientIgsid: string, text: string) {
  const token = await getInstagramToken();
  const url = new URL(`${GRAPH_BASE}/me/messages`);
  url.searchParams.set("access_token", token);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientIgsid },
      message: { text },
    }),
  });
  return res.json();
}
