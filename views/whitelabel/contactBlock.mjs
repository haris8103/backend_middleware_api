import Router from "koa-router";
import checkCookie from "../../helpers/auth.mjs";
import { apiRequest, apiRequestSystem } from "../../helpers/apicall.mjs";
import { useCookie } from "../../helpers/constants.mjs";
import { useMixpanel } from "../../helpers/mixpanel.mjs";
import { updateContact } from "../../helpers/brevo.mjs";

const router = new Router();
const BASE_URL = "/v1/blocks";

// Create a contact block
router.post(`${BASE_URL}/contact_block`, async (ctx) => {
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

    const { title, description, contactInfo: {contactMethods: methods}, domain, blockId } = ctx.request.body;
    console.log({contactInfo: ctx.request.body.contactInfo.contactMethods});

    // Sanitize text by escaping quotes
    const sanitize = (text) => text ? text.replace(/"/g, '\\"') : "";

    // Validate required fields
    if (!title || !methods || !domain || !blockId) {
      ctx.status = 400;
      ctx.body = { message: "Missing required fields" };
      return;
    }
    // Convert methods to GraphQL format
    const graphqlMethods = JSON.stringify(methods).replace(/"([^"]+)":/g, "$1:"); // Remove quotes around property names

    // Create contact block
    const { create_contact_block_item } = await apiRequest(`
      mutation {
        create_contact_block_item(data: {
          title: "${sanitize(title)}",
          description: "${sanitize(description)}",
          methods: ${graphqlMethods}
        }) {
          id
          title
          methods
        }
      }
    `);

    // Update content block
    await apiRequest(`
      mutation {
        create_content_blocks_blocks_item(
          data: {
            collection: "contact_block",
            content_blocks_id: { id: "${blockId}" },
            item: "${create_contact_block_item.id}"
          }
        ) {
          id
        }
      }
    `);

    ctx.status = 200;
    ctx.body = { data: create_contact_block_item };

    return;
  } catch (error) {

    console.error("Error creating contact block:", error);
    ctx.status = error.response?.status || 500;
    ctx.body = error.response?.data || "Internal Server Error";
  }
});

// Update a contact block
router.put(`${BASE_URL}/contact_block/:id`, async (ctx) => {
  try {
    const { id: contactBlockId } = ctx.params;
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
    if (!req.status && (!req.title || !req.methods) || !blockId || !contactBlockId) {
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

    let graphqlMethods = '';
    if(req.methods) {
      // Convert methods to GraphQL format
      graphqlMethods = JSON.stringify(req.methods).replace(/"([^"]+)":/g, "$1:"); // Remove quotes around property names
    }

    // Update contact block
    const { update_contact_block_item: update } = await apiRequest(`
      mutation {
        update_contact_block_item(
          id: "${contactBlockId}",
          data: {
            ${req.title ? `title: "${sanitize(req.title)}",` : ''}
            ${req.description ? `description: "${sanitize(req.description)}",` : ''}
            ${req.methods ? `methods: ${graphqlMethods},` : ''}
            ${ req.status ? `status: "${req.status}",` : ''}
          }
        ) {
          id
          title
          methods
          status
        }
      }
    `);
      
    ctx.status = 200;
    ctx.body = { data: update };

    // Send Mixpanel Event - Fire and forget
    useMixpanel().sendMixpanel({
      event: "Contact Block Updated",
      data: {
        distinct_id: userData[0].id,
        block_id: contactBlockId,
        content_block_id: blockId,
        title: req?.title,
        method_count: req?.methods?.length || 0,
        has_description: !!req?.description,
        timestamp: new Date().toISOString()
      },
    }).catch(error => console.error('Failed to send Mixpanel event:', error));

    return;
  } catch (error) {
    // Track error event - Fire and forget
    useMixpanel().sendMixpanel({
      event: "Contact Block Update Error",
      data: {
        distinct_id: user?.profileId,
        error_type: error.response?.data?.error || 'Unknown',
        error_status: error.response?.status,
        endpoint: 'PUT /contact_block',
        timestamp: new Date().toISOString()
      },
    }).catch(err => console.error('Failed to send Mixpanel error event:', err));

    console.error("Error updating contact block:", error);
    ctx.status = error.response?.status || 500;
    ctx.body = error.response?.data || "Internal Server Error";
  }
});

export default router;
