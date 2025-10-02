import Router from "koa-router";
import Stripe from "stripe";
import { apiRequest, apiRequestSystem } from "../../../helpers/apicall.mjs";
import mustBeAuthenticated from "../../../middleware/mustBeAuthenticated.mjs";

const router = new Router();
const BASE_URL = `/v1/user/billing`;

if (!process.env.FRONTEND_URL) {
  throw "Please add FRONTEND_URL to your .env file";
}
if (!process.env.STRIPE_SECRET_KEY) {
  throw "Please add STRIPE_SECRET_KEY to your .env file";
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 *  User Current Plan API
 *  @route GET /v1/user/billing/plan
 *  @header {string} user_cookie - User cookie
 */
router.get(`${BASE_URL}/plan`, mustBeAuthenticated, async (ctx) => {
  try {
    const userAuth = ctx.state.userAuth;
    const userPlan = await fetchUserPlan(userAuth.email);
    ctx.status = 200;
    ctx.body = userPlan?.subscriptions?.[0] || null;
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});

/**
 *  Upgrade Plan API
 *  @route POST /v1/user/billing/upgrade
 *  @header {string} user_cookie - User cookie
 *  @body {string} planId - Plan ID
 */
router.post(`${BASE_URL}/upgrade`, mustBeAuthenticated, async (ctx) => {
  const userAuth = ctx.state.userAuth;
  const { planId } = ctx.request.body;

  if (!planId) {
    ctx.status = 400;
    ctx.body = { error: "Plan ID is required" };
    return;
  }

  const userPlan = await fetchUserPlan(userAuth.email);
  if (userPlan?.subscriptions?.[0]?.status === "active") {
    ctx.status = 400;
    ctx.body = {
      error:
        "You already have an active plan. Use the modify endpoint to change plans.",
    };
    return;
  }
  try {
    // Get plan details and price ID from Directus
    const planQuery = `
      query {
        subscription_plans(filter: { id: { _eq: "${planId}" } }) {
          id
          name
          plan_payment_providers {
            provider_price_id
            provider_subscription_plan_id
            payment_provider {
              id
              provider_name
            }
          }
        }
      }
    `;

    const planData = await apiRequest(planQuery);
    const plan = planData.subscription_plans?.[0];
    if (!plan) {
      ctx.status = 400;
      ctx.body = { error: "Plan not found" };
      return;
    }

    // Get Stripe price ID from the plan
    const stripeProvider = plan.plan_payment_providers?.find(
      (provider) => provider.payment_provider.provider_name === "Stripe"
    );

    if (!stripeProvider?.provider_price_id) {
      ctx.status = 400;
      ctx.body = { error: "Stripe price ID not configured for this plan" };
      return;
    }

    const priceId = stripeProvider.provider_price_id;

    // Create or get Stripe customer
    let customerId = await getOrCreateStripeCustomer(
      userAuth.profileId,
      userAuth.email
    );

     const { users: userInfo } = await apiRequestSystem(
        `query {
          users(filter: { profile_id: { _eq: "${userAuth.profileId}" } }) {
            id
          }
        }`
      );
      if(!userInfo?.[0]?.id){
        ctx.status = 400;
        ctx.body = { error: "User not found" };
        return;
      }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      customer: customerId,
      success_url: `${
        process.env.FRONTEND_URL || "http://localhost:" + process.env.PORT
      }/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${
        process.env.FRONTEND_URL || "http://localhost:" + process.env.PORT
      }/billing`,
      subscription_data: {
        metadata: {
          user_id: userInfo?.[0]?.id,
          planIdDB: planId,
        },
      },
    });
    // console.log("====customerIdcustomerId", {customerId,profileId:userAuth.profileId,
      // email:userAuth.email})
    ctx.status = 200;
    ctx.body = { sessionId: session.id, redirectUrl: session.url };
  } catch (error) {
    console.error("Upgrade error:", error);
    ctx.status = 500;
    ctx.body = { error: "Error creating checkout session" };
  }
});

/**
 *  Upgrade Plan Success API
 *  @route GET /v1/user/billing/success
 */
router.get(`${BASE_URL}/success`, async (ctx) => {
  try {
    const { session_id } = ctx.query;

    if (!session_id) {
      ctx.status = 400;
      ctx.body = { error: "Session ID is required" };
      return;
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === "paid" && session.mode === "subscription") {
      ctx.status = 200;
      ctx.body = {
        message: "Payment successful! Your subscription is being activated.",
        session: {
          id: session.id,
          status: session.payment_status,
          subscription_id: session.subscription,
        },
      };
    } else {
      ctx.status = 400;
      ctx.body = {
        error: "Payment not completed or invalid session",
        session: {
          id: session.id,
          status: session.payment_status,
          mode: session.mode,
        },
      };
    }
  } catch (error) {
    console.error("Success handler error:", error);
    ctx.status = 500;
    ctx.body = { error: "Error processing success callback" };
  }
});

/**
 * Cancel/Failure Route
 * @route GET /v1/user/billing/cancel
 */
