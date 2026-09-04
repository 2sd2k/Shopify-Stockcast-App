/**
 * Restock Radar — the entire app UI (Phase 3).
 *
 * One view: what needs reordering, most urgent first. Resist adding tabs.
 */

import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Banner,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Spinner,
  Text,
  TextField,
  Tooltip,
  IndexTable,
  useIndexResourceState,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  getReorderList,
  saveProductSetting,
  syncShop,
} from "../lib/sync.server";
import { csvFilename, reorderListToCsv } from "../lib/csv";
import type { ReorderRow } from "../lib/reorder";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const data = await getReorderList(session.shop);
  return json({ shop: session.shop, ...data });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "sync") {
    const result = await syncShop(admin, session.shop);
    return json(result);
  }

  if (intent === "dismissOnboarding") {
    await db.shopConfig.update({
      where: { shop: session.shop },
      data: { onboardedAt: new Date() },
    });
    return json({ ok: true });
  }

  if (intent === "setting") {
    const sku = String(form.get("sku"));
    const field = String(form.get("field"));
    const raw = String(form.get("value") ?? "").trim();
    const value = raw === "" ? null : Number(raw);

    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return json({ ok: false, error: "Enter a positive number" }, { status: 400 });
    }
    if (field !== "leadTimeDays" && field !== "safetyBufferUnits") {
      return json({ ok: false, error: "Unknown field" }, { status: 400 });
    }

    await saveProductSetting(session.shop, sku, {
      [field]: value === null ? null : Math.round(value),
    });
    return json({ ok: true });
  }

  return json({ ok: false, error: "Unknown intent" }, { status: 400 });
};

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const syncFetcher = useFetcher<typeof action>();

  const rows = data.rows as unknown as ReorderRow[];
  const syncing = syncFetcher.state !== "idle";
  const neverSynced = !data.lastSyncAt;

  // First load after install: kick off the initial sync automatically.
  useEffect(() => {
    if (neverSynced && syncFetcher.state === "idle" && !syncFetcher.data) {
      syncFetcher.submit({ intent: "sync" }, { method: "post" });
    }
  }, [neverSynced, syncFetcher]);

  useEffect(() => {
    if (syncFetcher.state === "idle" && syncFetcher.data) revalidator.revalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncFetcher.data, syncFetcher.state]);

  const csv = useMemo(() => reorderListToCsv(rows), [rows]);

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename(data.shop);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Page
      title="Restock Radar"
      subtitle={
        data.locationName
          ? `${data.locationName} · ${data.totalTrackedSkus} tracked SKUs`
          : undefined
      }
      primaryAction={{
        content: "Export CSV",
        onAction: downloadCsv,
        disabled: rows.length === 0,
      }}
      secondaryActions={[
        {
          content: syncing ? "Syncing…" : "Sync now",
          onAction: () => syncFetcher.submit({ intent: "sync" }, { method: "post" }),
          loading: syncing,
        },
      ]}
    >
      <Layout>
        {!data.onboardedAt && (
          <Layout.Section>
            <OnboardingBanner windowDays={rows[0]?.windowDays ?? 30} />
          </Layout.Section>
        )}

        {data.lastSyncError && (
          <Layout.Section>
            <Banner tone="critical" title="Last sync failed">
              <p>{data.lastSyncError}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          {syncing && neverSynced ? (
            <Card>
              <BlockStack gap="300" inlineAlign="center">
                <Spinner accessibilityLabel="Loading your sales history" />
                <Text as="p" variant="bodyMd">
                  Reading your sales history and stock levels. This takes about a
                  minute the first time.
                </Text>
              </BlockStack>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState
                heading="Nothing needs reordering right now"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Every tracked SKU has enough stock to cover its lead time.
                  We check again every morning.
                </p>
              </EmptyState>
            </Card>
          ) : (
            <ReorderTable rows={rows} />
          )}
        </Layout.Section>

        <Layout.Section>
          <Text as="p" variant="bodySm" tone="subdued">
            {data.lastSyncAt
              ? `Last synced ${new Date(data.lastSyncAt).toLocaleString()}`
              : "Not synced yet"}
          </Text>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function OnboardingBanner({ windowDays }: { windowDays: number }) {
  const fetcher = useFetcher();
  return (
    <Banner
      title="How these numbers work"
      onDismiss={() =>
        fetcher.submit({ intent: "dismissOnboarding" }, { method: "post" })
      }
    >
      <p>
        We average your last {windowDays} days of sales per SKU, then flag
        anything whose stock won't cover its lead time plus a safety buffer.
        Adjust lead time or buffer on any row and the suggestion updates.
      </p>
    </Banner>
  );
}

function ReorderTable({ rows }: { rows: ReorderRow[] }) {
  const resourceName = { singular: "product", plural: "products" };
  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(rows as unknown as Array<{ id: string }>, {
      resourceIDResolver: (r: any) => r.sku,
    });

  return (
    <Card padding="0">
      <IndexTable
        resourceName={resourceName}
        itemCount={rows.length}
        selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
        onSelectionChange={handleSelectionChange}
        selectable={false}
        headings={[
          { title: "Product" },
          { title: "Stock", alignment: "end" },
          { title: "Days left", alignment: "end" },
          { title: "Reorder qty", alignment: "end" },
          { title: "Lead time (days)" },
          { title: "Safety buffer" },
        ]}
      >
        {rows.map((row, index) => (
          <IndexTable.Row id={row.sku} key={row.sku} position={index}>
            <IndexTable.Cell>
              <BlockStack gap="050">
                <Text as="span" variant="bodyMd" fontWeight="semibold">
                  {row.productTitle}
                  {row.variantTitle ? ` · ${row.variantTitle}` : ""}
                </Text>
                <Text as="span" variant="bodySm" tone="subdued">
                  {row.sku} · {row.avgDailySales}/day
                </Text>
              </BlockStack>
            </IndexTable.Cell>
            <IndexTable.Cell>
              <Text as="span" numeric alignment="end">
                {row.currentInventory}
              </Text>
            </IndexTable.Cell>
            <IndexTable.Cell>
              <InlineStack align="end">
                <UrgencyBadge days={row.daysOfStockLeft} lead={row.leadTimeDays} />
              </InlineStack>
            </IndexTable.Cell>
            <IndexTable.Cell>
              <Text as="span" numeric alignment="end" fontWeight="semibold">
                {row.suggestedOrderQty}
              </Text>
            </IndexTable.Cell>
            <IndexTable.Cell>
              <InlineNumber
                sku={row.sku}
                field="leadTimeDays"
                value={row.leadTimeDays}
                isDefault={row.usingDefaultLeadTime}
              />
            </IndexTable.Cell>
            <IndexTable.Cell>
              <InlineNumber
                sku={row.sku}
                field="safetyBufferUnits"
                value={row.safetyBufferUnits}
                isDefault={row.usingDefaultSafetyBuffer}
              />
            </IndexTable.Cell>
          </IndexTable.Row>
        ))}
      </IndexTable>
    </Card>
  );
}

function UrgencyBadge({ days, lead }: { days: number; lead: number }) {
  if (!Number.isFinite(days)) return <Badge>—</Badge>;
  const tone = days <= lead / 2 ? "critical" : days <= lead ? "warning" : "attention";
  return <Badge tone={tone}>{`${days}d`}</Badge>;
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
  const fetcher = useFetcher();
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const save = () => {
    if (draft === String(value)) return;
    fetcher.submit({ intent: "setting", sku, field, value: draft }, { method: "post" });
  };

  const input = (
    <TextField
      label=""
      labelHidden
      type="number"
      min={0}
      autoComplete="off"
      value={draft}
      onChange={setDraft}
      onBlur={save}
      // Row click shouldn't navigate away mid-edit.
      onFocus={(e: any) => e?.stopPropagation?.()}
    />
  );

  return isDefault ? (
    <Tooltip content="Default value — type to override">{input}</Tooltip>
  ) : (
    input
  );
}
