import { GRAPH_BASE } from "@/lib/instagram";
import { config } from "@/lib/config";
import { createLogger } from "@/lib/logger";

const log = createLogger("meta.comments");

/**
 * Unlike the original two-function client in `src/lib/instagram.ts`, everything
 * here checks the response and throws — a silently-failed comment reply is
 * indistinguishable from success otherwise.
 */
export class GraphApiError extends Error {
  readonly status: number;
  readonly code?: number;
  readonly subcode?: number;
  readonly type?: string;

  constructor(
    message: string,
    status: number,
    details: { code?: number; error_subcode?: number; type?: string } = {}
  ) {
    super(message);
    this.name = "GraphApiError";
    this.status = status;
    this.code = details.code;
    this.subcode = details.error_subcode;
    this.type = details.type;
  }

  /** Transient conditions worth one retry. 4 = app rate limit, 613 = calls-per-hour. */
  get isRetryable(): boolean {
    return this.status >= 500 || this.code === 4 || this.code === 613 || this.status === 429;
  }
}

interface GraphErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
  };
}

async function graphFetch(
  url: URL,
  init: RequestInit,
  context: string,
  attempt = 0
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(url.toString(), init);
  } catch (err) {
    if (attempt === 0) {
      log.warn("network error, retrying once", { context, error: err });
      await new Promise((r) => setTimeout(r, 1000));
      return graphFetch(url, init, context, attempt + 1);
    }
    throw err;
  }

  const body = (await res.json().catch(() => ({}))) as GraphErrorBody & Record<string, unknown>;

  if (!res.ok || body.error) {
    const error = new GraphApiError(
      body.error?.message ?? `${context} failed with HTTP ${res.status}`,
      res.status,
      body.error ?? {}
    );

    if (error.isRetryable && attempt === 0) {
      log.warn("retryable Graph error, retrying once", {
        context,
        status: error.status,
        code: error.code,
      });
      await new Promise((r) => setTimeout(r, 1500));
      return graphFetch(url, init, context, attempt + 1);
    }
    throw error;
  }

  return body;
}

function authedUrl(path: string): URL {
  const token = config.instagramAccessToken;
  if (!token) throw new Error("INSTAGRAM_ACCESS_TOKEN is not set");
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set("access_token", token);
  return url;
}

/**
 * Public reply in the comment thread.
 * Requires the `instagram_business_manage_comments` scope.
 */
export async function replyToComment(
  commentId: string,
  message: string
): Promise<{ id: string }> {
  if (config.dryRun) {
    log.info("DRY_RUN: skipping public comment reply", { commentId, message });
    return { id: "dry-run" };
  }

  const url = authedUrl(`/${commentId}/replies`);
  url.searchParams.set("message", message);

  const body = await graphFetch(url, { method: "POST" }, "replyToComment");
  log.info("public reply sent", { event: "public_reply", commentId, replyId: body.id });
  return { id: String(body.id ?? "") };
}

/**
 * Private reply — a DM sent in response to a comment. Allowed once per comment
 * and opens a 7-day messaging window with that user. This is the only way to
 * DM someone who has never messaged the account first.
 */
export async function sendPrivateReply(
  commentId: string,
  text: string
): Promise<{ message_id?: string }> {
  if (config.dryRun) {
    log.info("DRY_RUN: skipping private reply", { commentId, text });
    return {};
  }

  const url = authedUrl("/me/messages");
  const body = await graphFetch(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { comment_id: commentId },
        message: { text },
      }),
    },
    "sendPrivateReply"
  );

  log.info("private reply sent", { event: "private_dm", commentId });
  return body as { message_id?: string };
}

export interface CommentDetails {
  id: string;
  text: string | null;
  username: string | null;
  media_id: string | null;
  permalink: string | null;
}

/** Fetch extra context for a comment. Best-effort; returns null on failure. */
export async function getComment(commentId: string): Promise<CommentDetails | null> {
  try {
    const url = authedUrl(`/${commentId}`);
    url.searchParams.set("fields", "id,text,username,media{id,permalink}");
    const body = await graphFetch(url, { method: "GET" }, "getComment");
    const media = body.media as { id?: string; permalink?: string } | undefined;
    return {
      id: String(body.id ?? commentId),
      text: (body.text as string) ?? null,
      username: (body.username as string) ?? null,
      media_id: media?.id ?? null,
      permalink: media?.permalink ?? null,
    };
  } catch (err) {
    log.warn("getComment failed", { commentId, error: err });
    return null;
  }
}

/** Optional moderation helper — hide a comment instead of replying to it. */
export async function hideComment(commentId: string, hide: boolean): Promise<void> {
  if (config.dryRun) {
    log.info("DRY_RUN: skipping hideComment", { commentId, hide });
    return;
  }
  const url = authedUrl(`/${commentId}`);
  url.searchParams.set("hide", String(hide));
  await graphFetch(url, { method: "POST" }, "hideComment");
}
