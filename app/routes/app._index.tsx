/**
 * Stockcast — the entire app UI (Phase 3).
 *
 * One view: what needs reordering, most urgent first. Resist adding tabs.
 * Runs inside the React Router app shell and renders Polaris web components.
 */

import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { csvFilename, reorderListToCsv } from "../lib/csv";
import { DEFAULT_WINDOW_DAYS, type ReorderRow } from "../lib/reorder";
import {
  getReorderList,
  saveProductSetting,
  syncShop,
} from "../lib/sync.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { shop: session.shop, ...(await getReorderList(session.shop)) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "sync") return syncShop(admin, session.shop);

  if (intent === "location") {
    const locationId = String(form.get("locationId") ?? "").trim();
    if (!locationId) return { ok: false as const, error: "Choose a location" };
    return syncShop(admin, session.shop, locationId);
  }

  if (intent === "dismissOnboarding") {
    await db.shopConfig.update({
      where: { shop: session.shop },
      data: { onboardedAt: new Date() },
    });
    return { ok: true as const };
  }

  if (intent === "setting") {
    const sku = String(form.get("sku") ?? "").trim();
    const field = String(form.get("field"));
    const raw = String(form.get("value") ?? "").trim();
    const value = raw === "" ? null : Number(raw);
    if (!sku || (field !== "leadTimeDays" && field !== "safetyBufferUnits"))
      return { ok: false as const, error: "Invalid setting" };
    if (value !== null && (!Number.isFinite(value) || value < 0))
      return { ok: false as const, error: "Enter a non-negative number" };
    await saveProductSetting(session.shop, sku, {
      [field]: value === null ? null : Math.round(value),
    });
    return { ok: true as const };
  }

  return { ok: false as const, error: "Unknown action" };
};

export default function Stockcast() {
  const data = useLoaderData<typeof loader>();
  const syncFetcher = useFetcher<typeof action>();
  const locationFetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const rows = data.rows as ReorderRow[];
  const neverSynced = !data.lastSyncAt;
  const syncing = syncFetcher.state !== "idle";
  const changingLocation = locationFetcher.state !== "idle";
  const locationError =
    locationFetcher.state === "idle" && locationFetcher.data?.ok === false
      ? locationFetcher.data.error
      : null;

  // First load after install: kick off the initial sync automatically.
  useEffect(() => {
    if (neverSynced && syncFetcher.state === "idle" && !syncFetcher.data)
      syncFetcher.submit({ intent: "sync" }, { method: "post" });
  }, [neverSynced, syncFetcher]);
  useEffect(() => {
    if (syncFetcher.state === "idle" && syncFetcher.data)
      revalidator.revalidate();
  }, [revalidator, syncFetcher.data, syncFetcher.state]);
  useEffect(() => {
    if (locationFetcher.state === "idle" && locationFetcher.data)
      revalidator.revalidate();
  }, [locationFetcher.data, locationFetcher.state, revalidator]);

  const csv = useMemo(() => reorderListToCsv(rows), [rows]);
  const downloadCsv = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename(data.shop);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <s-page heading="Stockcast">
      <s-button
        slot="primary-action"
        onClick={downloadCsv}
        disabled={rows.length === 0}
      >
        Export CSV
      </s-button>
      <div
        style={{
          alignItems: "end",
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 12,
        }}
      >
        {data.locations.length > 0 && (
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Inventory location
            </span>
            <select
              aria-label="Inventory location"
              value={data.locationId ?? ""}
              disabled={syncing || changingLocation}
              onChange={(event) =>
                locationFetcher.submit(
                  {
                    intent: "location",
                    locationId: event.currentTarget.value,
                  },
                  { method: "post" },
                )
              }
              style={{
                minWidth: 240,
                padding: "8px 32px 8px 10px",
                border: "1px solid #8c9196",
                borderRadius: 6,
                background: "white",
              }}
            >
              {data.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                  {location.isFulfillmentService ? " (app-managed)" : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        <s-button
          onClick={() =>
            syncFetcher.submit({ intent: "sync" }, { method: "post" })
          }
          disabled={changingLocation}
          {...(syncing ? { loading: true } : {})}
        >
          {syncing ? "Updating" : "Update from Shopify"}
        </s-button>
        {changingLocation && <span>Switching location and updating…</span>}
      </div>
      {!data.onboardedAt && (
        <Onboarding windowDays={rows[0]?.windowDays ?? DEFAULT_WINDOW_DAYS} />
      )}
      {locationError && (
        <s-banner tone="critical" heading="We couldn't switch locations">
          <p>{locationError}</p>
        </s-banner>
      )}
      {data.lastSyncError && (
        <s-banner tone="critical" heading="We couldn't update your numbers">
          <p role="alert">
            {data.lastSyncError}
            {data.lastSyncAt
              ? ` The table below still shows your last successful update from ${new Date(data.lastSyncAt).toLocaleString()}.`
              : ""}
          </p>
        </s-banner>
      )}
      <s-section
        heading={
          data.locationName
            ? `What to reorder · ${data.totalTrackedSkus} items tracked at ${data.locationName}`
            : "What to reorder"
        }
      >
        {syncing && neverSynced ? (
          <p>
            Reading your sales history and stock levels. This may take a minute
            the first time.
          </p>
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <ReorderTable rows={rows} />
        )}
        <p style={{ color: "#616161", fontSize: 13, marginTop: 20 }}>
          {data.lastSyncAt
            ? `Last updated from Shopify ${new Date(data.lastSyncAt).toLocaleString()}`
            : "Not updated yet"}
        </p>
      </s-section>
    </s-page>
  );
}

function Onboarding({ windowDays }: { windowDays: number }) {
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) revalidator.revalidate();
  }, [fetcher.data, fetcher.state, revalidator]);
  return (
    <s-section heading="How these numbers work">
      <p>
        We look at the last {windowDays} days of sales for each item and work
        out how many it sells per day. Then we flag anything that will run out
        before a new order could arrive.
      </p>
      <p>
        <strong>Lead time</strong> is how many days your supplier takes to
        deliver. <strong>Safety buffer</strong> is a few extra units kept in
        reserve in case sales spike or a delivery is late; we suggest 20% of a
        week&apos;s sales. Change either number on any row and the suggested
        order updates.
      </p>
      <s-button
        onClick={() =>
          fetcher.submit({ intent: "dismissOnboarding" }, { method: "post" })
        }
      >
        Got it
      </s-button>
    </s-section>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: "28px 0", textAlign: "center" }}>
      <h2 style={{ marginBottom: 8 }}>Nothing needs reordering right now</h2>
      <p>
        Every item you track has enough stock to last until a new order would
        arrive. We check again every morning.
      </p>
    </div>
  );
}

