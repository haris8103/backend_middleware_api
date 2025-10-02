import Router from "koa-router";
import axios from "axios";
import checkCookie from "../../helpers/auth.mjs";
import { apiRequest, apiRequestSystem } from "../../helpers/apicall.mjs";
import { backendApiKey, useCookie } from "../../helpers/constants.mjs";
import { useMixpanel } from "../../helpers/mixpanel.mjs";
import { removeBrevoList, updateContact } from "../../helpers/brevoSdk.mjs";

const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1/wl`;


// ********************* //
// Check Domain
// ********************* //
router.get(`${BASE_URL}/domain/check`, async (ctx) => {
  try {
    const { domain } = ctx.query;

    if (!domain) {
      ctx.status = 400;
      ctx.body = { available: false, error: "Domain query parameter is required" };
      return;
    }

    // Validate domain format
    if (!domain.endsWith(".loop.fans")) {
      ctx.status = 400;
      ctx.body = { available: false, error: "Domain must end with .loop.fans" };
      return;
    }

    // Check if domain already exists
    const { domains } = await apiRequest(`
      query {
        domains(filter: { domain: { _eq: "${domain}" } }) {
          id
        }
      }
    `);

    if (domains && domains.length > 0) {
      ctx.status = 409; // Conflict
      ctx.body = { available: false, error: "Domain already exists" };
      return;
    }

    ctx.status = 200;
    ctx.body = { available: true, message: "Domain is available" };
    return;
  } catch (err) {
    ctx.status = err.response?.status || 500;
    ctx.body = err.response?.data || "Internal Server Error";
    return;
  }
});


// ********************* //
// Get Domain
// ********************* //
router.get(`${BASE_URL}/domain`, async (ctx) => {
  try {
    const { user_cookie, cookie: _cookie } = ctx.request.headers;
    const cookie = user_cookie || useCookie(_cookie);
    const user = cookie && (await checkCookie({ cookie }));

    if (!user) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }
    const result = await axios({
      url: `${url}/graphql`,
      method: "post",
      data: {
        query: `
        query {
          domains(filter: { owner_id: { profile_id: { _eq: "${user.profileId}" } } }) {
            id
            domain
            custom_domain
            status
            collection_access
            onBoard
            logo {
              id
            }
            banner {
              id
            }
            website_template{ 
              id
              name
            }
            settings
            
          }
        }
          `,
      },
    });

    console.log("Domain Result: ", result.data);

    ctx.status = 200;
    ctx.body = result.data.data.domains[0];
    return;
  } catch (err) {
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// ********************* //
// Create Domain
// ********************* //
router.post(`${BASE_URL}/domain`, async (ctx) => {
  try {
    const { user_cookie } = ctx.request.headers;
    const cookie = user_cookie;
    const user = cookie && (await checkCookie({ cookie }));

    if (!user) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // get user id
    const { users: userData } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${user.profileId}" } }) {
          id,
          sso_email
        }
      }
    `);

    const { domain, logo, banner, settings } = ctx.request.body;

    // Validate domain format
    if (!domain.endsWith(".loop.fans")) {
      ctx.status = 400;
      ctx.body = { error: "Domain must end with .loop.fans" };
      return;
    }

    const { create_domains_item } = await apiRequest(`
      mutation {
        create_domains_item(
          data: {
            domain: "${domain}",
            owner_id: { id: "${userData[0].id}" },
            ${
              logo
                ? `logo: { id: "${logo.id}", storage: "cloud", filename_download: "${logo.id}" }`
                : ""
            }
            ${
              banner
                ? `banner: { id: "${banner.id}", storage: "cloud", filename_download: "${banner.id}" }`
                : ""
            }
            ${
              settings
                ? `settings: ${JSON.stringify(settings).replace(
                    /"(\w+)":/g,
                    "$1:"
                  )} `
                : ""
            }
          }
        ) {
          domain
          status
          logo {
            id
          } 
          banner {
            id
          }
          settings
        }
      }
`);

    // check if mutation was successful
    if (!create_domains_item) {
      ctx.status = 500;
      ctx.body = "Failed to create domain";
      return;
    }

    ctx.status = 201;
    ctx.body = create_domains_item;



    // Update Contact - Started Onboarding
    try {
      await updateContact({
        email: userData[0].sso_email,
        listIds: [60],
        attributes: { USERTYPE: 2 },
      });
    } catch (error) {
      console.log("Brevo Error: ", error);
    }

    // Send Mixpanel Event
    useMixpanel().sendMixpanel({
      event: "Domain Created",
      data: {
        distinct_id: userData[0].id,
        domain: domain,
        has_logo: !!logo,
        has_banner: !!banner,
        has_settings: !!settings,
        timestamp: new Date().toISOString()
      },
    }).catch(error => console.error('Failed to send Mixpanel event:', error));
    return;
  } catch (err) {
    ctx.status = err.response?.status || 500;
    ctx.body = err.response?.data || "Internal Server Error";
    return;
  }
});

