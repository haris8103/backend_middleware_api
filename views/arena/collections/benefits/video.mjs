import Router from "koa-router";
import fs from "fs";
import { useMixpanel } from "../../../../helpers/mixpanel.mjs";
import { handleImageUpload } from "../../../../helpers/uploadImage.mjs";
import {
  validateQuery,
  checkQueryKeywords,
} from "../../../../hooks/validateQuery.mjs";
import { apiRequest, apiRequestSystem } from "../../../../helpers/apicall.mjs";
import checkCookie from "../../../../helpers/auth.mjs";
const { sendMixpanel } = useMixpanel();

const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1/benefit/video`;

// ********************* //
// Create/Update Video
// ********************* //
router.post(`${BASE_URL}`, async (ctx) => {
  // formdata
  const { fields, files } = ctx.request.body;
  const { cookie, collection_id, type, name, video_id } = fields;
  let videoId;

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

    if (!files) {
      ctx.status = 400;
      ctx.body = "No files uploaded";
      return;
    }

    if (type === "create") {
      // Upload Files
      let main_video;
      let preview_video;
      let thumbnail;

      if (files.main_video) {
        main_video = await handleImageUpload(
          fs.createReadStream(files.main_video.path),
          false,
          "videos"
        );
      }

      if (files.preview_video) {
        preview_video = await handleImageUpload(
          fs.createReadStream(files.preview_video.path),
          false,
          "videos"
        );
      }

      if (files.thumbnail) {
        thumbnail = await handleImageUpload(
          fs.createReadStream(files.thumbnail.path),
          false,
          "videos"
        );
      }

      // remove temp files
      if (files.main_video) {
        fs.unlinkSync(files.main_video.path);
      }
      if (files.preview_video) {
        fs.unlinkSync(files.preview_video.path);
      }
      if (files.thumbnail) {
        fs.unlinkSync(files.thumbnail.path);
      }

      const createCollectionVideo = `
        mutation {
          create_collection_video_item(data: {
            name: "${name}",
            user_created: { id: "${user[0].id}" },
            collection: { id: "${collection_id}" },
            ${files.main_video ? `main_video: { id: "${main_video}", storage: "cloud", filename_download: "${main_video}" },` : ""}
            ${files.preview_video ? `preview_video: { id: "${preview_video}", storage: "cloud", filename_download: "${preview_video}" },` : ""}
            ${files.thumbnail ? `thumbnail: { id: "${thumbnail}", storage: "cloud", filename_download: "${thumbnail}" },` : ""}
          }) {
            id
          }
        }
      `;

      const { create_collection_video_item: collectionVideoItem } =
        await apiRequest(createCollectionVideo);

      videoId = collectionVideoItem.id;
    }

    if (type === "update") {
      const updateCollectionVideoQuery = `
        mutation {
          update_collection_video_item(
            id: "${video_id}",
            data: {
              name: "${name}",
              user_updated: { id: "${user[0].id}" }
            }
          ) {
            id
          }
        }
      `;

      await apiRequest(updateCollectionVideoQuery);
      videoId = video_id;
    }

    // fetch Video before returning
    const fetchVideosQuery = `
      query {
        collection_video(filter: {
          id: {
            _eq: "${videoId}"
          }
        }) {
          id
          name
          main_video {
            id
          }
          preview_video {
            id
          }
          thumbnail {
            id
          }
          videos {
            video: directus_files_id {
              id
              title
            }
          }
        }
      }
    `;

    const { collection_video: videos } = await apiRequest(fetchVideosQuery);
    ctx.status = 200;
    ctx.body = videos;
    return;
  } catch (err) {
    //console.log(err, ctx);
    console.log({ err: err.response.data });
    ctx.status = err.response?.status || 500;
    ctx.body = err.response?.data || { error: "Internal Server Error" };
    return;
  }
});

export default router;
