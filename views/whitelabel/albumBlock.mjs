import Router from "koa-router";
import axios from "axios";
import checkCookie from "../../helpers/auth.mjs";
import { apiRequest, apiRequestSystem } from "../../helpers/apicall.mjs";
import { backendApiKey, useCookie } from "../../helpers/constants.mjs";
import { useMixpanel } from "../../helpers/mixpanel.mjs";

const router = new Router();
const BASE_URL = "/v1/blocks";

// ********************* //
// Create Album
// ********************* //
router.post(`${BASE_URL}/album_block`, async (ctx) => {
  try {
    const { user_cookie } = ctx.request.headers;
    const cookie = user_cookie;
    const userData = await checkCookie({ cookie });
    if (!userData) {
      ctx.status = 401;
      ctx.body = { message: "Unauthorized" };
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

    const { name, description, gallery, contentBlockId } = ctx.request.body;

    // Sanitize title by escaping quotes
    const sanitizedTitle = (name) => name.replace(/"/g, '\\"');

    // Validate required fields
    if (!name || !gallery || !contentBlockId) {
      ctx.status = 400;
      ctx.body = { error: "Missing required fields" };
      return;
    }

    // Convert images array to GraphQL format
    const graphqlImages = gallery.images
      .map(
        (img, index) => `{
          featured: ${index < 3 ? "true" : "false"},
          directus_files_id: {
            id: "${img.directus_files_id.id}"
            storage: "cloud"
            filename_download: "${img.directus_files_id.filename_download}"
          }
        }`
      )
      .join(",");

    const { create_album_item: data } = await apiRequest(`
      mutation {
        create_album_item(
          data: {
            status: "published",
            name: "${sanitizedTitle(name)}",
            desc: "${sanitizedTitle(description)}",
            gallery: {
              images: [${graphqlImages}]
            },
            user_created: {
              id: "${user[0].id}"
            }
          }
        ) {
          id
          name
          description: desc
          gallery {
            id
            images {
              featured
              directus_files_id {
                id
              }
            }
          }
        }
      }
    `);

    // Update content block
    await apiRequest(`
      mutation {
        create_content_blocks_blocks_item(
          data: {
            collection: "album",
            content_blocks_id: { id: "${contentBlockId}" },
            item: "${data.id}"
          }
        ) {
          id
        }
      }
    `);
    ctx.status = 200;
    ctx.body = { data: data };

    // Send Mixpanel Event - Fire and forget
    useMixpanel().sendMixpanel({
      event: "Album Block Created",
      data: {
        distinct_id: user[0].id,
        block_id: data.id,
        content_block_id: contentBlockId,
        block_type: 'album',
        timestamp: new Date().toISOString()
      },
    }).catch(error => console.error('Failed to send Mixpanel event:', error));
    
    return;
  } catch (error) {
    // Track error event - Fire and forget
    useMixpanel().sendMixpanel({
      event: "Album Block Error",
      data: {
        distinct_id: userData?.profileId,
        error_type: error.response?.data?.error || 'Unknown',
        error_status: error.response?.status,
        endpoint: 'POST /album_block',
        timestamp: new Date().toISOString()
      },
    }).catch(err => console.error('Failed to send Mixpanel error event:', err));

    console.log(error.response);
    ctx.status = 400;
    ctx.body = error;
    return;
  }
});



// ********************* //
// Update Album
// ********************* //
router.patch(`${BASE_URL}/album_block/:id`, async (ctx) => {
  try {    
    const { user_cookie } = ctx.request.headers;
    const cookie = user_cookie;
    const userData = await checkCookie({ cookie });
    if (!userData) {
      ctx.status = 401;
      ctx.body = { message: "Unauthorized" };
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

    const req = ctx.request.body;

    // Sanitize title by escaping quotes
    const sanitizedTitle = (name) => name.replace(/"/g, '\\"');

    // Validate required fields
    if (!req.status && (!req.name || !req.description || !req.gallery ) || !req.id || !req.contentBlockId) {
      ctx.status = 400;
      ctx.body = { error: "id, contentBlockId required fields" };
      return;
    }

    let graphqlImages = ""
    if(req.gallery){
    // Convert images array to GraphQL format.
    graphqlImages = req.gallery.images
      .map(
        (img, index) => `{
          featured: ${index < 3 ? "true" : "false"},
          directus_files_id: {
            id: "${img.directus_files_id.id}"
            storage: "cloud"
            filename_download: "${img.directus_files_id.filename_download}"
          }
        }`
      )
      .join(",");
    }

    const { update_album_item: data } = await apiRequest(`
      mutation {
        update_album_item(
        id: "${req.id}",
          data: {
            ${req.name ? `name: "${sanitizedTitle(req.name)}",` : ''}
            ${req.description ? `desc: "${sanitizedTitle(req.description)}",` : ''}
            ${req.gallery ? `gallery: {
              images: [${graphqlImages}]
            },` : ''}
            ${req.status ? `status: "${req.status}"` : ""}
          }
        ) {
          id
          name
          description: desc
          status
          gallery {
            id
            images {
              featured
              directus_files_id {
                id
              }
            }
          }
        }
      }
    `);
    // Update content block
    ctx.status = 200;
    ctx.body = { data: data };

    // Send Mixpanel Event - Fire and forget
    useMixpanel().sendMixpanel({
      event: "Album Block Updated",
      data: {
        distinct_id: user[0].id ,
        block_id: data.id,
        content_block_id: contentBlockId,
        block_type: 'album',
        timestamp: new Date().toISOString()
      },
    }).catch(error => console.error('Failed to send Mixpanel event:', error));
    
    return;
  } catch (error) {
    // Track error event - Fire and forget
    useMixpanel().sendMixpanel({
      event: "Album Block Error",
      data: {
        distinct_id: userData?.profileId,
        error_type: error.response?.data?.error || 'Unknown',
        error_status: error.response?.status,
        endpoint: 'POST /album_block',
        timestamp: new Date().toISOString()
      },
    }).catch(err => console.error('Failed to send Mixpanel error event:', err));

    console.log(error.response);
    ctx.status = 400;
    ctx.body = error;
    return;
  }
});

export default router;