// ********************* //
// Update Domain Active Template
// ********************* //
router.patch(`${BASE_URL}/domain/active_template/:domain`, async (ctx) => {

  // try {
    const { user_cookie } = ctx.request.headers;
    const user = await checkCookie({ cookie: user_cookie });

    if (!user) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const domainToUpdate = ctx.params.domain;
    const { active_template } = ctx.request.body;

    // Verify domain ownership
    const { domains } = await apiRequest(`
      query {
        domains(filter: { 
          _and: [
            { domain: { _eq: "${domainToUpdate}" } },
            { owner_id: { profile_id: { _eq: "${user.profileId}" } } }
          ]
        }) {
          id
        }
      }
    `);

    if (!domains || domains.length === 0) {
      ctx.status = 404;
      ctx.body = "Domain not found or unauthorized";
      return;
    }

    // Update website_template field
    const { update_domains_item: mutation } = await apiRequest(`
      mutation {
        update_domains_item(
          id: "${domains[0].id}",
          data: {
            website_template: ${active_template ? `${active_template}` : null}
          }
        ) {
          domain
          website_template{
            id
            name
          }
        }
      }
    `);

    // Check if mutation was successful
    if (mutation.errors || !mutation) {
      ctx.status = 500;
      ctx.body = "Failed to update domain active template";
      return;
    }

    ctx.status = 200;
    ctx.body = mutation;

    // Send Mixpanel Event
    useMixpanel().sendMixpanel({
      event: "Domain Active Template Updated",
      data: {
        distinct_id: user.profileId,
        domain: domainToUpdate,
        website_template: website_template,
        timestamp: new Date().toISOString()
      },
    }).catch(error => console.error('Failed to send Mixpanel event:', error));
    return;
  // } catch (err) {
  //   ctx.status = err.response?.status || 500;
  //   ctx.body = err.response?.data || "Internal Server Error";
  //   return;
  // }
});

// ********************* //
// Update Domain
// ********************* //
router.patch(`${BASE_URL}/domain/:domain`, async (ctx) => {
  try {
    const { user_cookie, cookie: _cookie } = ctx.request.headers;
    const cookie = user_cookie || useCookie(_cookie);
    const user = await checkCookie({ cookie });

    if (!user) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const domainToUpdate = ctx.params.domain;
    const { domain, logo, banner, settings, onBoard } = ctx.request.body;

    // Verify domain ownership
    const { domains } = await apiRequest(`
      query {
        domains(filter: { 
          _and: [
            { domain: { _eq: "${domainToUpdate}" } },
            { owner_id: { profile_id: { _eq: "${user.profileId}" } } }
          ]
        }) {
          id,
          onBoard
        }
      }
    `);

    if (!domains || domains.length === 0) {
      ctx.status = 404;
      ctx.body = "Domain not found or unauthorized";
      return;
    }

    // Build update fields
    const updateFields = [];
    if (domain) updateFields.push(`domain: "${domain}"`);
    if (logo) updateFields.push(`logo: { id: "${logo.id}" }`);
    if (banner) updateFields.push(`banner: { id: "${banner.id}" }`);
    if (settings)
      updateFields.push(
        `settings: ${JSON.stringify(settings).replace(/"(\w+)":/g, "$1:")}`
      );

    if (updateFields.length === 0) {
      ctx.status = 200;
      ctx.body = "No fields to update";
      return;
    }

    if (onBoard) {
      updateFields.push(`onBoard: "${onBoard}"`);
    }

    const { update_domains_item: mutation } = await apiRequest(`
      mutation {
        update_domains_item(
          id: "${domains[0].id}",
          data: {
            ${updateFields.join(",\n              ")}
          }
        ) {
          domain
          status
          logo {
            id
          }
          banner {
            id
          }
          collection_access
          settings
          onBoard
        }
      }
    `);
    // check if mutation was successful
    if (mutation.errors || !mutation) {
      ctx.status = 500;
      ctx.body = "Failed to update domain";
      return;
    }

    ctx.status = 200;
    ctx.body = mutation;

    // Send Mixpanel Event
    useMixpanel().sendMixpanel({
      event: "Domain Updated",
      data: {
        distinct_id: user.profileId,
        domain: domainToUpdate,
        updated_fields: Object.keys(ctx.request.body),
        has_logo_update: !!logo,
        has_banner_update: !!banner,
        has_settings_update: !!settings,
        timestamp: new Date().toISOString()
      },
    }).catch(error => console.error('Failed to send Mixpanel event:', error));
    return;
  } catch (err) {
    ctx.status = err.response?.status || 500;
    ctx.body = err.response?.data || "Internal Server Error";
    return;
  }
});

