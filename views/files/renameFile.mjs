import Router from "koa-router";
import { apiRequestSystem } from "../../helpers/apicall.mjs";
import checkCookie from "../../helpers/auth.mjs";

const router = new Router();
const BASE_URL = `/v1/file`;

// ********************* //
// Rename File
// ********************* //
router.post(`${BASE_URL}/rename`, async (ctx) => {
  const { cookie, file_id, file_name } = ctx.request.body;

  try {
    // Check Cookie
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

    // Fetch File Information
    const fileQuery = `
      query {
        files_by_id(id: "${file_id}") {
          id
          created_by
        }
      }
    `;
    const { files_by_id: media } = await apiRequestSystem(fileQuery);

    // Check Auth, is user the creator of the file
    if (media.created_by !== user[0].id) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // Attach file to album
    const attachFileQuery = `
      mutation {
        update_files_item(id: "${file_id}", data: { title: "${file_name}" }) {
          id
        }
      }    
    `;
    await apiRequestSystem(attachFileQuery);

    ctx.status = 200;
    ctx.body = { file_id, file_name };
    return;
  } catch (err) {
    //console.log(err, ctx);
    console.log(err);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

export default router;
