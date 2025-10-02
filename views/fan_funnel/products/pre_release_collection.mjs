import Router from "koa-router";
import fs from "fs";
import { useMixpanel } from "../../../helpers/mixpanel.mjs";
import { deleteFile, handleImageUpload } from "../../../helpers/uploadImage.mjs";

import { apiRequest, apiRequestSystem } from "../../../helpers/apicall.mjs";
import checkCookie from "../../../helpers/auth.mjs";
const { sendMixpanel } = useMixpanel();

const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1/fan_funnel/pre_release_collection`;

// ********************* //
// Create pre_release_collection
// ********************* //
router.post(`${BASE_URL}`, async (ctx) => {

  const { fields, files } = ctx.request.body;
  const { cookie, type, name, quantity, description, album_name, required_tags } = fields;
  let { fan_funnel_id } = fields;
  const cover_image = files.cover_image;
  const collection_files = files.files;


  try {

    // Check Cookie
    const userAuth = await checkCookie({ cookie });
    if (!userAuth) {
      console.log("error checking Cookie")
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
      console.log("fan funnel ID", fan_funnel_id)
      console.log("fan funnel Artist ID", fanFunnel[0].artist.id)
      console.log("User ID", user[0].id)
      console.log("Invalid User")
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }
    if (cover_image) {
      const file = await handleImageUpload(
        fs.createReadStream(cover_image.path),
        false,
        type
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
      fs.unlinkSync(cover_image.path)
      cover_image.id = file;
    }

    const { create_pre_release_collection_item: preReleaseCollection } = await apiRequest(`
          mutation {
            create_pre_release_collection_item(
              data: {
               ${name ? `name: "${name}"` : ""},
              ${description ? `description: "${description}"` : ""},
              ${album_name ? `album_name: "${album_name}"` : ""},
              ${required_tags ? `required_tags: ["${required_tags}"]` : ""},
              ${quantity ? `quantity: ${quantity}` : ""},
          ${cover_image
        ? `cover_image: {
                      id: "${cover_image.id}",
                      filename_download: "${cover_image.name}}",
                      storage: "cloud",
                      created_by: "${user[0].id}",
                    }`
        : ""
      },
          type: "${type}"
    }) {
      id      
    }
               
        `);

    if (collection_files && collection_files.length > 1) {
      for (const media of collection_files) {
        await processFiles({ media }, preReleaseCollection.id, type, user[0].id);
      }
    } else {
      await processFiles({ media: collection_files }, preReleaseCollection.id, type, user[0].id);
    }

    await apiRequest(`
          mutation {
            create_fan_funnel_items_item(
              data: {
                fan_funnel_id: {id: "${fan_funnel_id}"},
                item: "${preReleaseCollection.id}",
                collection: "pre_release_collection"
              }
            ) {
                id
                
            }
          }
      `)

    // fetch Album before returning
    const fetchAlbumQuery = `
      query {
        pre_release_collection(filter: {
          id: {
            _eq: "${preReleaseCollection.id}"
          }
        }) {
          id
          type
          name
          quantity
          cover_image {
            id
            title
            }
          
          required_tags
          album_name
          collection {
            id
            directus_files_id{
            id
            title
          }
        }
      }
    }
    `;

    const { pre_release_collection: album } = await apiRequest(fetchAlbumQuery);
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

///Update pre_release_collection
router.post(`${BASE_URL}/:id`, async (ctx) => {
  // formdata
  // console.log(ctx.params)
  const id = ctx.params.id
  const { fields, files } = ctx.request.body;
  const { cookie, type, name, quantity, description, album_name, required_tags } = fields;
  let { fan_funnel_id } = fields;
  const cover_image = files.cover_image;
  const collection_files = files.files;


  try {

    // Check Cookie
    const userAuth = await checkCookie({ cookie });
    if (!userAuth) {
      console.log("error checking Cookie")
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
      console.log("fan funnel ID", fan_funnel_id)
      console.log("fan funnel Artist ID", fanFunnel[0].artist.id)
      console.log("User ID", user[0].id)
      console.log("Invalid User")
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    if (cover_image) {
      const file = await handleImageUpload(
        fs.createReadStream(cover_image.path),
        false,
        type
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
      fs.unlinkSync(cover_image.path)
      cover_image.id = file;
    }
    const data_update = `
    data: {
      ${name ? `name: "${name}"` : ""},
      ${description ? `description: "${description}"` : ""},
      ${album_name ? `album_name: "${album_name}"` : ""},
      ${required_tags ? `required_tags: ["${required_tags}"]` : ""},
      ${quantity ? `quantity: ${quantity}` : ""},
      ${cover_image
        ? `cover_image: {
                  id: "${cover_image.id}",
                  filename_download: "${cover_image.name}}",
                  storage: "cloud",
                  created_by: "${user[0].id}",
                }`
        : ""
      },
    }
    `;

    const { update_pre_release_collection_item: preReleaseCollection } = await apiRequest(`
          mutation {
            update_pre_release_collection_item(
              id: "${id}",
              ${data_update}
            ) {
              id
            }
          }
        `);
    if (collection_files && collection_files.length > 1) {
      for (const media of collection_files) {
        await processFiles({ media }, preReleaseCollection.id, type, user[0].id);
      }
    } else {
      await processFiles({ media: collection_files }, preReleaseCollection.id, type, user[0].id);
    }


    // fetch Album before returning
    const fetchAlbumQuery = `
      query {
        pre_release_collection(filter: {
          id: {
            _eq: "${preReleaseCollection.id}"
          }
        }) {
          id
          type
          name
          quantity
          cover_image {
            id
            title
            }
          album_name
          required_tags
          collection {
            id
            directus_files_id{
            id
            title
          }

        }
      }
    }
    `;

    const { pre_release_collection: album } = await apiRequest(fetchAlbumQuery);
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


router.patch(`${BASE_URL}/:id`, async (ctx) => {

  const fileId = ctx.params.id
  const { fields, files } = ctx.request.body;
  const { cookie, file_name } = fields;
  let { fan_funnel_id } = fields;



  try {

    // Check Cookie
    const userAuth = await checkCookie({ cookie });
    if (!userAuth) {
      console.log("error checking Cookie")
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
      console.log("fan funnel ID", fan_funnel_id)
      console.log("fan funnel Artist ID", fanFunnel[0].artist.id)
      console.log("User ID", user[0].id)
      console.log("Invalid User")
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    if (file_name) {
      const updateFileQuery = `
                     mutation {
                       update_files_item(
                         id: "${fileId}",
                         data: { title: "${file_name}", filename_download: "${file_name}" }
                       ) {
                         id
                       }
                     }
                   `;
      await apiRequestSystem(updateFileQuery);
    }


    // fetch Album before returning
    const fetchAlbumQuery = `
      query {
        pre_release_collection(filter: {
          id: {
            _eq: "${preReleaseCollection.id}"
          }
        }) {
          id
          type
          name
          quantity
          cover_image {
            id
            title
            }
          album_name
          required_tags
          collection {
            id
            directus_files_id{
            id
            title
          }

        }
      }
    }
    `;

    const { pre_release_collection: album } = await apiRequest(fetchAlbumQuery);
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

///Delete pre_release_collection
router.delete(`${BASE_URL}/:fan_funnel_id/:id`, async (ctx) => {
  // formdata
  // console.log(ctx.params)
  const fan_funnel_id = ctx.params.fan_funnel_id;
  const id = ctx.params.id

  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;
  try {

    // Check Cookie
    const userAuth = await checkCookie({ cookie });
    if (!userAuth) {
      console.log("error checking Cookie")
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
                ... on pre_release_collection { id }
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
      console.log("fan funnel ID", fan_funnel_id)
      console.log("fan funnel Artist ID", fanFunnel[0].artist.id)
      console.log("User ID", user[0].id)
      console.log("Invalid User")
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }



    await apiRequest(`
        mutation {
          delete_pre_release_collection_item(
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


///Update pre_release_collection
router.delete(`${BASE_URL}/delete-file/:fan_funnel_id/:fileId`, async (ctx) => {
  // formdata
  // console.log(ctx.params)
  const fan_funnel_id = ctx.params.fan_funnel_id;
  const fileId = ctx.params.fileId
  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;

  try {

    // Check Cookie
    const userAuth = await checkCookie({ cookie });
    if (!userAuth) {
      console.log("error checking Cookie")
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
      console.log("fan funnel ID", fan_funnel_id)
      console.log("fan funnel Artist ID", fanFunnel[0].artist.id)
      console.log("User ID", user[0].id)
      console.log("Invalid User")
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }


    await deleteFile(fileId)

    ctx.status = 200;
    ctx.body = `Successfully file deleted id: ${fileId}`;
    return;
  } catch (err) {
    //console.log(err, ctx);
    console.log(err);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});




const processFiles = async ({ media }, preReleaseCollectionId, type, userId) => {
  const file = await handleImageUpload(
    fs.createReadStream(media.path),
    false,
    type
  );

  const name = media.name.split(".")[0];
  const updateFileQuery = `
              mutation {
                update_files_item(
                  id: "${file}",
                  data: { title: "${name}" },
                ) {
                  id
                }
              }
            `;
  await apiRequestSystem(updateFileQuery);

  // Attach file to album
  const attachFileQuery = `
              mutation {
                create_pre_release_collection_files_item(
                  data: {
                    pre_release_collection_id: { id: "${preReleaseCollectionId}" },
                    directus_files_id: {
                      id: "${file}",
                      filename_download: "${name}",
                      storage: "cloud",
                      created_by: "${userId}",
                    }
                  }
                ) {
                  id
                }
              }
            `;
  await apiRequest(attachFileQuery);
  // remove file/files
  fs.unlinkSync(media.path);
}
const sanitizedTitle = (name) => name.replace(/"/g, '\\"');

export default router;