// ********************* //
// Enable Content Blocks
// ********************* //
router.post(`${BASE_URL}/content_blocks/:domain`, async (ctx) => {
  try {
    const { user_cookie, cookie: _cookie } = ctx.request.headers;
    const cookie = user_cookie || useCookie(_cookie);
    const user = cookie && (await checkCookie({ cookie }));

    if (!user) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // Fetch UserId
    const { users: userData } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${user.profileId}" } }) {
          id,
          sso_email
        }
      }
    `);

    // create content block
    const { create_content_blocks_item } = await apiRequest(`
      mutation {
        create_content_blocks_item(
          data: {
            user: { id: "${userData[0].id}" }
          }
        ) {
          id
        }
      }
    `);

    // update content block domain
    const { update_content_blocks_item } = await apiRequest(`
      mutation {
        update_content_blocks_item(
          id: ${create_content_blocks_item.id}
          data: {
            domain: { id: "${ctx.params.domain}" }
          }
        ) {
          id
        }
      }
    `);
    
    // check if mutation was successful
    if (!update_content_blocks_item) {
      ctx.status = 500;
      ctx.body = "Failed to enable content blocks";
      return;
    }

    ctx.status = 201;
    ctx.body = update_content_blocks_item;

    // Update Contact - Finished Onboarding
    try {
      await removeBrevoList({ email: [userData[0].sso_email], listId: 60 });
      await updateContact({
        email: userData[0].sso_email,
        listIds: [61],
        attributes: { USERTYPE: 2 },
      });
    } catch (error) {
      console.log("Brevo Error: ", error);
    }

    // Send Mixpanel Event
    useMixpanel().sendMixpanel({
      event: "Content Blocks Enabled",
      data: {
        distinct_id: userData[0].id,
        domain_id: ctx.params.domain,
        content_block_id: update_content_blocks_item.id,
        timestamp: new Date().toISOString()
      },
    }).catch(error => console.error('Failed to send Mixpanel event:', error));
    return;
  } catch (err) {
    ctx.status = err.response?.status || 500;
    ctx.body = err.response?.data || "Internal Server Error";
    return;
  }
});

// ********************* //
// Get Content Blocks
// ********************* //
router.get(`${BASE_URL}/content_blocks/:domain`, async (ctx) => {
  try {
    const { user_cookie, cookie: _cookie } = ctx.request.headers;
    const cookie = user_cookie || useCookie(_cookie);
    const user = cookie && (await checkCookie({ cookie }));

    if (!user) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // Fetch UserId
    /* const { users: userData } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${user.profileId}" } }) {
          id
        }
      }
    `); */
  
    const result = await axios({
      url: `${url}/items/content_blocks?fields=*,blocks.*.*.*.*,domain.domain&filter={"domain":{"id":{"_eq":"${ctx.params.domain}"}}}`,
      method: "get",
      data: {},
    });

    // check if content blocks were found
    if (!result || result.data.errors) {
      ctx.status = 404;
      ctx.body = "Content blocks not found";
      return;
    }

    ctx.status = 200;
    ctx.body = {
      id: result.data.data[0]?.id,
      blocks: result.data.data[0]?.blocks,
    };
    return;
  } catch (err) {
    ctx.status = err.response?.status || 500;
    ctx.body = err.response?.data || "Internal Server Error";
    return;
  }
});

// POST - Create content blocks
router.post(`${BASE_URL}/content_blocks`, async (ctx) => {
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

    try {
      const { create_content_blocks_item } = await apiRequest(`
      mutation {
        create_content_blocks_item(data: {
          user: { id: "${userData[0].id}" },
        }) {
          id
        }
      }
    `);

      // check if mutation was successful
      if (!create_content_blocks_item) {
        ctx.status = 500;
        ctx.body = "Failed to create content blocks";
        return;
      }

      // update content blocks with domain
      const { domain } = ctx.request.body;
      await apiRequest(`
      mutation {
        update_content_blocks_item(id: "${create_content_blocks_item.id}", data: {
          domain: {
            domain: "${domain}"
          }
        }) {
          id
        }
      }
    `);
    } catch (err) {
      console.log(err);
    }

    ctx.status = 201;
    ctx.body = { message: "Content blocks created successfully" };
    return;
  } catch (err) {
    ctx.status = err.response?.status || 500;
    ctx.body = err.response?.data || "Internal Server Error";
    return;
  }
});

