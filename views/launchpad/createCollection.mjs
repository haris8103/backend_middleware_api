import Router from "koa-router";
import axios from "axios";
import fs from "fs";
import { apiRequest, apiRequestSystem } from "../../helpers/apicall.mjs";
import authCheck from "../../helpers/auth.mjs";
import Joi from "joi";
import { handleImageUpload } from "../../helpers/uploadImage.mjs";
import {
  voteCollectionSchema,
  supportCollectionSchema,
  createCollectionSchema,
} from "../../schema/validationSchema.mjs";
import { updateContact } from "../../helpers/brevoSdk.mjs";
import { useMixpanel } from "../../helpers/mixpanel.mjs";
import { logtail } from "../../helpers/constants.mjs";
import { log } from "console";
const { sendMixpanel } = useMixpanel();

const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1/launchpad`;

const defaultLaunchpadField = {
  status: "published",
  platform: "app.loop.fans",
  project_status: "upcoming",
  mint_status: "active",
  collection_type: "support",
  launchpad_type: {
    launchInfo: {
      mintPrice: "0",
      mint_limit: 1,
      minPrice: "0",
      is_free: true,
      // start date is 1 month from today without timestamp
      startDate: new Date("2024-05-15").toISOString(),
      startTime: "00:00:00",
      endDate: new Date("2024-06-15").toISOString(),
      endTime: "23:59:59",
      publicDate: new Date("2024-05-15").toISOString(),
      publicTime: "00:00:00",
    },
  },
};

// ********************* //
// Create Launchpad
// ********************* //
router.post(`${BASE_URL}/createCollection`, async (ctx) => {
  // formdata
  const { fields, files } = ctx.request.body;

  const { cookie, collection } = fields;

  // Parse collection data
  const collectionData = JSON.parse(collection);
  const {
    collection_name,
    status,
    collection_description,
    collection_quantity,
    collection_price,
    collection_min_price,
    collection_start_date,
    collection_start_time,
    collection_end_date,
    collection_end_time,
    collection_type,
    chain
  } = collectionData;

  // make sure collection_description is a string
  const _description = collection_description ? collection_description.replace(/['"]/g, '').replace(/\s+/g, ' ').trim() : '';


  const { artwork } = files;

  const userData = await authCheck({ cookie });

  // Validate request body
  const { error } = createCollectionSchema.validate(fields);
  if (error) {
    console.log(error);
    ctx.status = 400;
    ctx.body = error.details[0].message;
    return;
  }

  if (!userData) {
    ctx.status = 401;
    ctx.body = "Unauthorized";
    return;
  }

  try {
    // Upload image
    const nft_artwork = artwork
      ? await handleImageUpload(fs.createReadStream(artwork.path), false)
      : null;

    // Resolve promises before constructing the query
    const artwork_imageId = artwork ? await nft_artwork : null;

    // fetch user data
    const { users: user } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          id
          first_name
          display_name
          username
          sso_email
        }
      }
    `);

    const { create_fans_launchpad_item: createtLaunchpad } = await apiRequest(`
        mutation {
          create_fans_launchpad_item(
            data: {
              platform: "${defaultLaunchpadField.platform}"
              mint_status: "${defaultLaunchpadField.mint_status}"
              artist: { id: "${user[0].id}" }
              status: "${status}"
              went_live: ${status === "published" ? true : false}
              project_status: "upcoming"
              project_name: "${collection_name}"
              collection_type: "${collection_type ?? "collectible"}"
              banner: {
                id: "${artwork_imageId}"
                storage: "cloud"
                filename_download: "${artwork_imageId}"
              }
            }
          ) {
            id
            banner {
              id
            }
          }
        }
      `);

    const { id: launchpadId, banner } = createtLaunchpad;

    if (launchpadId) {
      // Create collection
      console.log("Create Collection: =>", launchpadId);
      console.log("Banner ID: =>", banner);

      try {
        const gql = `
          mutation {
            create_fans_launchpad_type_item(data: {
              launchpad_id: {
                id: "${launchpadId}"
              }
              fan_collection: {
                status: "published"
                artist: { id: "${user[0].id}" }
                name: "${collection_name}"
                description: "${_description}"
                icon: {
                  id: "${artwork_imageId}"
                  storage: "cloud"
                  filename_download: "${artwork_imageId}"
                }
                banner: {
                  id: "${artwork_imageId}"
                  storage: "cloud"
                  filename_download: "${artwork_imageId}"
                },
                ${
                    chain && chain == 'starknet' ?
                     'starknet_address: "false" address: "TBD"' :
                      'starknet_address:"TBD"  address: "false"'
                }
              },
              launchInfo: {
                startDate: "${
                  collection_start_date ??
                  new Date().toISOString().split("T")[0]
                }"
                startTime: "${collection_start_time ?? "00:00:00"}"
                endDate: "${
                  collection_end_date ?? new Date().toISOString().split("T")[0]
                }"
                endTime: "${collection_end_time ?? "00:00:00"}"
                publicDate: "${
                  collection_start_date ??
                  new Date().toISOString().split("T")[0]
                }"
                publicTime: "${collection_start_time ?? "00:00:00"}"
                minPrice: "${collection_min_price ?? "0"}" 
                maxSupply: ${collection_quantity ?? 1}
                mintPrice: "${collection_price ?? "0"}",
                mint_limit: ${
                  defaultLaunchpadField.launchpad_type.launchInfo.mint_limit ??
                  1
                },
                is_free: ${
                  ([0,"0","null", null].includes(collection_price) && [0,"0","null", null].includes(collection_min_price)) ? true : false
                }
              }
            }) {
              id
            }
          }
        `
        console.log("gql", gql);
        await apiRequest(gql);
      } catch (error) {
        console.log(error);
      }

      // unlink file
      if (artwork) {
        fs.unlinkSync(artwork.path);
      }

      /* ================== */
      /* Mixpanel Tracking */
      /* ================== */
      /* try {
        sendMixpanel({
          event: "Collection Created",
          data: {
            distinct_id: user[0].id,
            event_name: "Collection Created",
            type: "Support",
            collection_name: `${
              user[0].display_name ?? user[0].username
            }: Good Vibe`,
          },
        });
      } catch (error) {
        console.log("Mixpanel Error: ", error);
      } */

      sendMixpanel({
        event: "Collection Created",
        data: {
          distinct_id: user[0].id,
          user_id: user[0].id,
          collection_id: launchpadId,
          collection_name: collection_name,
          collection_type: collection_type ?? "collectible",
          artist_id: user[0].id,
          status: "success"
        },
      });
    } else {
      ctx.status = 400;
      ctx.body = "Failed to create Launchpad/Collection";
      return;
    }

    ctx.status = 200;
    ctx.body = launchpadId;
    return;
  } catch (err) {
    sendMixpanel({
      event: "Collection Creation Failed",
      data: {
        distinct_id: user[0].id,
        user_id: user[0].id,
        error_message: err.response?.data || "Unknown error",
        collection_name: collection_name,
        collection_type: collection_type ?? "collectible",
        artist_id: user[0].id,
        status: "error"
      },
    });

    console.log({ err: err.response });
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// ********************* //
// Edit Launchpad/Collection
// ********************* //
router.post(`${BASE_URL}/editCollection/:id`, async (ctx) => {
  const { id } = ctx.params;
  // formdata
  const { fields, files } = ctx.request.body;
  const { cookie, collection } = fields;
  // Parse collection data
  const collectionData = JSON.parse(collection);
  const {
    collection_name,
    status,
    collection_type,
    collection_description,
    collection_quantity,
    collection_price,
    collection_min_price,
    collection_start_date,
    collection_start_time,
    collection_end_date,
    collection_end_time,
    required_tags
  } = collectionData;
  collection_description.replace(/['"]/g, '').replace(/\s+/g, ' ').trim();

  const { image } = files;

  // Check if user is authenticated
  const userData = await authCheck({ cookie });

  if (!userData) {
    ctx.status = 401;
    ctx.body = "Unauthorized";
    return;
  }

  // Fetch User Data
  const { users: user } = await apiRequestSystem(`
    query {
      users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
        id
        username
        first_name
      }
    }
  `);

  // Fetch Launchpad
  const { fans_launchpad: launchpad } = await apiRequest(`
    query {
      fans_launchpad(
        filter: { id: { _eq: "${id}" } }
      ) {
        id
        went_live
        artist {
          id
        }
        banner {
          id
        }
        launchpad_type {
          fan_collection {
            id
          }
          launchInfo {
            id
          }
        }
      }
    }
  `);

  // Check if launchpad exists
  if (!launchpad.length) {
    ctx.status = 404;
    ctx.body = "Launchpad not found";
    return;
  }

  // Check if user is the owner of the launchpad
  if (launchpad[0].artist.id !== user[0].id) {
    ctx.status = 401;
    ctx.body = "Unauthorized";
    return;
  }

  try {
    // Upload image
    const nft_artwork = image
      ? await handleImageUpload(
          fs.createReadStream(image.path),
          launchpad[0]?.banner?.id
        )
      : null;

    // Resolve promises before constructing the query
    const artwork_imageId = image ? await nft_artwork : null;

    const launchpadMutationQuery = `
      ${status ? `status: "${status}"` : ""}
      went_live: ${
        status === "published" && launchpad[0].went_live === false
          ? true
          : launchpad[0].went_live
      }
      ${collection_name ? `project_name: "${collection_name}"` : ""}
      ${artwork_imageId ? `banner: {
        id: "${artwork_imageId}"
        storage: "cloud"
        filename_download: "${artwork_imageId}"
      }` : ""}
      ${ required_tags ? `required_tags: "${required_tags}"` : ""}
    `;

    const collectionMutationQuery = `
      ${status ? `status: "${status}"` : ""}
      ${collection_name ? `name: "${collection_name}"` : ""}
      ${collection_description ? `description: "${collection_description}"` : ""}
      ${artwork_imageId ? `banner: {
        id: "${artwork_imageId}"
        storage: "cloud"
        filename_download: "${artwork_imageId}"
      }` : ""}
    `;

    const collectionLaunchInfo = `
      ${collection_quantity ? `maxSupply: ${collection_quantity}` : ""}
      ${`mintPrice: "${collection_price}"` }
      ${collection_start_date ? `startDate: "${collection_start_date}"` : ""}
      ${collection_start_time ? `startTime: "${collection_start_time}"` : ""}
      ${collection_end_date ? `endDate: "${collection_end_date}"` : ""}
      ${collection_end_time ? `endTime: "${collection_end_time}"` : ""}
      ${`minPrice: "${collection_min_price}"`}
    `;

    // Update LaunchInfo
    await apiRequest(`
      mutation {
        update_fans_launchInfo_item(
          id: "${launchpad[0].launchpad_type[0].launchInfo.id}"
          data: {
            ${collectionLaunchInfo}
          }
        ) {
          id
        }
      }
    `);

    // Update Launchpad
    await apiRequest(`
    mutation {
      update_fans_launchpad_item(
        id: "${id}"
        data: {
          ${launchpadMutationQuery}
        }
      ) {
        id
      }
    }
  `);

    // update collection
    await apiRequest(`
    mutation {
      update_fans_collections_item(
        id: "${launchpad[0].launchpad_type[0].fan_collection.id}"
        data: {
          ${collectionMutationQuery}
        }
      ) {
        id
      }
    }
  `);

    if (image) {
      fs.unlinkSync(image.path);
    }

    ctx.status = 200;
    ctx.body = "Collection Updated";
    return;
  } catch (error) {
    if (image) {
      fs.unlinkSync(image.path);
    }
    console.log("Error: ", error);
    ctx.status = 400;
    ctx.body = "Failed to update Collection";
    return;
  }
});

export default router;
