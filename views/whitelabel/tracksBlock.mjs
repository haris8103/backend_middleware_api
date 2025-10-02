import Router from "koa-router";
import checkCookie from "../../helpers/auth.mjs";
import { apiRequest, apiRequestSystem } from "../../helpers/apicall.mjs";
import { useCookie } from "../../helpers/constants.mjs";

const router = new Router();
const BASE_URL = "/v1/blocks";

// Create a tracks block
router.post(`${BASE_URL}/tracks_block`, async (ctx) => {
  try {
    const { user_cookie, cookie: _cookie } = ctx.request.headers;
    const cookie = user_cookie || useCookie(_cookie);
    const user = await checkCookie({ cookie });

    if (!user) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // Fetch UserId
    const { users: userData } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${user.profileId}" } }) {
          id
          email
        }
      }
    `);

    if (!userData) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const { title, description, cb_tracks, domain, blockId } = ctx.request.body;

    // Sanitize text by escaping quotes
    const sanitize = (text) => text ? text.replace(/"/g, '\\"') : "";

    // Validate required fields
    if (!title || !cb_tracks || !domain || !blockId) {
      ctx.status = 400;
      ctx.body = { message: "Missing required fields" };
      return;
    }

    // Create tracks block with proper GraphQL structure
    const { create_tracks_block_item } = await apiRequest(`
      mutation {
        create_tracks_block_item(
          data: {
            title: "${sanitize(title)}",
            description: "${sanitize(description)}",
            cb_tracks: ${JSON.stringify(cb_tracks).replace(/"([^"]+)":/g, "$1:")}
          }
        ) {
          id
          title
          cb_tracks {
            id
            title
            artwork {
              id
            }
          }
        }
      }
    `);

    // Update content block by linking each track
    await apiRequest(`
      mutation {
        create_content_blocks_blocks_item(
          data: {
            collection: "tracks_block",
            content_blocks_id: { id: "${blockId}" },
            item: "${create_tracks_block_item.id}"
          }
        ) {
          id
        }
      }
    `);

    ctx.status = 200;
    ctx.body = { data: create_tracks_block_item };

    return;
  } catch (error) {
    console.error("Error creating tracks block:", error);
    ctx.status = error.response?.status || 500;
    ctx.body = error.response?.data || "Internal Server Error";
  }
});

// Update a tracks block
router.put(`${BASE_URL}/tracks_block/:id`, async (ctx) => {
  try {
    const { id: tracksBlockId } = ctx.params;
    const { user_cookie, cookie: _cookie } = ctx.request.headers;
    const cookie = user_cookie || useCookie(_cookie);
    const user = await checkCookie({ cookie });

    if (!user) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // Fetch UserId
    const { users: userData } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${user.profileId}" } }) {
          id
        }
      }
    `);

    if (!userData) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const req = ctx.request.body;
    const { blockId } = req;

    // Sanitize text by escaping quotes
    const sanitize = (text) => text ? text.replace(/"/g, '\\"') : "";

    // Validate required fields
    if (!req.status && (!req.title || !req.description || !req.cb_tracks) ||  !blockId || !tracksBlockId) {
      ctx.status = 400;
      ctx.body = { message: "Missing required fields" };
      return;
    }

    // Check if user is the owner of the content block
    const { content_blocks: contentBlock } = await apiRequest(`
      query {
        content_blocks(filter: { id: { _eq: "${blockId}" } }) {
          user {
            id
          }
        }
      }
    `);

    if (contentBlock[0].user.id !== userData[0].id) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // Update tracks block
    const { update_tracks_block_item } = await apiRequest(`
      mutation {
        update_tracks_block_item(
          id: "${tracksBlockId}",
          data: {
            ${req.title ? `title: "${sanitize(req.title)}",` : ""}
            ${req.description ? `description: "${sanitize(req.description)}",` : ""}
            ${req.cb_tracks ? `cb_tracks: ${JSON.stringify(req.cb_tracks).replace(/"([^"]+)":/g, "$1:")}`: ''}
            ${ req.status ? `status: "${req.status}",` : ""}
          }
        ) {
          id
          title
          description
          status
          cb_tracks {
            id
            title
            platforms
          }
        }
      }
    `);

    ctx.status = 200;
    ctx.body = { data: update_tracks_block_item };

    return;
  } catch (error) {
    console.error("Error updating tracks block:", error);
    ctx.status = error.response?.status || 500;
    ctx.body = error.response?.data || "Internal Server Error";
  }
});

export default router;
