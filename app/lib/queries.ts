/**
 * Admin GraphQL documents. Kept in one file so they can be validated against
 * the Shopify schema independently of the code that runs them.
 * All three have been validated against the Admin API schema.
 */

export const LOCATIONS_QUERY = /* GraphQL */ `
  query Locations {
    shop {
      id
      name
      ianaTimezone
      currencyCode
    }
    primaryLocation: location {
      id
    }
    locations(first: 100, includeInactive: false, includeLegacy: true) {
      nodes {
        id
        name
        isActive
        isFulfillmentService
        hasActiveInventory
      }
    }
  }
`;

export const SALES_HISTORY_QUERY = /* GraphQL */ `
  query SalesHistory($cursor: String, $query: String!) {
    orders(first: 50, after: $cursor, query: $query, sortKey: CREATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        createdAt
        lineItems(first: 100) {
          pageInfo {
            hasNextPage
          }
          nodes {
            id
            quantity
            sku
            name
            variant {
              id
            }
          }
        }
        refunds {
          refundLineItems(first: 100) {
            nodes {
              quantity
              lineItem {
                sku
                variant {
                  id
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const INVENTORY_QUERY = /* GraphQL */ `
  query InventoryAtLocation($cursor: String, $locationId: ID!) {
    productVariants(first: 100, after: $cursor) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        sku
        title
        product {
          id
          title
          status
        }
        inventoryItem {
          id
          tracked
          inventoryLevel(locationId: $locationId) {
            id
            quantities(names: ["available"]) {
              name
              quantity
            }
          }
        }
      }
    }
  }
`;
