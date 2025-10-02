import Router from "koa-router";
import axios from "axios";
import {
  backendApiKey,
  backendUrl,
  fanRoleId,
} from "../../../helpers/constants.mjs";
import authCheck from "../../../helpers/auth.mjs";
import dotenv from "dotenv";
dotenv.config();

const router = new Router();
const BASE_URL = `/v1/merchant`;

const merchantRole = "34235bd4-6794-43f7-b742-587691f04bae";

// ********************* //
// Events
// ********************* //
router.post(`${BASE_URL}/events`, async (ctx) => {
  try {
    const { cookie, userInfo } = ctx.request.body;
    const userAuth = await authCheck({ cookie });

    if (userAuth) {
      if (userAuth.profileId === userInfo.profile_id) {
        if (userInfo.role === merchantRole) {
          const getmerchantAccess = await axios({
            url: `${backendUrl}/graphql`,
            method: "post",
            headers: { Authorization: `Bearer ${backendApiKey}` },
            data: {
              query: `
            query {
              fan_merchants(
                filter: {
                  merchant: { id: { _eq: "${userInfo.id}" } }
                }
              ) {
                merchant {
                  id
                  first_name
                }
                creators {
                  id
                }
              }
            }            
            `,
            },
          });

          const creators =
            getmerchantAccess.data.data.fan_merchants[0].creators;
          const creatorIds = [];

          for (let index = 0; index < creators.length; index++) {
            const creatorId = creators[index].id;
            creatorIds.push(creatorId);
          }

          const getCollections = await axios({
            url: `${backendUrl}/graphql`,
            method: "post",
            headers: { Authorization: `Bearer ${backendApiKey}` },
            data: {
              query: `
            query {
              fans_launchpad(
                filter: {
                  artist: { id: { _in: "${creatorIds}" } }
                }
              ) {
                id
                status
                mint_status
                collection_type
                project_name
                project_slug
                launchpad_type {
                  collection  {
                    name
                    artist {
                      first_name
                      avatar {
                        id
                      }
                    }
                  }
                  launchInfo {
                    NFT
                  }
                }
              }
            }         
            `,
            },
          });

          const result = getCollections.data.data.fans_launchpad;
          ctx.status = 200;
          ctx.body = result;
          return;
        } else {
          ctx.status = 401;
          return;
        }
      }
    }
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

export default router;
