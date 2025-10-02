import Router from "koa-router";
import axios from "axios";
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_KEY);

import {
  getPaymentId,
  savePaymentId,
  updatePaymentEvent,
} from "../../hooks/directusHooks.mjs";

import {
  paymentExpiration,
  backendApiKey,
  backendUrl,
} from "../../helpers/constants.mjs";
import { createPayment } from "./createPayment.mjs";
import { apiRequest } from "../../helpers/apicall.mjs";
import { triggerEmail } from "../../helpers/brevoSdk.mjs";

const router = new Router();
const OLD_BASE_URL = `/v1/wompi`;
const BASE_URL = `/v1/payment`;
//const redirect_url = "https://launchpad.loop.fans/transaction";

// ********************* //
// Generate Payment ID
// ********************* //
router.post(
  [`${OLD_BASE_URL}/generate_paymentid`, `${BASE_URL}/generate_paymentid`],
  async (ctx) => {
    const {
      wallet_addr,
      user,
      launchpad_id,
      collection_name,
      collection_addr,
      collection_desc,
      payment_amount,
      number_of_nfts,
      document_id,
      referral,
      provider,
    } = ctx.request.body;
    const originUrl = new URL(
      "/transaction",
      ctx.request.headers.origin
    ).toString();
    try {
      // Fetch Launchpad data
      await axios({
        url: `${backendUrl}/graphql`,
        method: "post",
        headers: { Authorization: `Bearer ${backendApiKey}` },
        data: {
          query: `
          query {
            fans_launchpad(
              filter: { launchpad_type: { fan_collection: { address: {_eq: "${collection_addr}"}} } }
            ) {
              mint_status
            }
          }                  
            `,
        },
      }).then(async (res) => {
        console.log("Collection found", res.data.data.fans_launchpad[0]);
        // Check Minting Status
        const mint_active =
          res.data.data.fans_launchpad[0]?.mint_status === "active";

        if (mint_active) {
          const payment_asset = "COP";
          const currentDate = new Date();
          const expires_at = new Date(
            currentDate.getTime() + paymentExpiration
          ).toISOString();

          // Generate Payment ID
          const payment = await createPayment({
            name: collection_name,
            description: collection_desc,
            single_use: true,
            collect_shipping: false,
            currency: payment_asset,
            amount_in_cents: payment_amount,
            expires_at: expires_at, // Expiry date in ISO 8601 format and UTC timezone
            redirect_url: originUrl,
            provider,
            number_of_nfts,
          });

          // Save Payment ID to Backend
          await savePaymentId({
            wallet_addr,
            user,
            launchpad_id,
            collection_addr,
            payment_id: payment.id,
            number_of_nfts: number_of_nfts,
            payment_amount: payment_amount,
            payment_asset: payment_asset,
            expires_at: expires_at,
            provider,
            document_id: document_id,
            referral: referral,
          });
          ctx.status = 200;
          ctx.body = { data: { id: payment.id, url: payment.url } };
          return;
        } else {
          ctx.status = 400;
          ctx.body = "Minting is Paused";
          return;
        }
      });
    } catch (err) {
      console.log(err, ctx);
      ctx.status = err.response.status;
      ctx.body = err.response.data;
      return;
    }
  }
);

