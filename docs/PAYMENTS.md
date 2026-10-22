# Payments

For projects taking payments, use a shared provider adapter/interface. Keep
products, cart, pricing, discounts, shipping, orders, inventory, customers,
invoices, and CMS independent of payment-provider code.

Use Stripe until Bangkok Bank Merchant iPay is approved and production-ready.
Then make Merchant iPay primary, retaining Stripe as fallback.

Checkout → validate cart server-side → recalculate prices from database →
create pending order → select provider → create payment → customer pays →
verify callback/webhook → update payment record → mark order paid →
show result page.

Prefer separate payment-attempt records for safe retries or multiple
provider attempts on one order. Never automatically retry through another
provider. If a provider is confirmed to have failed before payment begins,
let the customer choose an available fallback. Do not switch providers while
an attempt is pending or its outcome is unknown.

Never trust client prices or payment status. Keep credentials server-side.
Verify payment using official provider mechanisms, matching its attempt,
order, expected amount, and currency. Process callbacks/webhooks and order
updates idempotently. A return URL alone cannot mark an order paid. Result
pages reflect server-verified status.

Use THB as the canonical order currency. Other currencies are approximate
display values unless the provider officially supports charging them.

Implement Merchant iPay only from Bangkok Bank's current official
integration documentation and authorized credentials. Follow its endpoints,
signing requirements, callback rules, DCC behavior, and refund/void
specifications. If required details are unavailable, leave iPay unconfigured
and use Stripe.
