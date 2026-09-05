export interface InventoryLocation {
  id: string;
  name: string;
  isActive: boolean;
  isFulfillmentService: boolean;
  hasActiveInventory: boolean;
}

export interface ShopLocations {
  shopName: string;
  primaryLocationId: string | null;
  locations: InventoryLocation[];
}

/**
 * Keeps an explicit/saved choice when possible. New shops default to Shopify's
 * primary merchant-managed location, then another merchant-managed location.
 */
export function selectInventoryLocation(
  snapshot: ShopLocations,
  requestedLocationId?: string | null,
  savedLocationId?: string | null,
): InventoryLocation {
  const byId = (id?: string | null) =>
    id ? snapshot.locations.find((location) => location.id === id) : undefined;
  const requested = byId(requestedLocationId);
  if (requested) return requested;
  if (requestedLocationId)
    throw new Error("The selected inventory location is no longer available.");
  const chosen =
    byId(savedLocationId) ??
    snapshot.locations.find(
      (location) =>
        location.id === snapshot.primaryLocationId &&
        !location.isFulfillmentService,
    ) ??
    snapshot.locations.find((location) => !location.isFulfillmentService) ??
    byId(snapshot.primaryLocationId) ??
    snapshot.locations[0];
  if (!chosen) throw new Error("This shop has no active inventory location.");
  return chosen;
}
