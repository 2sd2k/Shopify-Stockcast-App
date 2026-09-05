/**
 * Mandatory GDPR/compliance webhooks (Phase 4).
 * App Store review will reject the app without these three topics.
 *
 * `authenticate.webhook` verifies the HMAC and throws a 401 if it fails, which
 * is exactly what the automated review check probes for.
 *
 * Register in shopify.app.toml — see shopify.app.toml.snippet.
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { clearShopData } from "../lib/sync.server";
import { handleComplianceTopic } from "../lib/compliance";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  await handleComplianceTopic(topic, shop, {
    clearShopData,
    log: (message) => console.log(message),
  });

  return new Response(null, { status: 200 });
};
