import Router from "koa-router";
import axios from "axios";
import dotenv from "dotenv";

import {
  default_host,
  gethostCreatorRole,
  platform,
} from "../../helpers/constants.mjs";
import { apiRequest, apiRequestSystem } from "../../helpers/apicall.mjs";
import checkCookie from "../../helpers/auth.mjs";

dotenv.config();
const router = new Router();
const BASE_URL = `/v1/fan_funnel`;
const limit = 10;

// ********************* //
// Fetch Collections
// ********************* //
router.get(`${BASE_URL}`, async (ctx) => {
  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;

  try {
    const userAuth = await checkCookie({ cookie });
    if (!userAuth) {
      console.log("error checking Cookie");
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // Fetch User
    const { users: user } = await apiRequestSystem(`
          query {
            users(filter: { profile_id: { _eq: "${userAuth.profileId}" } }) {
              id
            }
          }
        `);

    const fan_funnel_query = `
        query { 
          fan_funnel(
          filter: {
            artist: { id: { _eq: "${user[0].id}" } }
          }
        ) {
            id
            items {
              id
              collection
              item{
              
                ... on pre_registration {
                  id
                  name
                  quantity
                  description
                  cover_image {
                    id
                    title
                  }
                  release_date
                  required_tags
                  is_default
                }
              }
            }
          }
        }
          `;

    // Fetch Launchpads
    const { fan_funnel: funFunnel } = await apiRequest(fan_funnel_query);
    ctx.status = 200;

    ctx.body = funFunnel?.[0];
    return;
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
    return;
  }
});

router.post(`${BASE_URL}`, async (ctx) => {
  console.log(ctx);
  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;
  console.log(user_cookie);

  try {
    const userData = await checkCookie({ cookie });
    if (!userData) {
      ctx.status = 401;
      ctx.body = { error: "Unauthorized" };
      return;
    }
    // Fetch User
    const { users: user } = await apiRequestSystem(`
          query {
            users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
              id
            }
          }
        `);

    const fan_funnel_query = `
        mutation { 
          create_fan_funnel_item (
            data:{
              artist: {
                id: "${user[0].id}"
              }
            }
          ) {
            id
            artist {
              id
            }
          }
        }
      `;

    // Fetch Launchpads
    const { create_fan_funnel_item: fanFunnel } = await apiRequest(
      fan_funnel_query
    );
    ctx.status = 200;
    ctx.body = fanFunnel;
    return;
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
    return;
  }
});

export default router;
