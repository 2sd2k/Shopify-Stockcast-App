export type ComplianceTopic =
  | "CUSTOMERS_DATA_REQUEST"
  | "CUSTOMERS_REDACT"
  | "SHOP_REDACT";

type ComplianceDeps = {
  clearShopData: (shop: string) => Promise<void>;
  log: (message: string) => void;
};

export async function handleComplianceTopic(
  topic: string,
  shop: string,
  deps: ComplianceDeps,
) {
  switch (topic as ComplianceTopic) {
    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      deps.log(`[restock-radar] ${topic} for ${shop}: no customer data held`);
      return;

    case "SHOP_REDACT":
      await deps.clearShopData(shop);
      deps.log(`[restock-radar] SHOP_REDACT: purged all data for ${shop}`);
      return;

    default:
      throw new Response("Unhandled webhook topic", { status: 404 });
  }
}