function ReorderTable({ rows }: { rows: ReorderRow[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{ borderCollapse: "collapse", width: "100%", minWidth: 800 }}
      >
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <th key={column.label} style={headerStyle} title={column.hint}>
                {column.label}
                <br />
                <small style={hintStyle}>{column.hint}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sku}>
              <td style={cellStyle}>
                <strong>
                  {row.productTitle}
                  {row.variantTitle ? ` · ${row.variantTitle}` : ""}
                </strong>
                <br />
                <small>
                  SKU {row.sku} · sells {row.avgDailySales} per day
                </small>
              </td>
              <td style={numericCellStyle}>{row.currentInventory}</td>
              <td style={numericCellStyle}>
                <StockBadge
                  stock={row.currentInventory}
                  days={row.daysOfStockLeft}
                  lead={row.leadTimeDays}
                />
              </td>
              <td style={numericCellStyle}>
                <strong>{row.suggestedOrderQty}</strong>
              </td>
              <td style={cellStyle}>
                <InlineNumber
                  sku={row.sku}
                  field="leadTimeDays"
                  value={row.leadTimeDays}
                  isDefault={row.usingDefaultLeadTime}
                />
              </td>
              <td style={cellStyle}>
                <InlineNumber
                  sku={row.sku}
                  field="safetyBufferUnits"
                  value={row.safetyBufferUnits}
                  isDefault={row.usingDefaultSafetyBuffer}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * How long the stock lasts, in words a merchant would use. Oversold and empty
 * shelves get a label instead of a negative or zero number. Colour compares
 * the cover to the lead time: red when a new order can't arrive in time.
 */
function StockBadge({
  stock,
  days,
  lead,
}: {
  stock: number;
  days: number;
  lead: number;
}) {
  if (stock < 0) return <s-badge tone="critical">Oversold</s-badge>;
  if (!Number.isFinite(days)) return <span>No recent sales</span>;
  if (stock === 0) return <s-badge tone="critical">Out of stock</s-badge>;
  const tone =
    days <= lead / 2 ? "critical" : days <= lead ? "warning" : "info";
  return <s-badge tone={tone}>{`${days} days`}</s-badge>;
}

/** Inline-editable number. Saves on blur; blank resets to the default. */
function InlineNumber({
  sku,
  field,
  value,
  isDefault,
}: {
  sku: string;
  field: "leadTimeDays" | "safetyBufferUnits";
  value: number;
  isDefault: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  useEffect(() => setDraft(String(value)), [value]);
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) revalidator.revalidate();
  }, [fetcher.data, fetcher.state, revalidator]);
  return (
    <input
      aria-label={
        field === "leadTimeDays"
          ? `Lead time for ${sku}`
          : `Safety buffer for ${sku}`
      }
      title={
        isDefault
          ? "Suggested value. Type your own number to change it, or clear the box to go back to the suggestion."
          : "Your value. Clear the box to go back to the suggestion."
      }
      type="number"
      min="0"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== String(value))
          fetcher.submit(
            { intent: "setting", sku, field, value: draft },
            { method: "post" },
          );
      }}
      style={{
        width: 74,
        padding: 7,
        border: isDefault ? "1px dashed #8c9196" : "1px solid #8c9196",
        borderRadius: 4,
        color: isDefault ? "#616161" : "inherit",
      }}
    />
  );
}

const COLUMNS = [
  { label: "Product", hint: "Name, SKU, and sales per day" },
  { label: "In stock", hint: "Units at this location now" },
  { label: "Days of stock left", hint: "At the current sales rate" },
  { label: "Suggested order", hint: "Units to buy now" },
  { label: "Lead time (days)", hint: "Days from ordering to delivery" },
  { label: "Safety buffer (units)", hint: "Extra units kept in reserve" },
];
const hintStyle = {
  color: "#616161",
  fontWeight: 400,
  whiteSpace: "normal" as const,
};
const headerStyle = {
  borderBottom: "1px solid #d2d5d8",
  padding: "10px 8px",
  textAlign: "left" as const,
  whiteSpace: "nowrap" as const,
};
const cellStyle = {
  borderBottom: "1px solid #e1e3e5",
  padding: "12px 8px",
  verticalAlign: "middle" as const,
};
const numericCellStyle = { ...cellStyle, textAlign: "right" as const };
