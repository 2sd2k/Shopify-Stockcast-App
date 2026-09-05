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
          {syncing ? "Syncing" : "Sync now"}
        </s-button>
        {changingLocation && <span>Changing location and syncing…</span>}
      </div>
      {!data.onboardedAt && (
        <Onboarding windowDays={rows[0]?.windowDays ?? DEFAULT_WINDOW_DAYS} />
      )}
      {locationError && (
        <s-banner tone="critical" heading="Could not change location">
          <p>{locationError}</p>
        </s-banner>
      )}
      {data.lastSyncError && (
        <s-banner tone="critical" heading="Last sync failed">
          <p role="alert">{data.lastSyncError}</p>
        </s-banner>
      )}
      <s-section
        heading={
          data.locationName
            ? `${data.locationName} · ${data.totalTrackedSkus} tracked SKUs`
            : "Reorder recommendations"
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
            ? `Last synced ${new Date(data.lastSyncAt).toLocaleString()}`
            : "Not synced yet"}
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
        We average your last {windowDays} days of sales per SKU, then flag
        anything whose stock won&apos;t cover its lead time plus a safety
        buffer. Adjust lead time or buffer on any row and the suggestion
        updates.
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
        Every tracked SKU has enough stock to cover its lead time. We check
        again every morning.
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
            {[
              "Product",
              "Stock",
              "Days left",
              "Reorder qty",
              "Lead time (days)",
              "Safety buffer",
            ].map((heading) => (
              <th key={heading} style={headerStyle}>
                {heading}
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
                  {row.sku} · {row.avgDailySales}/day
                </small>
              </td>
              <td style={numericCellStyle}>{row.currentInventory}</td>
              <td style={numericCellStyle}>
                <UrgencyBadge
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

/** Days of cover, coloured by how it compares to the lead time. */
function UrgencyBadge({ days, lead }: { days: number; lead: number }) {
  if (!Number.isFinite(days)) return <span>—</span>;
  const tone =
    days <= lead / 2 ? "critical" : days <= lead ? "warning" : "info";
  return <s-badge tone={tone}>{`${days}d`}</s-badge>;
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
      title={isDefault ? "Default value — type to override" : undefined}
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