// PATCH - Update content blocks
router.patch(`${BASE_URL}/content_blocks/:id`, async (ctx) => {
  try {
    const { user_cookie, cookie: _cookie } = ctx.request.headers;
    const cookie = user_cookie || useCookie(_cookie);
    const user = await checkCookie({ cookie });

    if (!user) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const { id } = ctx.params;
    const { blocks } = ctx.request.body;

    const result = await axios({
      url: `${url}/items/content_blocks/${id}`,
      method: "patch",
      data: {
        blocks,
      },
    });

    ctx.status = 200;
    ctx.body = {
      id: result.data.data.id,
      blocks: result.data.data.blocks,
    };

    // Send Mixpanel Event
    useMixpanel().sendMixpanel({
      event: "Content Blocks Updated",
      data: {
        distinct_id: user.profileId,
        content_block_id: id,
        num_blocks: blocks?.length || 0,
        block_types: blocks?.map(block => block.type) || [],
        timestamp: new Date().toISOString()
      },
    }).catch(error => console.error('Failed to send Mixpanel event:', error));
    return;
  } catch (err) {
    ctx.status = err.response?.status || 500;
    ctx.body = err.response?.data || "Internal Server Error";
    return;
  }
});

// ********************* //
// Reorder Content Blocks
// ********************* //
router.put(`${BASE_URL}/content_blocks/:id/reorder`, async (ctx) => {
  try {
    const { user_cookie, cookie: _cookie } = ctx.request.headers;
    const cookie = user_cookie || useCookie(_cookie);
    const user = await checkCookie({ cookie });

    if (!user) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const { id } = ctx.params;
    const { blocks } = ctx.request.body;

    // Validate request body
    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      ctx.status = 400;
      ctx.body = { error: "Invalid request body. 'blocks' array is required" };
      return;
    }

    // Validate blocks format
    const validBlocks = blocks.every(block => 
      typeof block === 'object' && 
      block !== null && 
      'id' in block && 
      'order' in block
    );

    if (!validBlocks) {
      ctx.status = 400;
      ctx.body = { error: "Each block must have 'id' and 'order' properties" };
      return;
    }

    // Get current content blocks to verify ownership
    const contentBlocksResponse = await axios({
      url: `${url}/items/content_blocks/${id}?fields=*,blocks.*,domain.id,user.id`,
      method: "get",
    });

    const contentBlock = contentBlocksResponse.data.data;
    
    // Verify content block exists and belongs to user
    if (!contentBlock) {
      ctx.status = 404;
      ctx.body = { error: "Content block not found" };
      return;
    }

    // Fetch UserId for verification
    const { users: userData } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${user.profileId}" } }) {
          id
        }
      }
    `);

    // Verify ownership
    if (contentBlock.user.id !== userData[0].id) {
      ctx.status = 403;
      ctx.body = { error: "Unauthorized to modify this content block" };
      return;
    }

    // Create a map of blocks by ID
    const blocksById = {};
    contentBlock.blocks.forEach(block => {
      blocksById[block.id] = block;
    });

    // Verify all block IDs exist in the current blocks
    const blockIds = blocks.map(block => block.id);
    const allBlocksExist = blockIds.every(id => id in blocksById);
    
    if (!allBlocksExist) {
      ctx.status = 400;
      ctx.body = { error: "One or more block IDs do not exist in this content block" };
      return;
    }

    // Sort blocks by the provided order
    const sortedBlocks = [...blocks].sort((a, b) => a.order - b.order);
    
    // Create reordered blocks array maintaining all original block properties
    const reorderedBlocks = sortedBlocks.map(block => ({
      ...blocksById[block.id],
      order: block.order
    }));

    // Update content blocks with new order
    const result = await axios({
      url: `${url}/items/content_blocks/${id}`,
      method: "patch",
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${backendApiKey}`,
      },
      data: {
        blocks: reorderedBlocks,
      },
    });

    ctx.status = 200;
    ctx.body = {
      id: result.data.data.id,
      blocks: result.data.data.blocks,
    };
    
    return;
  } catch (err) {
    ctx.status = err.response?.status || 500;
    ctx.body = err.response?.data || "Internal Server Error";
    return;
  }
});

export default router;
