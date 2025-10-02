import Router from "koa-router";
import Stripe from "stripe";
import { apiRequest } from "../../helpers/apicall.mjs";

const BASE_URL = `/v1/billing/webhook`;

if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
  throw new Error("Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20", // pin a known-good version
});
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Simple in-memory idempotency (replace with Redis/DB in prod)
const processedEvents = new Set();
async function alreadyProcessed(eventId) {
  return processedEvents.has(eventId);
}
async function markProcessed(eventId) {
  processedEvents.add(eventId);
}

const router = new Router();

/**
 * Stripe Webhook Handler
 * @route POST /v1/billing/webhook
 *
 */
router.post(
  BASE_URL,
  async (ctx, next) => {
    const chunks = [];
    ctx.req.setEncoding("utf8");
    await new Promise((resolve, reject) => {
      ctx.req.on("data", (chunk) =>
        chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"))
      );
      ctx.req.on("end", resolve);
      ctx.req.on("error", reject);
    });
    ctx.rawBody = chunks.join("");
    await next();
  },

  async (ctx) => {
    const sig = ctx.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        ctx.rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Stripe signature verification failed:", err.message);
      ctx.status = 400;
      ctx.body = `Webhook Error: ${err.message}`;
      return;
    }

    try {
      if (await alreadyProcessed(event.id)) {
        ctx.status = 200;
        ctx.body = { received: true, duplicate: true };
        return;
      }

      await handleStripeEvent(event);

      await markProcessed(event.id);
      ctx.status = 200;
      ctx.body = { received: true };
    } catch (error) {
      console.error("Webhook processing error:", error);
      // Non-2xx => Stripe retries (good for transient errors)
      ctx.status = 500;
      ctx.body = { error: "Webhook processing failed" };
    }
  }
);

async function handleStripeEvent(event) {
  const { type, id } = event;
  console.log(`[Stripe] event=${type} id=${id}`);

  switch (type) {
    case "checkout.session.completed":
      return handleCheckoutSessionCompleted(event.data.object, type);

    case "customer.subscription.created":
      return handleSubscriptionCreated(event.data.object, type);

    case "customer.subscription.updated":
      return handleSubscriptionUpdated(event.data.object, type);

    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event.data.object, type);

    case "invoice.payment_succeeded":
      return handleInvoicePaymentSucceeded(event.data.object, type);

    case "invoice.payment_failed":
      return handleInvoicePaymentFailed(event.data.object, type);

    // Optional niceties (add similar handlers if/when needed):
    // case "invoice.payment_action_required":
    // case "customer.subscription.trial_will_end":
    // case "checkout.session.async_payment_succeeded":
    // case "checkout.session.async_payment_failed":

    default:
      console.log(`Unhandled event type: ${type}`);
  }
}

/**
 * Handle checkout session completed
 * Seed subscription + user link after Checkout, then upsert periods/status.
 */
async function handleCheckoutSessionCompleted(session, source) {
  if (session.mode !== "subscription" || !session.subscription) return;

  const subscription = await stripe.subscriptions.retrieve(session.subscription);

  const customerId = session.customer || subscription.customer;
  const customer =
    typeof customerId === "string"
      ? await stripe.customers.retrieve(customerId)
      : customerId;

  const userId = session.metadata?.user_id || subscription.metadata?.user_id;
  const planIdDB = session.metadata?.planIdDB || subscription.metadata?.planIdDB;

  await createOrUpdateSubscription(
    subscription,
    customer,
    userId,
    planIdDB,
    "checkout.session.completed"
  );

  await upsertPeriodsAndStatus(subscription, source);
}

/**
 * Handle subscription created
 */
