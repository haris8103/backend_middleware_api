import dotenv from "dotenv";
import Router from "koa-router";
import { apiRequest } from "../../helpers/apicall.mjs";


dotenv.config();
const router = new Router();
const BASE_URL = `/v1`;

// ********************* //
// Subscription Plans
// ********************* //
router.get(BASE_URL + '/tiers-n-subscriptions', async (ctx) => {

    try {
        const subscriptionQuery = `
                    query {
                        subscription_tiers{
                        id
                        name
                        subscription_plans(filter: { status: { _eq: "published"}}){
                        id
                        name
                        features
                        description
                        price_cents
                        billing_interval
                    }
                }
            }
        `
        const subscription = await apiRequest(subscriptionQuery);

        ctx.status = 200;
        ctx.body = {
            subscriptionPlans: subscription ?? [],
        };
    } catch (err) {
        console.error("Error:", err);
        ctx.status = 500;
        ctx.body = { error: err.message };
    }
});

export default router;