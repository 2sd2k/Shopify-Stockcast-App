/**
 * Daily sync job.
 *
 * Import this once from app/entry.server.tsx (see README) so it starts with the
 * server process. Deliberately dependency-light: node-cron in-process is enough
 * for a free app with a few hundred installs. Move to a real queue only if the
 * sync starts taking longer than the interval.
 *
 *   npm i node-cron && npm i -D @types/node-cron
 */

import { schedule as scheduleJob } from "node-cron";
import db from "./db.server";
import { unauthenticated } from "./shopify.server";
import { syncShop } from "./lib/sync.server";

const SCHEDULE = process.env.SYNC_CRON ?? "0 4 * * *"; // 04:00 server time daily
const STAGGER_MS = 1_500; // be polite to the Admin API rate limiter

let started = false;

export function startCron() {
  if (started || process.env.DISABLE_CRON === "1") return;
  started = true;

  scheduleJob(SCHEDULE, () => {
    syncAllShops().catch((e) =>
      console.error("[stockcast] cron run failed:", e),
    );
  });

  console.log(`[stockcast] daily sync scheduled (${SCHEDULE})`);
}

export async function syncAllShops() {
  // Offline sessions are the ones with a usable long-lived token.
  const sessions = await db.session.findMany({
    where: { isOnline: false },
    select: { shop: true },
    distinct: ["shop"],
  });

  console.log(`[stockcast] syncing ${sessions.length} shop(s)`);

  for (const { shop } of sessions) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      const result = await syncShop(admin, shop);
      console.log(`[stockcast] ${shop}:`, result);
    } catch (error) {
      // Most likely an uninstalled shop with a stale session row.
      console.error(`[stockcast] ${shop} sync error:`, error);
    }
    await new Promise((r) => setTimeout(r, STAGGER_MS));
  }
}