async function handleSubscriptionCreated(subscription, source) {
  const customerId = subscription.customer;
  const customer =
    typeof customerId === "string"
      ? await stripe.customers.retrieve(customerId)
      : customerId;

  const userId =
    subscription.metadata?.user_id ||
    (await findUserIdByCustomerId(subscription.customer));
  const planIdDB = subscription.metadata?.planIdDB;

  await createOrUpdateSubscription(
    subscription,
    customer,
    userId,
    planIdDB,
    "customer.subscription.created"
  );

  await upsertPeriodsAndStatus(subscription, source);
}

/**
 * Handle subscription updated (plan change, resume/pause, cancel_at_period_end, etc.)
 */
async function handleSubscriptionUpdated(subscription, source) {
  const customerId = subscription.customer;
  const customer =
    typeof customerId === "string"
      ? await stripe.customers.retrieve(customerId)
      : customerId;

  const userId =
    subscription.metadata?.user_id ||
    (await findUserIdByCustomerId(subscription.customer));
  const planIdDB = subscription.metadata?.planIdDB;

  await createOrUpdateSubscription(
    subscription,
    customer,
    userId,
    planIdDB,
    "customer.subscription.updated"
  );

  await upsertPeriodsAndStatus(subscription, source);
}

/**
 * Handle subscription deleted/canceled
 * Use Stripe's own timestamps/status via upsert helper (also logs history).
 */
async function handleSubscriptionDeleted(subscription, source) {
  await upsertPeriodsAndStatus(subscription, source);
}

/**
 * Handle successful payment
 * Retrieve subscription to persist *actual* status and period boundaries.
 */
async function handleInvoicePaymentSucceeded(invoice, source) {
  if (!invoice.subscription) return;
  const sub = await stripe.subscriptions.retrieve(invoice.subscription);
  await upsertPeriodsAndStatus(sub, source);
}

/**
 * Handle failed payment (past_due, dunning flows)
 * Retrieve the Subscription and persist its canonical status/periods (and history).
 */
async function handleInvoicePaymentFailed(invoice, source) {
  if (!invoice.subscription) return;
  const sub = await stripe.subscriptions.retrieve(invoice.subscription);
  await upsertPeriodsAndStatus(sub, source);
}

/**
 * Create or update subscription + billing customer linkage in your DB (Directus)
 */
