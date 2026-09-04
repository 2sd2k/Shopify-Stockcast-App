/**
 * Public privacy policy. App Store listings require a reachable URL, and a
 * route inside the app is the least thing to keep in sync.
 * Reachable at https://<your-host>/privacy — no auth, not embedded.
 */

const UPDATED = "August 2026";
const CONTACT = process.env.SUPPORT_EMAIL ?? "support@example.com";

export default function Privacy() {
  return (
    <main
      style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: "3rem 1.5rem",
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.6,
      }}
    >
      <h1>Restock Radar — Privacy Policy</h1>
      <p>
        <em>Last updated {UPDATED}</em>
      </p>

      <h2>What we access</h2>
      <p>
        With your permission, Restock Radar reads three things from your Shopify
        store: order line items (to count units sold per SKU), inventory levels
        at your primary location, and product/variant names and SKUs.
      </p>

      <h2>What we store</h2>
      <p>
        We store only aggregated, SKU-level numbers: units sold over the
        lookback window, current stock, and any lead time or safety buffer you
        set. We also store your shop domain and the access token needed to call
        the Shopify API on your behalf.
      </p>

      <h2>What we never store</h2>
      <p>
        No customer names, emails, addresses, phone numbers, payment details, or
        individual order records. Order data is aggregated to unit counts in
        memory and the raw records are discarded.
      </p>

      <h2>Sharing</h2>
      <p>
        We do not sell, rent, or share your data with third parties. Data is not
        used to train machine learning models.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Uninstalling the app deletes your stored data. Shopify also sends us a
        shop redaction request 48 hours after uninstall, which triggers a full
        purge. You can request deletion at any time by emailing {CONTACT}.
      </p>

      <h2>Contact</h2>
      <p>Questions or data requests: {CONTACT}</p>
    </main>
  );
}
