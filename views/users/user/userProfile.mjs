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
const BASE_URL = `/v1/user/update`;

// ********************* //
// Update WhatsApp
// ********************* //
router.post(`${BASE_URL}/whatsapp`, async (ctx) => {
  try {
    const { cookie, userInfo, whatsapp } = ctx.request.body;
    const userAuth = await authCheck({ cookie });
    if (userAuth) {
      if (userAuth.profileId === userInfo.profile_id) {
        // User Account Data
        const response = await axios({
          url: `${backendUrl}/graphql/system`,
          method: "post",
          headers: { Authorization: `Bearer ${backendApiKey}` },
          data: {
            query: `
            mutation {
              update_users_item(id: "${userInfo.id}", data: { whatsapp: "${whatsapp}" }) {
                id
                whatsapp
              }
            }            
            `,
          },
        });
        ctx.status = 200;
        ctx.body = "ok";
        return;
      }
    }
  } catch (err) {
    console.log(err, ctx);
    return;
  }
});

export default router;
