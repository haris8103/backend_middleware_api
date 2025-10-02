import Router from "koa-router";
import fs from "fs";
import { useMixpanel } from "../../../../helpers/mixpanel.mjs";
import { deleteFile,handleImageUpload } from "../../../../helpers/uploadImage.mjs";
import {
  validateQuery,
  checkQueryKeywords,
} from "../../../../hooks/validateQuery.mjs";
import { apiRequest, apiRequestSystem } from "../../../../helpers/apicall.mjs";
import checkCookie from "../../../../helpers/auth.mjs";
const { sendMixpanel } = useMixpanel();

const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1/benefit/album`;

// ********************* //
// Create/Update Album
// ********************* //
router.post(`${BASE_URL}`, async (ctx) => {
  // formdata
  const { fields, files } = ctx.request.body;
  const { query, cookie, collection_id, type, album_id } = fields;
  const albumData = [];
  console.log({query, collection_id, type })

  try {
    // Validate and sanitize query
    const validatedQuery = validateQuery({ ctx, query });
    if (!validatedQuery) return;

    // Check for specific keywords
    const checkQuery = checkQueryKeywords({ ctx, query });
    if (!checkQuery) return;

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
      console.log("colleciton ID", collection_id )
      console.log("colleciton Artist ID", collection[0].artist.id )
      console.log("User ID", user[0].id )
      console.log("Invalid User")
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const handleAlbum = async ({ album_id }) => {
      // Check if there are files
      if (!files.file) return;

      // Process files
      const processFiles = async ({ media }) => {
        const file = await handleImageUpload(
          fs.createReadStream(media.path),
          false,
          "Tracks"
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
          create_collection_album_files_item(
            data: {
              collection_album_id: { id: "${album_id}" }
              directus_files_id: {
                id: "${file}"
                filename_download: "${album_id}}"
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
      const createAlbumQuery = `
        mutation {
          create_collection_album_item(data: {
            user_created: { id: "${user[0].id}" },
            collection: { id: "${collection_id}" },
            status: "published",
            ${query ? query : ""}
          }) {
            id
          }
        }
      `;

      const { create_collection_album_item: createAlbum } = await apiRequest(
        createAlbumQuery
      );
      await handleAlbum({ album_id: createAlbum.id });
      albumData.push(createAlbum);
    }

    if (type === "update") {
      const updateAlbumQuery = `
        mutation {
          update_collection_album_item(
            id: "${fields.album_id}",
            data: {
              ${query ? query : ""}
            }
          ) {
            id
          }
        }
      `;

      await apiRequest(updateAlbumQuery);
      await handleAlbum({ album_id: fields.album_id });
      albumData.push({ id: fields.album_id });
    }


    // fetch Album before returning
    const fetchAlbumQuery = `
      query {
        collection_album(filter: {
          id: {
            _eq: "${albumData[0].id}"
          }
        }) {
          id
          name
          genre {
            id
            name
          }
          tracks {
            track: directus_files_id {
              id
              title
            }
          }
        }
      }
    `;

    const { collection_album: album } = await apiRequest(fetchAlbumQuery);
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

router.post(`${BASE_URL}/:id`, async (ctx) => {
  // formdata
  // console.log(ctx.params)
  let album_id = ctx.params.id
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

 
    const fetchAlbumQuery = `
      query {
        collection_album(filter: {
          id: {
            _eq: "${album_id}"
          }
        }) {
          id
          name
          genre {
            id
            name
          }
          tracks {
            id
            track: directus_files_id {
              id
            }
          }
        }
      }
    `;



    const { collection_album: album } = await apiRequest(fetchAlbumQuery);
    
  
    let req_del_tracks = album[0].tracks.filter(track => ids.includes(track.track.id))
    let req_del_track_recs = req_del_tracks.map(track => track.id)

    const deleteRecords = `
        mutation {
          delete_collection_album_files_items(
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
      await deleteFile(id)
    }


    ctx.status = 200;
    ctx.body = album;
    return;
  } catch (err) {
    console.log(err)
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});


export default router;
