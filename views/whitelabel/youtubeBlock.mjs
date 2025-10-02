import Router from "koa-router";
import axios from "axios";
import checkCookie from "../../helpers/auth.mjs";
import { apiRequest, apiRequestSystem } from "../../helpers/apicall.mjs";
import { backendApiKey, useCookie } from "../../helpers/constants.mjs";
import { useMixpanel } from "../../helpers/mixpanel.mjs";

const router = new Router();
const BASE_URL = "/v1/blocks";

router.delete(`${BASE_URL}/:id`, async (ctx) => {
  try {
    const { id: contentBlockId } = ctx.params;
    const { contentId } = ctx.query;
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

    // Check if user exists
    if (!userData) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // Validate required fields
    if (!contentBlockId || !contentId) {
      ctx.status = 400;
      ctx.body = { message: "Missing required fields" };
      return;
    }

    // is user the owner of the content block
    const { content_blocks: contentBlock } = await apiRequest(`
      query {
        content_blocks(filter: { id: { _eq: "${contentId}" } }) {
          user {
            id
          }
        }
      }
    `);

    // Check if user is the owner of the content block
    if (contentBlock[0].user.id !== userData[0].id) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // Delete the content block relationship
    await apiRequest(`
      mutation {
        delete_content_blocks_blocks_item(
          id: "${contentBlockId}"
        ) {
          id
        }
      }
    `);

    ctx.status = 200;
    ctx.body = {
      message: "Content block deleted successfully",
      id: contentBlockId,
    };

    // Track successful deletion - Fire and forget
    useMixpanel().sendMixpanel({
      event: "Content Block Deleted",
      data: {
        distinct_id: userData[0].id,
        block_id: contentBlockId,
        content_id: contentId,
        block_type: 'youtube',
        timestamp: new Date().toISOString()
      },
    }).catch(error => console.error('Failed to send Mixpanel event:', error));

    return;
  } catch (error) {
    // Track error event - Fire and forget
    useMixpanel().sendMixpanel({
      event: "Content Block Delete Error",
      data: {
        distinct_id: user?.profileId,
        error_type: error.response?.data?.error || 'Unknown',
        error_status: error.response?.status,
        endpoint: 'DELETE /blocks',
        timestamp: new Date().toISOString()
      },
    }).catch(err => console.error('Failed to send Mixpanel error event:', err));

    console.error("Error deleting block:", error);
    ctx.status = error.response?.status || 500;
    ctx.body = error.response?.data || "Internal Server Error";
  }
});

router.post(`${BASE_URL}/youtube_block`, async (ctx) => {
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
        }
      }
    `);

    if (!userData) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const { title, description, embeds, domain, blockId } = ctx.request.body;

    // Sanitize title by escaping quotes
    const sanitizedTitle = (name) => name.replace(/"/g, '\\"');

    // Validate required fields
    if (!title || !embeds || !domain || !blockId) {
      ctx.status = 400;
      ctx.body = "Missing required fields";
      return;
    }

    // Convert embeds to GraphQL format
    const graphqlEmbeds = JSON.stringify(embeds).replace(/"([^"]+)":/g, "$1:"); // Remove quotes around property names

    // Create youtube block
    const { create_youtube_block_item } = await apiRequest(`
      mutation {
        create_youtube_block_item(data: {
          title: "${sanitizedTitle(title)}",
          description: "${sanitizedTitle(description)}",
          embeds: ${graphqlEmbeds}
        }) {
          id
          name: title
          data: embeds
        }
      }
    `);

    // Update content block
    await apiRequest(`
        mutation {
          create_content_blocks_blocks_item(
            data: {
              collection: "youtube_block",
              content_blocks_id: { id: "${blockId}" },
              item: "${create_youtube_block_item.id}"
            }
          ) {
            id
          }
        }
      `);

    ctx.status = 200;
    ctx.body = { data: create_youtube_block_item };

    // Send Mixpanel Event - Fire and forget
    useMixpanel().sendMixpanel({
      event: "Youtube Block Created",
      data: {
        distinct_id: userData[0].id,
        block_id: create_youtube_block_item.id,
        content_block_id: blockId,
        title: title,
        embed_count: embeds.length,
        domain: domain,
        has_description: !!description,
        timestamp: new Date().toISOString()
      },
    }).catch(error => console.error('Failed to send Mixpanel event:', error));

    return;
  } catch (error) {
    // Track error event - Fire and forget
    useMixpanel().sendMixpanel({
      event: "Youtube Block Error",
      data: {
        distinct_id: user?.profileId,
        error_type: error.response?.data?.error || 'Unknown',
        error_status: error.response?.status,
        endpoint: 'POST /youtube_block',
        timestamp: new Date().toISOString()
      },
    }).catch(err => console.error('Failed to send Mixpanel error event:', err));

    console.error("Error creating youtube block:", error);
    ctx.status = error.response?.status || 500;
    ctx.body = error.response?.data || "Internal Server Error";
  }
});

// Update a youtube block
router.put(`${BASE_URL}/youtube_block/:id`, async (ctx) => {
  try {
    const { id: youtubeBlockId } = ctx.params;
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
    if (!req.status && (!req.title || !req.description || !req.embeds ) || !blockId || !youtubeBlockId) {
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

    let graphqlEmbeds = "";

    if(req.embeds){
    // Convert embeds to GraphQL format
      graphqlEmbeds = JSON.stringify(req.embeds).replace(/"([^"]+)":/g, "$1:"); // Remove quotes around property names
    }
    // Update youtube block
    const { update_youtube_block_item: update } = await apiRequest(`
      mutation {
        update_youtube_block_item(
          id: "${youtubeBlockId}",
          data: {
            ${req.title ? `title: "${sanitize(req.title)}",` : ""}
            ${req.description ? `description: "${sanitize(req.description)}",` : ""}
            ${req.embeds ? `embeds: ${graphqlEmbeds},` : ""}
            ${ req.status ? `status: "${req.status}",` : ""}
          }
        ) {
          id
          title
          embeds
          status
        }
      }
    `);

    ctx.status = 200;
    ctx.body = { data: update };

    // Send Mixpanel Event - Fire and forget
    useMixpanel().sendMixpanel({
      event: "youtube Block Updated",
      data: {
        distinct_id: userData[0].id,
        block_id: youtubeBlockId,
        content_block_id: blockId,
        title: req.title,
        embeds_count: req.embeds.length,
        has_description: !!req.description,
        timestamp: new Date().toISOString()
      },
    }).catch(error => console.error('Failed to send Mixpanel event:', error));

    return;
  } catch (error) {
    // Track error event - Fire and forget
    useMixpanel().sendMixpanel({
      event: "youtube Block Update Error",
      data: {
        distinct_id: user?.profileId,
        error_type: error.response?.data?.error || 'Unknown',
        error_status: error.response?.status,
        endpoint: 'PUT /youtube_block',
        timestamp: new Date().toISOString()
      },
    }).catch(err => console.error('Failed to send Mixpanel error event:', err));

    console.error("Error updating youtube block:", error);
    ctx.status = error.response?.status || 500;
    ctx.body = error.response?.data || "Internal Server Error";
  }
});


export default router;
