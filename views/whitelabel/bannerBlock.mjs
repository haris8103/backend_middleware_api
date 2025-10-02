import Router from "koa-router";

import { apiRequest, apiRequestSystem } from "../../helpers/apicall.mjs";
import { useMixpanel } from "../../helpers/mixpanel.mjs";
import mustBeAuthenticated from "../../middleware/mustBeAuthenticated.mjs";
import { deleteFile } from "../../helpers/uploadImage.mjs";

const router = new Router();
const BASE_URL = "/v1/blocks";

const formHandlerasync = async (ctx) => {
  // try {
  const userData = ctx.state.userAuth;

  // Fetch User
  const { users: user } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          id
        }
      }
    `);
  const { contentBlockId: cbId, blockId, banner } = ctx.request.body;

  const contentBlockId = cbId || blockId
  // Validate required fields
  if (!banner || !contentBlockId) {
    ctx.status = 400;
    ctx.body = { error: "Missing required fields" };
    return;
  }
  const imageId = banner

  // Convert image to GraphQL format
  const graphqlImage = `{
            id: "${imageId}"
            storage: "cloud"
            filename_download: "${imageId}"
        }`
  const { content_banner } = await apiRequest(`
      query {
        content_banner(filter: { content_block: { id: {_eq: ${contentBlockId} }}}) {
          id
          banner {
            id
          }
      }
    }
    `);

  if (content_banner) {
    if (content_banner.length > 0) {
      if (content_banner[0].banner && content_banner[0].banner?.id) {
        if (imageId != content_banner[0].banner.id) {
          await deleteFile(content_banner[0].banner.id)
        }
      }

      // update 
      const { update_content_banner_item: data } = await apiRequest(`
            mutation {
              update_content_banner_item(
                id: "${content_banner[0].id}",
                data: {
                  banner: ${graphqlImage},
                  user_updated: {
                  id: "${user[0].id}"
                }
                }
              ) {
                id
                banner{
                    id
                }
              }
            }
          `);

      ctx.status = 200;
      ctx.body = { data: data, meessage: "Updated" };

      // Send Mixpanel Event - Fire and forget
      useMixpanel().sendMixpanel({
        event: "Banner Block Updated",
        data: {
          distinct_id: user[0].id,
          block_id: id,
          content_block_id: contentBlockId,
          title: 'Banner Block',
          timestamp: new Date().toISOString()
        },
      }).catch(error => console.error('Failed to send Mixpanel event:', error));

      return;
    }

  }

  const { create_content_banner_item: data } = await apiRequest(`
      mutation {
        create_content_banner_item(
          data: {
            banner: ${graphqlImage},
            user_created: {
              id: "${user[0].id}"
            },
            content_block: { id: "${contentBlockId}" }
          }
        ) {
            id
            banner {
                id
            }
        }
      }
    `);

  // Update content block
  await apiRequest(`
      mutation {
        create_content_blocks_blocks_item(
          data: {
            collection: "content_banner",
            content_blocks_id: { id: "${contentBlockId}" },
            item: "${data.id}"
          }
        ) {
          id
        }
      }
    `);
  ctx.status = 200;
  ctx.body = { data: data, message: "Created" };

  // Send Mixpanel Event - Fire and forget
  useMixpanel().sendMixpanel({
    event: "Banner Block Created",
    data: {
      distinct_id: user[0].id,
      block_id: data.id,
      content_block_id: contentBlockId,
      block_type: 'banner',
      timestamp: new Date().toISOString()
    },
  }).catch(error => console.error('Failed to send Mixpanel event:', error));

  return;
  // } catch (error) {
  //   // Track error event - Fire and forget
  //   useMixpanel().sendMixpanel({
  //     event: "Banner Block Error",
  //     data: {
  //       distinct_id: userData?.profileId,
  //       error_type: error.response?.data?.error || 'Unknown',
  //       error_status: error.response?.status,
  //       endpoint: 'POST /banner_block',
  //       timestamp: new Date().toISOString()
  //     },
  //   }).catch(err => console.error('Failed to send Mixpanel error event:', err));

  //   console.log(error.response);
  //   ctx.status = 400;
  //   ctx.body = error;
  //   return;
  // }
}

// ********************* //
// Create/Update Banner
// ********************* //
router.post(`${BASE_URL}/banner_block`, mustBeAuthenticated, formHandlerasync)
.patch(`${BASE_URL}/banner_block/:id?`, mustBeAuthenticated, formHandlerasync);

export default router;