// ********************* //
// ! Deprecated: use one of events/stripe or events/wompi.
// Update Payment Event
// ********************* //
router.post([`${OLD_BASE_URL}/events`, `${BASE_URL}/events`], async (ctx) => {
  let agent = ctx.request.headers["user-agent"].toLowerCase();
  console.log("agent", agent);
  console.log("Deprecated: use one of events/stripe or events/wompi.");
  try {
    // Check if user has a Payment ID
    const { data } = ctx.request.body;
    let event;
    if (agent.indexOf("faraday") > -1 || agent.indexOf("wompi") > -1) {
      console.log("wompi data", data);
      if (data.transaction.payment_link_id) {
        event = await handleWompiEvent(data.transaction);
      }
    } else if (agent.indexOf("stripe") > -1) {
      console.log("stripe data", data);
      event = await handleStripeEvent(data.object);
    }

    ctx.status = 200;
    ctx.body = { data: { id: event } };
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// ********************* //
// Update Payment Event: Stripe
// ********************* //
router.post(
  [`${OLD_BASE_URL}/events/stripe`, `${BASE_URL}/events/stripe`],
  async (ctx) => {
    try {
      // Check if user has a Payment ID
      const { data } = ctx.request.body;
      const event = await handleStripeEvent(data.object);
      ctx.status = 200;
      ctx.body = { data: { id: event } };
      return;
    } catch (err) {
      console.log(err, ctx);
      ctx.status = err.response.status;
      ctx.body = err.response.data;
      return;
    }
  }
);

// ********************* //
// Update Payment Event: Wompi
// ********************* //
router.post(
  [`${OLD_BASE_URL}/events/wompi`, `${BASE_URL}/events/wompi`],
  async (ctx) => {
    try {
      // Check if user has a Payment ID
      const { data } = ctx.request.body;
      const event = await handleWompiEvent(data.transaction);
      ctx.status = 200;
      ctx.body = { data: { id: event } };
      return;
    } catch (err) {
      console.log(err, ctx);
      ctx.status = err.response.status;
      ctx.body = err.response.data;
      return;
    }
  }
);

// ********************* //
// Stripe Payment Webhook
// ********************* //
router.post(`${BASE_URL}/webhook`, async (ctx) => {
  try {
    const { data } = ctx.request.body;
    const { object } = data;
    const {
      metadata: { payment_type },
    } = object;
    switch (object.object) {
      case "charge":
        if (payment_type === "NFT") return await handleStripeEvent(object);
      default:
        console.log("Unhandled event type", object.object);
        break;
    }
    // Check if user has a Payment ID
    ctx.status = 200;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// ********************* //
// Stripe Payment Intent
// ********************* //
router.post(`${BASE_URL}/intent`, async (ctx) => {
  try {
    // Check if user has a Payment ID
    const { collection_id, quantity, wallet_address, user, minPrice } = ctx.request.body;
    //const event = await handleWompiEvent(data.transaction);

    const calculateOrderAmount = async (collection_id) => {
      // Replace this constant with a calculation of the order's amount
      // Calculate the order total on the server to prevent
      // people from directly manipulating the amount on the client

      const collectionQuery = `
      query {
        fans_collections_by_id(id: "${collection_id}") {
          id
          address
          starknet_address
          artist {
            first_name
            sso_email
          }
          fans_launchpad_type {
            launchpad_id {
							id
						}
            launchInfo {
              mintPrice
              minPrice
              is_free
            }
          }
        }
      }`;

      const { fans_collections_by_id: collection } = await apiRequest(
        collectionQuery
      );
      const {
        launchInfo: { mintPrice, minPrice: _minPrice },
      } = collection.fans_launchpad_type[0];
      const {
        address,
        starknet_address,
        fans_launchpad_type,
        artist: { first_name, sso_email: email },
      } = collection;
      const { launchpad_id } = fans_launchpad_type[0];
      const launchpadId = launchpad_id.id;
      let final_address = address;
      if (address.toLowerCase() == "tbd") {
        final_address = starknet_address;
      }
      let checkedMinPrice = 0.0;
      if (!_minPrice || !_minPrice == "null"){
        checkedMinPrice = parseFloat(_minPrice)
      }
      let [price, symbol = "USD"] = mintPrice?.split(" ") || ["", "USD"];
      if (parseFloat(mintPrice) == 0){
        if (parseFloat(minPrice) < checkedMinPrice) {
          ctx.status = 500;
          ctx.body = "provided minimum price must be greater than the launchpad/collection's min price";
          return;
        }
        ([price, symbol = "USD"] = minPrice?.split(" ") || ["", "USD"]);
      }
      // remove usd from price string
      
      return {
        amount: parseInt(price * 100 * quantity),
        currency: symbol ?? "USD",
        metadata: {
          payment_type: "NFT",
          customer_email: email,
          customer_name: first_name,
          address: wallet_address,
          collection_id,
          quantity,
        },
        address: final_address,
        launchpadId,
      };
    };

    const { amount, currency, metadata, launchpadId, address } =
      await calculateOrderAmount(collection_id);

    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents
      .create({
        amount: amount,
        currency: currency,
        metadata: metadata,
        automatic_payment_methods: {
          enabled: true,
        },
      })
      .catch((err) => {
        console.log(err);
      });
    // Client Secret
    const clientSecret = paymentIntent.client_secret;
    const paymentIntentId = paymentIntent.id;

    // save payment_id to backend
    await savePaymentId({
      wallet_addr: wallet_address,
      user,
      launchpad_id: launchpadId,
      collection_addr: address,
      payment_id: paymentIntentId,
      number_of_nfts: quantity,
      payment_amount: amount,
      payment_asset: currency,
      expires_at: null,
      provider: "stripe",
      document_id: "null",
      referral: "null",
      clientSecret: clientSecret,
    });

    ctx.status = 200;
    ctx.body = {
      clientSecret: clientSecret,
    };
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

async function handleWompiEvent(transaction) {
  const payment_id = transaction.payment_link_id;
  const transaction_id = transaction.id;
  const status = transaction.status;
  const reference = transaction.reference;
  return await updatePaymentEvent({
    payment_id,
    transaction_id,
    status,
    reference,
  });
}

async function handleStripeEvent(transaction) {
  const payment_id = transaction.id;
  let status = transaction.status;
  if(transaction.object != "payment_intent" || status != "succeeded" ) {
    console.log(`transaction recieved is not of payment intent or it's status not succeeded transaction type: ${transaction.object},  transaction status: ${status}`)
    return;
  }
  if (status == "succeeded") {
    status = "APPROVED";

    // fetch User of the payment
    const paymentInfo = await apiRequest(`
      query {
        payment_history(filter: { payment_id: { _eq: "${payment_id}" } }) {
          user {
            id
            username
            sso_email
            first_name
          }
          launchpad_id {
            project_name
            artist {
              id
              sso_email
              first_name
            }
          }
        }
      }
    `);

    console.log("payment_history", paymentInfo.payment_history[0]);
    const { launchpad_id: { project_name, artist: { id: artist_id, sso_email: artist_email, first_name: artist_name } }, user: { id: transaction_userid, username: transaction_username, sso_email: transaction_userEmail } } = paymentInfo.payment_history[0];

    // fetch User balance
    const { artist_balances } = await apiRequest(`
      query {
        artist_balances(filter: { artist: { id: { _eq: "${artist_id}" } } }) {
          balance_id
          balance
        }
      }
    `);
    // check if artist_balance exists
    switch (artist_balances.length) {
      case 0:
        // create artist_balance
        await apiRequest(`
          mutation {
            create_artist_balances_item(data: { balance: ${(transaction.amount / 100)}, artist: { id: "${artist_id}" } } ) {
              balance_id
            }
          }
        `);
        break;
      case 1:
        // Add balance to user
        const { balance, balance_id } = artist_balances[0];
        // convert balance to USD
        const updatedBalance = balance + (transaction.amount / 100);
        await apiRequest(`
          mutation {
            update_artist_balances_item(id: ${balance_id}, data: { balance: ${updatedBalance} } ) {
              balance_id
            }
          }
        `);
        break;
      default:
        break;
    }

    // Send Transactional Email
    try {
      // Send Email to Artist
      await triggerEmail({
        email: artist_email,
        name: artist_name,
        templateId: 98,
        params: {
          "collection_name": project_name,
          "return_url": `https://www.loop.fans/user/${transaction_userid || transaction_username}?tab=nfts`,
        },
      });

      // Send Email to FAN
      await triggerEmail({
        email: transaction_userEmail,
        name: transaction_username,
        templateId: 99,
        params: {
          "collection_name": project_name,
          "return_url": `https://www.loop.fans/user/${transaction_userid || transaction_username}?tab=nfts`,
        },
      });
    } catch (error) {
      console.error(error);
    }
  }

  const reference = payment_id;
  const transaction_id = payment_id;
  return await updatePaymentEvent({
    payment_id,
    transaction_id,
    status,
    reference,
  });
  return;
}

export default router;
