import axios from "axios";
import Router from "koa-router";
import { apiRequest, apiRequestSystem } from "../../../helpers/apicall.mjs";
import authCheck from "../../../helpers/auth.mjs";

const router = new Router();
const BASE_URL = `/v1/arena/post`;

router.patch(`${BASE_URL}/:id`, async (ctx) => {
  try {
    const { id } = ctx.params;
    const { cookie, content } = ctx.request.body;

    // Check JWT
    const userData = await authCheck({ cookie });

    // Check Cookie is present
    if (!cookie || !userData) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const fetchUsers = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          id
        }
      }
    `);

    const fetchPost = await apiRequest(`
      query {
        fans_posts(filter: { id: { _eq: "${id}" } }) {
          user_created {
            id
          }
        }
      }
    `);

    // Get User and Post Data
    const [users, posts] = await Promise.all([
      fetchUsers,
      fetchPost
    ]);

    // User Id
    const { id: userId } = users.users[0];

    // Post User Id
    const { id: postUserId } = posts.fans_posts[0].user_created;

    // Always Check if the user is the owner of the post before editing or deleting
    if (userId !== postUserId) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // Edit Query
    const editPostQuery = `
      mutation {
        update_fans_posts_item(id: "${id}", data: { content: "${content}"}) {
            id
          }
      }
    `;
    // Edit Post
    await apiRequest(editPostQuery);

    ctx.status = 200;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

router.delete(`${BASE_URL}/:id`, async (ctx) => {
  try {
    // Get Cookie and ID from the request
    /* const cookie = ctx.cookies.get("cookie"); */
    const { user_cookie } = ctx.request.headers;
    const cookie = user_cookie;
    const { id } = ctx.params;

    // Check JWT
    const userData = await authCheck({ cookie });

    // Check Cookie is present
    if (!cookie || !userData) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const fetchUsers = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          id
        }
      }
    `);

    const fetchPost = await apiRequest(`
      query {
        fans_posts(filter: { id: { _eq: "${id}" } }) {
          user_created {
            id
          }
        }
      }
    `);

    // Get User and Post Data
    const [users, posts] = await Promise.all([
      fetchUsers,
      fetchPost
    ]);

    // User Id
    const { id: userId } = users.users[0];

    // Post User Id
    const { id: postUserId } = posts.fans_posts[0].user_created;

    // Always Check if the user is the owner of the post before editing or deleting
    if (userId !== postUserId) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // Delete Query
    const deletePostQuery = `
      mutation {
        delete_fans_posts_item(id: "${id}") {
          id
        }
      }
    `;
    // Delete Post
    await apiRequest(deletePostQuery);

    ctx.status = 200;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

export default router;