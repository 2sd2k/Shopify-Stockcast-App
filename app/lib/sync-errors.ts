/**
 * Turns whatever a failed sync threw into something a merchant can act on.
 *
 * The raw error is kept for server logs (toSyncErrorDetail). The merchant
 * only ever sees toSyncErrorMessage, which says what happened and what to do
 * next, in plain language, with no API vocabulary.
 */

export type SyncErrorKind =
  | "no_location"
  | "location_unavailable"
  | "permission"
  | "throttled"
  | "network"
  | "app_bug"
  | "unknown";

const MAX_DETAIL_LENGTH = 500;

const MESSAGES: Record<SyncErrorKind, string> = {
  no_location:
    "Your store has no active inventory location. Add or reactivate one in Shopify, then update again.",
  location_unavailable:
    "The inventory location you chose is no longer available in Shopify. Pick another location above.",
  permission:
    "Stockcast no longer has permission to read your orders and inventory. Reinstall the app to restore access.",
  throttled:
    "Shopify is limiting requests right now. Wait a minute, then update again.",
  network:
    "We couldn't reach Shopify. Check your connection, then update again.",
  app_bug:
    "Stockcast hit a problem reading your store. The details have been logged for us to fix. Try again in a few minutes, and contact support if it keeps happening.",
  unknown:
    "The update didn't finish. Try again, and contact support if it keeps happening.",
};

/** Raw error text for logs, truncated so a huge response can't bloat a row. */
export function toSyncErrorDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_DETAIL_LENGTH);
}

/** Sort a failure into a cause we know how to explain. */
export function classifySyncError(error: unknown): SyncErrorKind {
  const text = toSyncErrorDetail(error);
  if (/no active inventory location/i.test(text)) return "no_location";
  if (/no longer available/i.test(text)) return "location_unavailable";
  if (/throttl|too many requests|\b429\b/i.test(text)) return "throttled";
  if (
    /access denied|unauthori[sz]ed|forbidden|invalid api key|invalid token|\b40[13]\b|session.*(expired|invalid)/i.test(
      text,
    )
  )
    return "permission";
  if (
    /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|timed? ?out|socket hang up/i.test(
      text,
    )
  )
    return "network";
  if (
    /admin api error|graphql|doesn't exist on type|parse error|syntax error|returned no data/i.test(
      text,
    )
  )
    return "app_bug";
  return "unknown";
}

/** Merchant-facing sentence: what happened and what to do next. */
export function toSyncErrorMessage(error: unknown): string {
  return MESSAGES[classifySyncError(error)];
}