router.get(`${BASE_URL}/cancel`, async (ctx) => {
  ctx.status = 200;
  ctx.body = {
    message: "Payment was canceled. You can try again anytime.",
    redirect_url: `${
      process.env.FRONTEND_URL || "http://localhost:3000"
    }/billing`,
  };
});

/**
 * Modify Subscription API
 * @route PUT /v1/user/billing/subscription/modify
 * @header {string} user_cookie - User cookie
 * @body {string} action - Action to perform (upgrade, downgrade, cancel, reactivate)
 * @body {string} newPlanId - New plan ID (for upgrade/downgrade)
 */
// router.put(
//   `${BASE_URL}/subscription/modify`,
//   mustBeAuthenticated,
//   async (ctx) => {
//     try {
//       const userAuth = ctx.state.userAuth;
//       const { action, newPlanId } = ctx.request.body;

//       if (!action) {
//         ctx.status = 400;
//         ctx.body = { error: "Action is required" };
//         return;
//       }

//       const userPlan = await fetchUserPlan(userAuth.email);
//       const currentSubscription = userPlan?.subscriptions?.[0];

//       if (!currentSubscription) {
//         ctx.status = 404;
//         ctx.body = { error: "No active subscription found" };
//         return;
//       }

//       let result;
//       switch (action) {
//         case "upgrade":
//         case "downgrade":
//           result = await modifySubscriptionPlan(
//             currentSubscription,
//             newPlanId,
//             action
//           );
//           break;
//         case "cancel":
//           result = await cancelSubscription(currentSubscription);
//           break;
//         case "reactivate":
//           result = await reactivateSubscription(currentSubscription);
//           break;
//         default:
//           ctx.status = 400;
//           ctx.body = {
//             error:
//               "Invalid action. Supported actions: upgrade, downgrade, cancel, reactivate",
//           };
//           return;
//       }

//       ctx.status = 200;
//       ctx.body = result;
//     } catch (err) {
//       console.error("Subscription modification error:", err);
//       ctx.status = 500;
//       ctx.body = { error: err.message };
//     }
//   }
// );

/**
 * Get Subscription Details API
 * @route GET /v1/user/billing/subscription/details
 * @header {string} user_cookie - User cookie
 */
router.get(
  `${BASE_URL}/subscription/details`,
  mustBeAuthenticated,
  async (ctx) => {
    try {
      const userAuth = ctx.state.userAuth;
      const userPlan = await fetchUserPlan(userAuth.email);
      const currentSubscription = userPlan?.subscriptions?.[0];

      if (!currentSubscription) {
        ctx.status = 404;
        ctx.body = { error: "No subscription found" };
        return;
      }

      // Get Stripe subscription details
      if (currentSubscription.provider_subscription_id) {
        const stripeSubscription = await stripe.subscriptions.retrieve(
          currentSubscription.provider_subscription_id
        );

        ctx.status = 200;
        ctx.body = {
          ...currentSubscription,
          stripe_details: {
            status: stripeSubscription.status,
            current_period_start: stripeSubscription.current_period_start,
            current_period_end: stripeSubscription.current_period_end,
            cancel_at_period_end: stripeSubscription.cancel_at_period_end,
            canceled_at: stripeSubscription.canceled_at,
            trial_start: stripeSubscription.trial_start,
            trial_end: stripeSubscription.trial_end,
            items: stripeSubscription.items.data,
          },
        };
      } else {
        ctx.status = 200;
        ctx.body = currentSubscription;
      }
    } catch (err) {
      console.error("Get subscription details error:", err);
      ctx.status = 500;
      ctx.body = { error: err.message };
    }
  }
);

/**
 * Get Available Plans API
 * @route GET /v1/user/billing/plans
 */
