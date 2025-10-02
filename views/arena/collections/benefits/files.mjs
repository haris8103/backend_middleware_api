import Router from "koa-router";
import fs from "fs";
import { useMixpanel } from "../../../../helpers/mixpanel.mjs";
import { handleImageUpload } from "../../../../helpers/uploadImage.mjs";
import { apiRequest, apiRequestSystem } from "../../../../helpers/apicall.mjs";
import checkCookie from "../../../../helpers/auth.mjs";
const { sendMixpanel } = useMixpanel();

const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1/benefit/files`;

// ********************* //
// Create/Update Files
// ********************* //
router.post(`${BASE_URL}`, async (ctx) => {
  // formdata
  const { fields, files } = ctx.request.body;
  const { cookie, collection_id, type, name, files_id } = fields;
  let filesId;

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
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const handleFiles = async ({ files_id }) => {
      // Check if there are files
      if (!files.file) return;

      // Process files
      const processFiles = async ({ media }) => {
        const file = await handleImageUpload(
          fs.createReadStream(media.path),
          false,
          "videos"
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

        // Attach file to Video
        const attachFileQuery = `
        mutation {
          create_collection_files_files_item(
            data: {
              collection_files_id: { id: "${files_id}" }
              directus_files_id: {
                id: "${file}"
                title: "${name}"
                filename_download: "${files_id}}"
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
      const createFilesQuery = `
        mutation {
          create_collection_files_item(data: {
            name: "${name}",
            user_created: { id: "${user[0].id}" },
            collection: { id: "${collection_id}" },
          }) {
            id
          }
        }
      `;

      const { create_collection_files_item: createFiles } = await apiRequest(
        createFilesQuery
      );
      await handleFiles({ files_id: createFiles.id });
      filesId = createFiles.id;
    }

    if (type === "update") {
      const updateFilesQuery = `
        mutation {
          update_collection_files_item(
            id: "${files_id}",
            data: {
              name: "${name}",
              user_updated: { id: "${user[0].id}" }
            }
          ) {
            id
          }
        }
      `;

      await apiRequest(updateFilesQuery);
      await handleFiles({ files_id: files_id});
      filesId = files_id;
    }

    // fetch Video before returning
    const fetchFilesQuery = `
      query {
        collection_files(filter: {
          id: {
            _eq: "${filesId}"
          }
        }) {
          id
          name
          files {
            file: directus_files_id {
              id
              title
            }
          }
        }
      }
    `;

    const { collection_files: _result } = await apiRequest(fetchFilesQuery);
    ctx.status = 200;
    ctx.body = _result;
    return;
  } catch (err) {
    //console.log(err, ctx);
    console.log(err);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

export default router;