async function createOrUpdateSubscription(
  subscription,
  customer,
  userId,
  planIdDB,
  eventType
) {
  try {
    // 1) Ensure billing customer exists
    const customerQuery = `
      query {
        billing_customers(filter: { provider_customer_id: { _eq: "${customer.id}" } }) {
          id
          provider_customer_id
          user { id }
        }
      }
    `;
    let billingCustomer = await apiRequest(customerQuery);

    if (!billingCustomer.billing_customers?.length) {
      // Create new billing customer
      const createCustomerQuery = `
        mutation {
          create_billing_customers_item(data: {
            provider_customer_id: "${customer.id}"
            ${userId ? `user: { id: "${userId}" }` : ""}
            provider: 1
          }) {
            id
          }
        }
      `;
      billingCustomer = await apiRequest(createCustomerQuery);
    } else if (userId) {
      // Backfill user link if missing
      const existing = billingCustomer.billing_customers[0];
      if (!existing.user?.id) {
        const linkQuery = `
          mutation {
            update_billing_customers_item(
              id: "${existing.id}"
              data: { user: { id: "${userId}" } }
            ) { id }
          }
        `;
        await apiRequest(linkQuery);
      }
    }

    // 2) Upsert subscription row for this user + customer
    const existingSubQuery = `
      query {
        subscriptions(
          filter: {
            provider_customer_id: { _eq: "${customer.id}" }
            ${userId ? `user: { id: { _eq: "${userId}" } }` : ""}
          }
        ) { id }
      }
    `;
    const existingSub = await apiRequest(existingSubQuery);

    const planIdRequired = await resolvePlanIdDB(subscription, planIdDB);
    if (!existingSub.subscriptions?.length && !planIdRequired) {
      // If we cannot determine a plan on create, fail fast so Stripe retries and you can fix mapping
      throw new Error(
        `Missing required plan id: no planIdDB metadata and unable to infer from price for subscription ${subscription.id}`
      );
    }

    const baseData = `
      status: "${subscription.status}"
      current_period_start: "${epochToISOString(subscription.current_period_start)}"
      current_period_end: "${epochToISOString(subscription.current_period_end)}"
      cancel_at_period_end: ${subscription.cancel_at_period_end}
      canceled_at: ${subscription.canceled_at ? `"${epochToISOString(subscription.canceled_at)}"` : "null"}
      trial_start: ${subscription.trial_start ? `"${epochToISOString(subscription.trial_start)}"` : "null"}
      trial_end: ${subscription.trial_end ? `"${epochToISOString(subscription.trial_end)}"` : "null"}
    `;

    if (existingSub.subscriptions?.length) {
      // Update existing subscription AND move to the latest Stripe subscription id
      const updateQuery = `
        mutation {
          update_subscriptions_item(
            id: "${existingSub.subscriptions[0].id}"
            data: {
              provider_subscription_id: "${subscription.id}"
              ${baseData}
              ${planIdRequired ? `plan: ${planIdRequired}` : ""}
            }
          ) { id }
        }
      `;
      await apiRequest(updateQuery);
    } else {
      // Create new subscription row
      const createSubQuery = `
        mutation {
          create_subscriptions_item(data: {
            ${userId ? `user: { id: "${userId}" },` : ""}
            provider_customer_id: "${customer.id}"
            provider_subscription_id: "${subscription.id}"
            ${baseData}
            provider: 1
            plan: ${planIdRequired}
          }) { id }
        }
      `;
      await apiRequest(createSubQuery);
    }
  } catch (error) {
    console.error("Error creating/updating subscription:", {
      message: error?.message || error,
      eventType,
      subscription_id: subscription?.id,
      customer_id: customer?.id,
    });
    throw error; // bubble up so webhook returns 5xx => Stripe retries
  }
}

/**
 * Single place to persist the canonical period/status fields from a Subscription
 * Also writes into subscription_status_history when status changes.
 */