router.get(`${BASE_URL}/plans`, async (ctx) => {
  try {
    const plansQuery = `
      query {
        subscription_tiers {
          id
          name
          subscription_plans {
            id
            name
            billing_interval
            price_cents
            status
            features
            description
            plan_payment_providers {
              provider_price_id
              provider_subscription_plan_id
              payment_provider {
                id
                provider_name
              }
            }
          }
        }
      }
    `;

    const plans = await apiRequest(plansQuery);
    ctx.status = 200;
    ctx.body = plans;
  } catch (err) {
    console.error("Get plans error:", err);
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});

async function fetchUserPlan(email) {
  const nowIso = new Date().toISOString();
  
  const query = `
      query {
        subscriptions(
          filter: {
            user: { sso_email: {_eq: "${email}"} }
            status: { _in: ["active", "trialing"] }
            current_period_end: { _gte: "${nowIso}" }
          }
          limit: 1
        ) {
          id
          date_created
          date_updated
          user{
            id,
            email
          }
            plan {
              id
              name
            }
          provider_customer_id
          provider_subscription_id
          status
          current_period_start
          current_period_end
          cancel_at_period_end
          canceled_at
          trial_start
          trial_end
        }
      }
    `;

  return await apiRequest(query);
}

/**
 * Get or create Stripe customer
 */
async function getOrCreateStripeCustomer(userId, email) {
  try {
    // Check if customer exists in Directus
    const customerQuery = `
      query {
        billing_customers(filter: { user: { sso_email: { _eq: "${email}" } } }) {
          id
          provider_customer_id
        }
      }
    `;

    const existingCustomer = await apiRequest(customerQuery);
    if (existingCustomer?.billing_customers?.length > 0) {
      return existingCustomer.billing_customers?.[0].provider_customer_id;
    }

    // Create new Stripe customer
    const stripeCustomer = await stripe.customers.create({
      email: email,
      metadata: {
        user_id: userId,
      },
    });

    // Save to Directus
    const createCustomerQuery = `
      mutation {
        create_billing_customers_item(data: {
          provider_customer_id: "${stripeCustomer.id}"
          user: {id: "${userId}"}
          provider: 1
        }) {
          id
        }
      }
    `;
    await apiRequest(createCustomerQuery);

    return stripeCustomer.id;
  } catch (error) {
    console.error("Error creating/getting Stripe customer:", error);
    throw error;
  }
}

/**
 * Modify subscription plan (upgrade/downgrade)
 */
async function modifySubscriptionPlan(currentSubscription, newPlanId, action) {
  if (!newPlanId) {
    throw new Error("New plan ID is required for plan modification");
  }

  // Get new plan details with price ID
  const newPlanQuery = `
    query {
      subscription_plans(filter: { id: { _eq: "${newPlanId}" } }) {
        id
        name
        price_cents
        billing_interval
        plan_payment_providers {
          provider_price_id
          provider_subscription_plan_id
          payment_provider {
            id
            provider_name
          }
        }
      }
    }
  `;

  const newPlanData = await apiRequest(newPlanQuery);
  const newPlan = newPlanData.subscription_plans?.[0];

  if (!newPlan) {
    throw new Error("New plan not found");
  }

  // Get Stripe price ID from the new plan
  const stripeProvider = newPlan.plan_payment_providers?.find(
    (provider) => provider.payment_provider.provider_name === "Stripe"
  );

  if (!stripeProvider?.provider_price_id) {
    throw new Error("Stripe price ID not configured for the new plan");
  }

  const newPriceId = stripeProvider.provider_price_id;

  // Update Stripe subscription
  if (currentSubscription.provider_subscription_id) {
    const stripeSubscription = await stripe.subscriptions.retrieve(
      currentSubscription.provider_subscription_id
    );

    const updatedSubscription = await stripe.subscriptions.update(
      currentSubscription.provider_subscription_id,
      {
        items: [
          {
            id: stripeSubscription.items.data[0].id,
            price: newPriceId,
          },
        ],
        proration_behavior: "create_prorations",
      }
    );

    // Update in Directus
    const updateQuery = `
      mutation {
        update_subscriptions_items(
          filter: { id: { _eq: "${currentSubscription.id}" } }
          data: {
            tier: "${newPlanId}"
            status: "${updatedSubscription.status}"
            current_period_start: "${new Date(
              updatedSubscription.current_period_start * 1000
            ).toISOString()}"
            current_period_end: "${new Date(
              updatedSubscription.current_period_end * 1000
            ).toISOString()}"
          }
        ) {
          id
        }
      }
    `;

    await apiRequest(updateQuery);

    return {
      message: `Subscription ${action}d successfully`,
      subscription: updatedSubscription,
      new_plan: newPlan,
    };
  }

  throw new Error("No Stripe subscription found");
}

/**
 * Cancel subscription
 */
async function cancelSubscription(currentSubscription) {
  if (currentSubscription.provider_subscription_id) {
    const canceledSubscription = await stripe.subscriptions.update(
      currentSubscription.provider_subscription_id,
      {
        cancel_at_period_end: true,
      }
    );

    // Update in Directus
    const updateQuery = `
      mutation {
        update_subscriptions_items(
          filter: { id: { _eq: "${currentSubscription.id}" } }
          data: {
            cancel_at_period_end: true
            status: "${canceledSubscription.status}"
          }
        ) {
          id
        }
      }
    `;

    await apiRequest(updateQuery);

    return {
      message: "Subscription will be canceled at the end of the current period",
      subscription: canceledSubscription,
    };
  }

  throw new Error("No Stripe subscription found");
}

/**
 * Reactivate subscription
 */
async function reactivateSubscription(currentSubscription) {
  if (currentSubscription.provider_subscription_id) {
    const reactivatedSubscription = await stripe.subscriptions.update(
      currentSubscription.provider_subscription_id,
      {
        cancel_at_period_end: false,
      }
    );

    // Update in Directus
    const updateQuery = `
      mutation {
        update_subscriptions_items(
          filter: { id: { _eq: "${currentSubscription.id}" } }
          data: {
            cancel_at_period_end: false
            status: "${reactivatedSubscription.status}"
          }
        ) {
          id
        }
      }
    `;

    await apiRequest(updateQuery);

    return {
      message: "Subscription reactivated successfully",
      subscription: reactivatedSubscription,
    };
  }

  throw new Error("No Stripe subscription found");
}

export default router;
