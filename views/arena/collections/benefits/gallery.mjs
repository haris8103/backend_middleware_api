import Router from "koa-router";
import fs from "fs";
import { useMixpanel } from "../../../../helpers/mixpanel.mjs";
import { deleteFile, handleImageUpload } from "../../../../helpers/uploadImage.mjs";
import {
  validateQuery,
  checkQueryKeywords,
} from "../../../../hooks/validateQuery.mjs";
import { apiRequest, apiRequestSystem } from "../../../../helpers/apicall.mjs";
import checkCookie from "../../../../helpers/auth.mjs";
const { sendMixpanel } = useMixpanel();

const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1/benefit/gallery`;

// ********************* //
// Create/Update Album
// ********************* //
router.post(`${BASE_URL}`, async (ctx) => {
  // formdata
  const { fields, files } = ctx.request.body;
  let { query, cookie, collection_id, type, } = fields;
  const galleryData = [];
  console.log({ query, collection_id, type })

  try {
    // Validate and sanitize query
    // const validatedQuery = validateQuery({ ctx, query });
    // if (!validatedQuery) return;

    // Check for specific keywords
    // const checkQuery = checkQueryKeywords({ ctx, query });
    // if (!checkQuery) return;

    // Check Cookie
    const userAuth = await checkCookie({ cookie });
    if (!userAuth) {
      console.log("error checking Cookie")
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }
    console.log(userAuth.profileId)
    // Fetch User
    const { users: user } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userAuth.profileId}" } }) {
          id
        }
      }
    `);
    
    // fetch Collection
    const collectionQuery = `
      query {
        fans_collections(filter: {
                    id: {
                        _eq: "${collection_id}"
                    }
                }) {
          artist {
            id
          }
        }
      }
    `;



    const { fans_collections: collection } = await apiRequest(collectionQuery);
    if (!collection) {
      ctx.status = 404;
      ctx.body = "Collection not found";
      return;
    }

    // Check Auth, is user the owner of the collection
    if (collection[0].artist.id !== user[0].id) {
      console.log("colleciton ID", collection_id)
      console.log("colleciton Artist ID", collection[0].artist.id)
      console.log("User ID", user[0].id)
      console.log("Invalid User")
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const handleGallery = async ({ gallery_id }) => {
      // Check if there are files
      if (!files.file) return;

      // Process files
      const processFiles = async ({ media }) => {
        const file = await handleImageUpload(
          fs.createReadStream(media.path),
          false,
          "Gallery"
        );
        const name = media.name.split(".")[0];

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
        await apiRequestSystem(updateFileQuery);

        // Attach file to album
        const attachFileQuery = `
        mutation {
          create_gallery_files_item(
            data: {
              gallery_id: { id: "${gallery_id}" }
              directus_files_id: {
                id: "${file}"
                filename_download: "${name}}"
                storage: "cloud"
                created_by: "${user[0].id}"
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
      };

      // process each file
      if (files.file.length > 1) {
        for (const media of files.file) {
          await processFiles({ media });
        }
      } else {
        await processFiles({ media: files.file });
      }
    };

    if (type === "create") {
      if (!fields.name || fields.name === "") {
        console.log("Required parameter name missing")
        ctx.status = 422;
        ctx.body = "Required parameter name missing";
        return;
      }
      const createGalleryQuery = `
        mutation {
          create_gallery_item(data: {
            user_created: { id: "${user[0].id}" },
            collection: { id: "${collection_id}" },
            name:  "${fields.name}",
            ${query ? query : ""}
          }) {
            id
          }
        }
      `;

        const { create_gallery_item: createGallery } = await apiRequest(
          createGalleryQuery
        );
        await handleGallery({ gallery_id: createGallery.id });
        galleryData.push(createGallery);
      
    }

    if (type === "update") {
      if (fields.name && fields.name === "") {
        console.log("Required parameter name missing")
        ctx.status = 422;
        ctx.body = "Required parameter name missing";
        return;
      }
      const updateGalleryQuery = `
        mutation {
          update_gallery_item(
            id: "${fields.gallery_id}",
            data: {
              ${fields.name ? `name:  "${fields.name}",`: ""}
              ${query ? query : ""}
            }
          ) {
            id
          }
        }
      `;

      await apiRequest(updateGalleryQuery);
      await handleGallery({ gallery_id: fields.gallery_id });
      galleryData.push({ id: fields.gallery_id });
    }


    // fetch Album before returning
    const fetchGalleryQuery = `
      query {
        gallery(filter: {
          id: {
            _eq: "${galleryData[0].id}"
          }
        }) {
          id
          name
          gallery_items {
            id
            directus_files_id {
                id
                title
            }
          }
        }
      }
    `;

    const { gallery: gallery } = await apiRequest(fetchGalleryQuery);
    ctx.status = 200;
    ctx.body = gallery;
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

router.post(`${BASE_URL}/:id`, async (ctx) => {
  // formdata
  // console.log(ctx.params)
  let gallery_id = ctx.params.id
  const { ids, collection_id, cookie } = ctx.request.body;



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
    const collectionQuery = `
      query {
        fans_collections(filter: {
                    id: {
                        _eq: "${collection_id}"
                    }
                }) {
          artist {
            id
          }
        }
      }
    `;

    const { fans_collections: collection } = await apiRequest(collectionQuery);
    
    if (!collection) {
      ctx.status = 404;
      ctx.body = "Collection not found";
      return;
    }
    // Check Auth, is user the owner of the collection
    if (collection[0].artist.id !== user[0].id) {
      console.log("colleciton ID", collection_id)
      console.log("colleciton Artist ID", collection[0].artist.id)
      console.log("User ID", user[0].id)
      console.log("Invalid User")
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }


    const fetchGalleryQuery = `
      query {
        gallery(filter: {
          id: {
            _eq: "${gallery_id}"
          }
        }) {
          id
          name
          gallery_items {
            id
            directus_files_id {
                id
                title
            }
          }
        }
      }
    `;



    const { gallery: gallery } = await apiRequest(fetchGalleryQuery);

    let req_del_gallery = gallery[0].gallery_items.filter(gallery => ids.includes(gallery.directus_files_id.id))
    let req_del_track_recs = req_del_gallery.map(track => track.id)
    console.log(req_del_track_recs)
    const deleteRecords = `
        mutation {
          delete_gallery_files_items(
            ids: [${req_del_track_recs}],
          )
          {
            ids  
          }
        }
      `;

    console.log(deleteRecords)

    const { collection_album_files: del } = await apiRequest(deleteRecords);

    for (let id of ids) {
      deleteFile(id)
    }


    ctx.status = 200;
    ctx.body = gallery;
    return;
  } catch (err) {

    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

export default router;