async function upsertPeriodsAndStatus(sub, source = "webhook") {
  // 1) Try by provider_subscription_id
  let res = await apiRequest(`
    query {
      subscriptions(filter: { provider_subscription_id: { _eq: "${sub.id}" } }) {
        id
        status
      }
    }
  `);
  let subId = res?.subscriptions?.[0]?.id;
  let existingStatus = res?.subscriptions?.[0]?.status || null;

  // 2) Fallback: look up by provider_customer_id (+ user if we can)
  if (!subId) {
    const userId = await findUserIdByCustomerId(sub.customer);
    res = await apiRequest(`
      query {
        subscriptions(
          filter: {
            provider_customer_id: { _eq: "${sub.customer}" }
            ${userId ? `user: { id: { _eq: "${userId}" } }` : ""}
          }
        ) {
          id
          status
        }
      }
    `);
    subId = res?.subscriptions?.[0]?.id;
    existingStatus = res?.subscriptions?.[0]?.status || null;

    // If we found a row, bring it forward to the new provider_subscription_id
    if (subId) {
      await apiRequest(`
        mutation {
          update_subscriptions_item(
            id: "${subId}"
            data: { provider_subscription_id: "${sub.id}" }
          ) { id }
        }
      `);
    }
  }

  // 3) If still no row, create one so we never drop periods
  if (!subId) {
    const userId = await findUserIdByCustomerId(sub.customer);
    const created = await apiRequest(`
      mutation {
        create_subscriptions_item(data: {
          ${userId ? `user: { id: "${userId}" },` : ""}
          provider_customer_id: "${sub.customer}"
          provider_subscription_id: "${sub.id}"
          status: "${sub.status}"
          current_period_start: "${epochToISOString(sub.current_period_start)}"
          current_period_end: "${epochToISOString(sub.current_period_end)}"
          cancel_at_period_end: ${sub.cancel_at_period_end}
          canceled_at: ${sub.canceled_at ? `"${epochToISOString(sub.canceled_at)}"` : "null"}
          trial_start: ${sub.trial_start ? `"${epochToISOString(sub.trial_start)}"` : "null"}
          trial_end: ${sub.trial_end ? `"${epochToISOString(sub.trial_end)}"` : "null"}
          provider: 1
        }) { id }
      }
    `);
    subId = created?.create_subscriptions_item?.id;
    existingStatus = null;
    if (!subId) {
      console.warn(`Could not create missing subscription row for ${sub.id}`);
      return;
    }
  }

  // 4) If status changed, write a history row
  if (existingStatus !== sub.status) {
    const nowIso = new Date().toISOString();
    const qStatus = `
      mutation {
        create_subscription_status_history_item(data: {
          from_status: ${existingStatus ? `"${existingStatus}"` : null}
          to_status: "${sub.status}"
          changed_at: "${nowIso}"
          source: "${source}"
          note: null
        }) { id }
      }
    `
    const qCreateHistory = await apiRequest(qStatus);
    const qUpdateSub = `
      mutation {
        update_subscription_status_history_item(
          id: ${qCreateHistory?.create_subscription_status_history_item?.id},
          data: {
            subscription: { id: ${subId} }
          }
        ) {
          id
          subscription {
            id
          }
        }
      }
    `
    console.log("===qUpdateSub", qUpdateSub)
    await apiRequest(qUpdateSub);
  }

  // 5) Update periods/status via IDs
  await apiRequest(`
    mutation {
      update_subscriptions_items(
        ids: ["${subId}"]
        data: {
          status: "${sub.status}"
          current_period_start: "${epochToISOString(sub.current_period_start)}"
          current_period_end: "${epochToISOString(sub.current_period_end)}"
          cancel_at_period_end: ${sub.cancel_at_period_end}
          canceled_at: ${sub.canceled_at ? `"${epochToISOString(sub.canceled_at)}"` : "null"}
          trial_start: ${sub.trial_start ? `"${epochToISOString(sub.trial_start)}"` : "null"}
          trial_end: ${sub.trial_end ? `"${epochToISOString(sub.trial_end)}"` : "null"}
        }
      ) { id }
    }
  `);
}

async function findUserIdByCustomerId(providerCustomerId) {
  const res = await apiRequest(`
    query {
      billing_customers(filter: { provider_customer_id: { _eq: "${providerCustomerId}" } }) {
        user { id }
      }
    }
  `);
  const userId = res?.billing_customers?.[0]?.user?.id;
  return userId || null;
}

async function resolvePlanIdDB(subscription, planIdDBFromMeta) {
  // If caller already passed a numeric plan id, use it
  if (Number.isInteger(Number(planIdDBFromMeta))) {
    return Number(planIdDBFromMeta);
  }

  // Try to infer from the Stripe subscription's first item price
  const priceId =
    subscription?.items?.data?.[0]?.price?.id ||
    subscription?.items?.data?.[0]?.plan?.id || // legacy plan field
    null;

  if (!priceId) {
    return null; // no way to infer
  }

  const q = `
    query {
      plan_payment_providers(filter: { provider_price_id: { _eq: "${priceId}" } }) {
        sub_plan_id { id }
      }
    }
  `;
  const res = await apiRequest(q);
  const planId = res?.plan_payment_providers?.[0]?.sub_plan_id?.id;
  return planId ? Number(planId) : null;
}


function epochToISOString(epoch) {
  if (epoch == null) return null;
  const n = Number(epoch);
  if (!Number.isFinite(n)) return null;
  const ms = n < 1e12 ? n * 1000 : n; // seconds → ms (or already ms)
  return new Date(ms).toISOString();
}

export default router;