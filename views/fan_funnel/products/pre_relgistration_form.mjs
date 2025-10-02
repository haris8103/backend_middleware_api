import Router from "koa-router";
import fs from "fs";
import { useMixpanel } from "../../../helpers/mixpanel.mjs";
import {
  handleImageUpload,
} from "../../../helpers/uploadImage.mjs";

import { apiRequest, apiRequestSystem } from "../../../helpers/apicall.mjs";
import checkCookie from "../../../helpers/auth.mjs";
const { sendMixpanel } = useMixpanel();

const router = new Router();
const BASE_URL = `/v1/fan_funnel/pre_registration`;

// ********************* //
// Create pre_registration
// ********************* //
router.post(`${BASE_URL}`, async (ctx) => {
  const { fields, files } = ctx.request.body;
  const { cookie, name, description, required_tags, release_date } =
    fields;
  let { fan_funnel_id } = fields;
  // console.log(files)
  const cover_image = files.cover_image;

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
    // if (!fan_funnel_id) {
    const { fan_funnel: new_Fan_funnel } = await apiRequest(`
          query { 
          fan_funnel(
          filter: {
            artist: { id: { _eq: "${user[0].id}" } }
          }
        ) {
            id}
      }
      `);
    fan_funnel_id = new_Fan_funnel?.[0]?.id;

    if (!new_Fan_funnel?.[0]) {
      const { create_fan_funnel_item: fanFunnel } = await apiRequest(`
        mutation { 
          create_fan_funnel_item (
            data:{
              artist: {
                id: "${user[0].id}"
              }
            }
          ) {
            id
            artist {
              id
            }
          }
        }
      `);
      fan_funnel_id = fanFunnel.id;
    }
    // }

    // fetch Collection
    const fan_funnel_query = `
      query {
        fan_funnel(filter: {
                    id: {
                        _eq: "${fan_funnel_id}"
                    }
                }) {
          artist {
            id
          }
        }
      }
    `;

    const { fan_funnel: fanFunnel } = await apiRequest(fan_funnel_query);
    if (!fanFunnel) {
      ctx.status = 404;
      ctx.body = "funnel not found";
      return;
    }

    // Check Auth, is user the owner of the collection
    if (fanFunnel[0].artist.id !== user[0].id) {
      console.log("fan funnel ID", fan_funnel_id);
      console.log("fan funnel Artist ID", fanFunnel[0].artist.id);
      console.log("User ID", user[0].id);
      console.log("Invalid User");
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }
    if (cover_image) {
      const file = await handleImageUpload(
        fs.createReadStream(cover_image.path),
        false,
        "cover_image"
      );

      const name = cover_image.name.split(".")[0];
      const updateFileQuery = `
              mutation {
                update_files_item(
                  id: "${file}"
                  data: { title: "${name}" }
                ) {
                  id
                }
              }
            `;
      const { update_files_item } = await apiRequestSystem(updateFileQuery);
      //  console.log(update_files_item.id)
      cover_image.id = update_files_item.id;
      //  console.log(cover_image.id )
      fs.unlinkSync(cover_image.path);
    }
    const release_date_obj = release_date && release_date.length > 0 ? new Date(release_date).toISOString() : null;
    const sanitizedTitle = (name) => name.replace(/"/g, '\\"');
    const { create_pre_registration_item: preRegistration } = await apiRequest(`
          mutation {
            create_pre_registration_item(
              data: {
                fan_funnel: { id: "${fan_funnel_id}" },
                ${name ? `name: "${name}"` : ""},
          ${description ? `description: "${description}"` : ""},
          ${required_tags ? `required_tags: ["${required_tags}"]` : ""},
          ${cover_image && cover_image.id
        ? `cover_image: {
                  id: "${cover_image.id}",
                  filename_download: "${cover_image.name}}",
                  storage: "cloud",
                  created_by: "${user[0].id}",
                }`
        : ""
      },
          ${release_date && release_date.length > 0 ? `release_date: "${release_date_obj}"` : ""}
              }
            ) {
              id
            }
          }
        `);
    // console.log(preRegistration)
    await apiRequest(`
          mutation {
            create_fan_funnel_items_item(
              data: {
                fan_funnel_id:{id: "${fan_funnel_id}"},
                item: "${preRegistration.id}",
                collection: "pre_registration"
              }
            ) {
                id
                
            }
          }
      `);

    // fetch Album before returning
    const fetchAlbumQuery = `
      query {
        pre_registration(filter: {
          id: {
            _eq: "${preRegistration.id}"
          }
        }) {
          id
          name
          cover_image {
            id
            title
            }
          release_date
          required_tags
        }
      }
    `;

    const { pre_registration: album } = await apiRequest(fetchAlbumQuery);
    ctx.status = 200;
    ctx.body = album;
    return;
  } catch (err) {
    //console.log(err, ctx);
    console.log(err);
    console.log(err.response.data);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

///Update pre_registration
router.post(`${BASE_URL}/:id`, async (ctx) => {
  // formdata
  // console.log(ctx.params)
  const id = ctx.params.id;
  const { fields, files } = ctx.request.body;
  const { cookie, name, description, release_date, required_tags } =
    fields;
  let { fan_funnel_id } = fields;
  const cover_image = files.cover_image;

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

    // fetch Collection
    const fan_funnel_query = `
      query {
        fan_funnel(filter: {
                    id: {
                        _eq: "${fan_funnel_id}"
                    }
                }) {
          artist {
            id
          }
        }
      }
    `;

    const { fan_funnel: fanFunnel } = await apiRequest(fan_funnel_query);
    if (!fanFunnel) {
      ctx.status = 404;
      ctx.body = "funnel not found";
      return;
    }

    // Check Auth, is user the owner of the collection
    if (fanFunnel[0].artist.id !== user[0].id) {
      console.log("fan funnel ID", fan_funnel_id);
      console.log("fan funnel Artist ID", fanFunnel[0].artist.id);
      console.log("User ID", user[0].id);
      console.log("Invalid User");
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    if (cover_image) {
      const file = await handleImageUpload(
        fs.createReadStream(cover_image.path),
        false,
        "cover_image"
      );
      const name = cover_image.name.split(".")[0];
      const updateFileQuery = `
                         mutation {
                           update_files_item(
                             id: "${file}",
                             data: { title: "${name}" }
                           ) {
                             id
                           }
                         }
                       `;
      await apiRequestSystem(updateFileQuery);
      fs.unlinkSync(cover_image.path);
      cover_image.id = file;
    }
    const release_date_obj = new Date(release_date).toISOString();
    const data_update = `
        data: {
          ${name ? `name: "${name}"` : ""},
          ${description ? `description: "${description}"` : ""},
          ${required_tags ? `required_tags: ["${required_tags}"]` : ""},
          ${cover_image && cover_image.id
        ? `cover_image: {
                  id: "${cover_image.id}",
                  filename_download: "${cover_image.name}}",
                  storage: "cloud",
                  created_by: "${user[0].id}",
                }`
        : ""
      },
          ${release_date ? `release_date: "${release_date_obj}"` : ""}
        }
        `;

    const { update_pre_registration_item: preRegistration } = await apiRequest(`
          mutation {
            update_pre_registration_item(
              id: "${id}"
              ${data_update}
            ) {
              id
            }
          }
        `);

    // fetch Album before returning
    const fetchAlbumQuery = `
      query {
        pre_registration(filter: {
          id: {
            _eq: "${preRegistration.id}"
          }
        }) {
          id
          name
          cover_image {
            id
            title
            }
          release_date
          required_tags
        }
      }
    `;

    const { pre_registration: album } = await apiRequest(fetchAlbumQuery);
    ctx.status = 200;
    ctx.body = album;
    return;
  } catch (err) {
    //console.log(err, ctx);
    console.log(err);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

///Get pre_registration
router.get(`${BASE_URL}/:id`, async (ctx) => {
  console.log(ctx.params.id)
  const id = ctx.params.id;

  try {
    const fan_funnel_query = `
      query {
          fan_funnel(filter: { id: { _eq: ${id}}},limit: 1){
            id
              artist{
                  id
                  avatar{
                      id
                  }
                  display_name
                  first_name
              }
              items(filter: { item__pre_registration: { is_default: { _eq: true}}},limit: 1) {
                  id
                  collection
                  item{
                      ... on pre_registration {
                      id
                      name
                      quantity
                      description
                      cover_image {
                        id
                        title
                      }
                      
                      release_date
                      required_tags
                      is_default
                    
                    }
                          }
                    }
                }
    }
    `;

    const { fan_funnel } = await apiRequest(fan_funnel_query);
    if (!fan_funnel) {
      ctx.status = 404;
      ctx.body = "Pre registration data not found";
      return;
    }
    ctx.status = 200;
    ctx.body = fan_funnel?.[0];
    return;
  } catch (err) {
    //console.log(err, ctx);
    console.log(err);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

///Delete pre_registration
router.delete(`${BASE_URL}/:fan_funnel_id/:id`, async (ctx) => {
  // formdata
  // console.log(ctx.params)
  const fan_funnel_id = ctx.params.fan_funnel_id;
  const id = ctx.params.id;
  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;
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

    // fetch Collection
    const fan_funnel_query = `
      query {
        fan_funnel(filter: {
                    id: {
                        _eq: "${fan_funnel_id}"
                    }
                }) {
                
          
          artist {
            id
          }
          items(
            filter: { id: { _eq: "${id}" } }
            limit: 50      
            ) {
                id
                item {
                ... on pre_registration { id }
                }
              }
            }
          }
    `;

    const { fan_funnel: fanFunnel } = await apiRequest(fan_funnel_query);
    if (!fanFunnel) {
      ctx.status = 404;
      ctx.body = "funnel not found";
      return;
    }

    // Check Auth, is user the owner of the collection
    if (fanFunnel[0].artist.id !== user[0].id) {
      console.log("fan funnel ID", fan_funnel_id);
      console.log("fan funnel Artist ID", fanFunnel[0].artist.id);
      console.log("User ID", user[0].id);
      console.log("Invalid User");
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }


    await apiRequest(`
        mutation {
          delete_pre_registration_item(
          id: "${fanFunnel[0].items[0].item.id}"
        ) {
          id
        }
      }
    `);

    await apiRequest(`
        mutation {
          delete_fan_funnel_items_item(
          id: "${id}"
        ) {
          id
        }
      }
    `);

    ctx.status = 200;
    ctx.body = `Successfully deleted id: ${id}`;
    return;
  } catch (err) {
    //console.log(err, ctx);
    console.log(err);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

///Update default status for pre_registration
router.post(`${BASE_URL}/:fan_funnel_id/:id/default`, async (ctx) => {
  const fan_funnel_id = ctx.params.fan_funnel_id;
  const id = ctx.params.id;
  const { user_cookie } = ctx.request.headers;
  const { is_default } = ctx.request.body;
  const cookie = user_cookie;

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

    // fetch Collection and verify ownership
    const fan_funnel_query = `
      query {
        fan_funnel(filter: {
          id: {
            _eq: "${fan_funnel_id}"
          }
        }) {
          artist {
            id
          }
          items(
            filter: { id: { _eq: "${id}" } }
            limit: 50      
          ) {
            id
            item {
              ... on pre_registration { 
                id 
                is_default
              }
            }
          }
        }
      }
    `;

    const { fan_funnel: fanFunnel } = await apiRequest(fan_funnel_query);
    if (!fanFunnel || !fanFunnel[0]) {
      ctx.status = 404;
      ctx.body = "funnel not found";
      return;
    }

    // Check Auth, is user the owner of the collection
    if (fanFunnel[0].artist.id !== user[0].id) {
      console.log("fan funnel ID", fan_funnel_id);
      console.log("fan funnel Artist ID", fanFunnel[0].artist.id);
      console.log("User ID", user[0].id);
      console.log("Invalid User");
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    if (is_default === true) {
      // First, set all other pre_registration items in this fan_funnel to non-default
      const getAllItemsQuery = `
        query {
          fan_funnel(filter: {
            id: {
              _eq: "${fan_funnel_id}"
            }
          }) {
            items(
              filter: { collection: { _eq: "pre_registration" } }
              limit: 1000
            ) {
              id
              item {
                ... on pre_registration { 
                  id 
                  is_default
                }
              }
            }
          }
        }
      `;

      const { fan_funnel: allItems } = await apiRequest(getAllItemsQuery);

      if (allItems && allItems[0] && allItems[0].items) {
        // Set all items to non-default first
        for (const item of allItems[0].items) {
          if (item.item && item.item.id) {
            await apiRequest(`
              mutation {
                update_pre_registration_item(
                  id: "${item.item.id}"
                  data: {
                    is_default: false
                  }
                ) {
                  id
                  is_default
                }
              }
            `);
          }
        }
      }
    }

    // Now update the specific item's default status
    const { update_pre_registration_item: updatedItem } = await apiRequest(`
      mutation {
        update_pre_registration_item(
          id: "${fanFunnel[0].items[0].item.id}"
          data: {
            is_default: ${is_default}
          }
        ) {
          id
          is_default
        }
      }
    `);

    ctx.status = 200;
    ctx.body = {
      success: true,
      message: `Default status updated successfully`,
      data: updatedItem
    };
    return;
  } catch (err) {
    console.log(err);
    ctx.status = err.response?.status || 500;
    ctx.body = err.response?.data || "Internal server error";
    return;
  }
});

/**
 * Form Fans Count
 */
router.get(`${BASE_URL}/fans/:id/count`, async (ctx) => {
  const id = ctx.params.id;
  if (!id) {
    ctx.status = 400;
    ctx.body = "Pre registration id not found";
    return;
  }

  try {
    const fan_funnel_query = `
      query {
        pre_registration_submissions_aggregated(
        filter: {
          pre_registration: {
            fan_funnel: { artist: { id: { _eq: "${id}" } } }
          }
        }
          limit: 1,
      ) {
        distinct_count:countDistinct { distinct_count:email }
      }
      }
    `;

    const data = await apiRequest(fan_funnel_query);

    ctx.status = 200;
    ctx.body = {
      success: true,
      message: `Pre registration fans count`,
      data: data?.pre_registration_submissions_aggregated?.[0]?.distinct_count
    };
    return;
  } catch (err) {
    console.log(err);
    ctx.status = err.response?.status || 500;
    ctx.body = err.response?.data || "Internal server error";
    return;
  }
});

export default router;
