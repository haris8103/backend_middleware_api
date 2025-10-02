import Router from "koa-router";
import axios from "axios";
import authCheck, { getWallets } from "../../../../helpers/auth.mjs";
import botProtection from "../../../../middleware/botProtection.mjs";

import getUserAccount from "./userAccount.mjs";
import { backendApiKey, backendUrl } from "../../../../helpers/constants.mjs";

import dotenv from "dotenv";
import { apiRequest } from "../../../../helpers/apicall.mjs";
dotenv.config();

const router = new Router();
const BASE_URL = `/v1/user`;

// Apply bot protection to all routes
router.use(botProtection);

// ********************* //
// User Logged In
// ********************* //
router.post(`${BASE_URL}/userInfo`, async (ctx) => {
  const { cookie, address } = ctx.request.body;

  try {
    const data = await authCheck({ cookie });
    const user = data && address && (await getUserAccount({ data, address, cookie }));

    if (user) {
      ctx.status = 200;
      ctx.body = user;
      return;
    }

    ctx.status = 400;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Get Following IDs
// ********************* //
router.post(`${BASE_URL}/followingIds`, async (ctx) => {
  try {
    const { cookie, userInfo } = ctx.request.body;
    const userAuth = await authCheck({ cookie });
    if (userAuth) {
      if (userAuth.profileId === userInfo.profile_id) {
        // User Account Data
        const response = await axios({
          url: `${backendUrl}/graphql`,
          method: "post",
          headers: { Authorization: `Bearer ${backendApiKey}` },
          data: {
            query: `
            query {
              fans_followers(
                filter: { user_id: { id: { _eq: "${userInfo.id}" } } }
              ) {
                follower_id {
                  id
                }
              }
            }
            `,
          },
        });

        ctx.status = 200;
        ctx.body = response.data.data.fans_followers;
        return;
      }
    }
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Get Following: Count
// ********************* //
router.post(`${BASE_URL}/followCount`, async (ctx) => {
  try {
    const { userId } = ctx.request.body;
    // check if user is UUID
    const isUUID = userId.match(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-5][0-9a-fA-F]{3}-[089abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
    );
    // Get Following Count
    const FollowingCount = await axios({
      url: `${backendUrl}/graphql`,
      method: "post",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: {
        query: `
            query {
              fans_followers_aggregated(filter: {
                user_id: {
                  ${isUUID ? "id" : "username"}: { _eq: "${userId}"}
                }
              }) {
                count {
                  id
                }
              }
            }
            `,
      },
    });

    // Get Follower Count
    const FollowerCount = await axios({
      url: `${backendUrl}/graphql`,
      method: "post",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: {
        query: `
          query {
            fans_followers_aggregated(filter: {
              follower_id: {
                ${isUUID ? "id" : "username"}: { _eq: "${userId}"}
              }
            }) {
              count {
                id
              }
            }
          }
        `,
      },
    });

    ctx.status = 200;
    ctx.body = {
      following_count:
        FollowingCount.data.data.fans_followers_aggregated[0]?.count?.id ?? 0,
      followers_count:
        FollowerCount.data.data.fans_followers_aggregated[0]?.count?.id ?? 0,
    };
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Get following List
// ********************* //
router.post(`${BASE_URL}/followingList`, async (ctx) => {
  try {
    const { userId, limit, page } = ctx.request.body;
    // check if user is UUID
    const isUUID = userId.match(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-5][0-9a-fA-F]{3}-[089abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
    );
    if (userId) {
      // Fetch Following
      const { fans_followers: following } = await apiRequest(`
        query {
          fans_followers(
            filter: {
              user_id: {
                ${isUUID ? "id" : "username"}: { _eq: "${userId}"}
              }
            }
            limit: ${limit}
            page: ${page}
          ) {
            user: follower_id {
              id
              role
              first_name
              display_name
              username
              description
              avatar { id }
              wallet_address 
            }
          }
        }
      `);
      ctx.status = 200;
      ctx.body = following;
      return;
    }
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});


// ********************* //
// Get follower List
// ********************* //
router.post(`${BASE_URL}/followerList`, async (ctx) => {
  try {
    const { userId, limit, page } = ctx.request.body;
    // check if user is UUID
    const isUUID = userId.match(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-5][0-9a-fA-F]{3}-[089abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
    );
    if (userId) {
      // Fetch Following
      const { fans_followers: followers } = await apiRequest(`
        query {
          fans_followers(
            filter: {
              follower_id: {
                ${isUUID ? "id" : "username"}: { _eq: "${userId}"}
              }
            }
            limit: ${limit}
            page: ${page}
          ) {
            user: user_id {
              id
              role
              first_name
              display_name
              username
              description
              avatar { id }
              wallet_address
            }
          }
        }
      `);
      ctx.status = 200;
      ctx.body = followers;
      return;
    }
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// User Logged In user wallets
// ********************* //
router.post(`${BASE_URL}/user-wallets`, async (ctx) => {
  const { cookie } = ctx.request.body;

  try {
    const data = await getWallets({ cookie });

    if (data) {
      ctx.status = 200;
      ctx.body = data;
      return;
    }

    ctx.status = 400;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

export default router;
