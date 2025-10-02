import dotenv from "dotenv";
dotenv.config();

import Router from "koa-router";
import axios from "axios";
import crypto from "crypto";
import cache from "../helpers/cache.mjs";

import {
  backendApiKey,
  backendUrl,
  indexerUrl,
} from "../helpers/constants.mjs";
import { updatePaymentEvent } from "../hooks/directusHooks.mjs";

const router = new Router();
const BASE_URL = `/v1/marketplace`;

// ********************* //
// Get Fav Items
// ********************* //
router.get(`${BASE_URL}/favs/:platoform/:id`, async (ctx) => {
  const { platoform, id } = ctx.params;
  try {
    const collection = await axios({
      url: `${backendUrl}/graphql`,
      method: "post",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: {
        query: `
          query {
            favorites(sort: ["sort" "-date_created"], filter: { wallet_address: { _eq: "${id}" }, platform: { _eq: "${platoform}"} }) {
                fav_type
                collection {
                    id
                    name
                    url
                    banner { id }
                }
                cosmos_launchpad {
                    id
                    project_name
                    project_slug
                    banner { id }
                }
                fans_launchpad {
                  id
                  project_name
                  project_slug
                  banner { id }
              }
            }
        }        
          `,
      },
    });

    ctx.status = 200;
    ctx.body = collection.data.data.favorites;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Check if item is fav
// ********************* //
router.get(
  `${BASE_URL}/favs/:platform/:type/:id/:address`,
  async (ctx) => {
    const { platform, type, id, address } = ctx.params;

    const filter = `{
    wallet_address: { _eq: "${address}" },
    platform: { _eq: "${platform}" },
    ${
      type === "collection"
        ? `fav_type: { _eq: "collection" }`
        : `fav_type: { _eq: "launchpad" }`
    },
    ${
      type === "collection"
        ? `collection: { id: { _eq: ${id} } }`
        : `collection: { id: { _null: true } }`
    },
    ${
      type === "fans_launchpad"
        ? `fans_launchpad: { id: { _eq: ${id} } }`
        : `fans_launchpad: { id: { _null: true } }`
    },
    ${
      type === "cosmos_launchpad"
        ? `cosmos_launchpad: { id: { _eq: ${id} } }`
        : `cosmos_launchpad: { id: { _null: true } }`
    },
  }`;

    try {
      const collection = await axios({
        url: `${backendUrl}/graphql`,
        method: "post",
        headers: { Authorization: `Bearer ${backendApiKey}` },
        data: {
          query: `
            query {
              favorites(
                sort: ["sort" "-date_created"],
                filter: ${filter}){
                  fav_type
                  collection {
                      id
                      name
                      url
                      banner { id }
                  }
                  cosmos_launchpad {
                      id
                      project_name
                      project_slug
                      banner { id }
                  }
                  fans_launchpad {
                    id
                    project_name
                    project_slug
                    banner { id }
                }
              }
          }        
            `,
        },
      });

      ctx.status = 200;
      ctx.body = collection.data.data.favorites.length > 0 ? true : false;
      return;
    } catch (err) {
      console.log(err, ctx);
      ctx.status = 400;
      ctx.body = err;
      return;
    }
  }
);

// ********************* //
// Check Transaction Status
// ********************* //
router.get(`${BASE_URL}/transaction_status/:transaction_id`, async (ctx) => {
  const { transaction_id } = ctx.params;
  try {
    const request = await axios.get(
      `${backendUrl}/items/payment_history?filter[transaction_id][_eq]=${transaction_id}&fields=id,payment_status,payment_amount,payment_id,transaction_id,wallet_addr,payment_provider,reference,collection_addr,number_of_nfts,launchpad_id.project_slug,date_updated`
    );

    ctx.status = 200;
    ctx.body = request.data.data[0];
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// ********************* //
// Test Payment Event
// ********************* //
/* router.get(`${BASE_URL}/test`, async (ctx) => {
  try {
    await updatePaymentEvent({
      payment_id: "crvMAJ",
      transaction_id: "1111111-1111111",
      status: "APPROVED",
      reference: "111111111111111111111",
    });

    ctx.status = 200;
    ctx.body = "ok";
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
}); */

export default router;
