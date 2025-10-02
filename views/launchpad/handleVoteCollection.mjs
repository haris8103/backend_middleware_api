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

//create teir list based on division id
const teirList = (divisionId) => {
  switch (divisionId) {
    case "1":
      return "6";
    case "2":
      return "5";
    case "3":
      return "4";
    case "4":
      return "3";
    case "5":
      return "2";
    case "6":
      return "1";
    default:
      return "6";
  }
};

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
      minPrice:"0",
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
// Get Launchpad
// ********************* //
router.get(`${BASE_URL}/:id`, async (ctx) => {
  const { id } = ctx.params;
  try {
    const result = await axios({
      url: `${url}/graphql`,
      method: "post",
      data: {
        query: `
        query {
          launchpad(filter: { project_slug: { _eq: "${id}" } }) {
            project_name
            project_slug
            banner {
              id
            }
            launchInfo {
              startDate
              startTime
              endDate
              endTime
              publicDate
              publicTime
              minPrice
            }
          }
        }
          `,
      },
    });

    ctx.status = 200;
    ctx.body = result.data.data.launchpad[0];
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// ********************* //
// Edit Vote Launchpad/Collection
// ********************* //
router.post(`${BASE_URL}/editVoteCollection`, async (ctx) => {
  // formdata
  const { fields, files } = ctx.request.body;
  const { cookie, launchpadId, divisionId, genreId, status } = fields;
  const { image, song } = files;

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
        filter: { id: { _eq: "${launchpadId}" } }
      ) {
        id
        artist {
          id
        }
        banner {
          id
        }
        launchpad_type {
          fan_collection {
            id
            song {
              id
            }
            leaderboard {
              id
              genre {
                id
              }
              division {
                id
              }
            }
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

  // Handle Image Upload
  const handleImage = async (image, currentImageid) => {
    return await handleImageUpload(image, currentImageid);
  };

  try {
    // Upload image
    const nft_artwork = image
      ? await handleImage(
          fs.createReadStream(image.path),
          launchpad[0].banner.id
        )
      : null;

    // Resolve promises before constructing the query
    const artwork_imageId = image ? await nft_artwork : null;

    // Construct the added mutation query based on the type
    let launchpadMutationQuery;
    let collectionMutationQuery;

    /* ======================= */
    /* === VOTE Collection === */
    /* ======================= */
    // fetch leaderboards
    const { leaderboards: leaderboardData } = await apiRequest(`
        query {
          leaderboards(
            filter: {
              genre: { id: { _eq: ${genreId} } },
              division: { id: { _eq: ${divisionId} } }
            }
          ) {
            id
            genre {
              name
            }
            division {
              name
            }
          }
        }
      `);

    // Upload song
    const songRequest = song
      ? await handleImage(
          fs.createReadStream(song.path),
          launchpad[0].launchpad_type[0].fan_collection.song.id
        )
      : null;

    const songId = song ? await songRequest : null;

    launchpadMutationQuery = `
          project_name: "WMA Vote ${leaderboardData[0].genre.name} (${
      leaderboardData[0].division.name
    }) - ${user[0].username ?? user[0].first_name}"
          project_slug: "wmavote-${leaderboardData[0].genre.name.toLowerCase()}-${leaderboardData[0].division.name.toLowerCase()}-${
      user[0].username.toLowerCase() ?? user[0].first_name.toLowerCase()
    }"
      `;

    collectionMutationQuery = `
        name: "WMA Vote ${leaderboardData[0].genre.name} (${
      leaderboardData[0].division.name
    }) - ${user[0].username ?? user[0].first_name}"
        ${leaderboardData ? `leaderboard: ${leaderboardData[0].id} ` : ""}
        ${
          songId
            ? `song: {
          id: "${songId}" 
          storage: "cloud"
          filename_download: "${songId}"
        }`
            : ""
        }
      `;

    // Update Launchpad
    await apiRequest(`
    mutation {
      update_fans_launchpad_item(
        id: "${launchpadId}"
        data: {
          status: "${status}"
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
          status: "${status}"
          ${
            artwork_imageId
              ? `artwork: {
            id: "${artwork_imageId}"
            storage: "cloud"
            filename_download: "${artwork_imageId}"
          }`
              : ""
          }
          ${collectionMutationQuery}
        }
      ) {
        id
      }
    }
  `);

    // Remove files
    if (song) {
      fs.unlinkSync(song.path);
    }
    if (image) {
      fs.unlinkSync(image.path);
    }

    ctx.status = 200;
    ctx.body = "Collection Updated";
    return;
  } catch (error) {
    // Remove files
    if (song) {
      fs.unlinkSync(song.path);
    }
    if (image) {
      fs.unlinkSync(image.path);
    }

    console.log("Error: ", error);
    ctx.status = 400;
    ctx.body = "Failed to update Collection";
    return;
  }
});

// ********************* //
// Create Vote Launchpad
// ********************* //
router.post(`${BASE_URL}/createVoteCollection`, async (ctx) => {
  // formdata
  const { fields, files } = ctx.request.body;

  const { cookie, divisionId, genreId, status } = fields;
  const { image, song } = files;

  const userData = await authCheck({ cookie });

  // Validate request body
  const { error } = voteCollectionSchema.validate(fields);
  if (error) {
    ctx.status = 400;
    ctx.body = error.details[0].message;
    return;
  }

  if (!userData) {
    ctx.status = 401;
    ctx.body = "Unauthorized";
    return;
  }

  const defaultField = {
    status: status ? status : "draft",
    platform: "app.loop.fans",
    project_status: "upcoming",
    mint_status: "active",
    collection_type: "vote",
    launchpad_type: {
      launchInfo: {
        mintPrice: "0",
        mint_limit: 1,
        minPrice:"0",
        startDate: new Date("2024-05-15").toISOString(),
        startTime: "00:00:00",
        endDate: new Date("2024-08-15").toISOString(),
        endTime: "23:59:59",
        publicDate: new Date("2024-08-15").toISOString(),
        publicTime: "00:00:00",
      },
    },
  };

  try {
    // fetch user data
    const { users: user } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          id
          first_name
          display_name
          username
          sso_email
          creator_status
        }
      }
    `);

    // Log data for debugging
    logtail.debug(`Creating Vote Collection: ${user[0].id}`, {
      user: user[0].id,
      divisionId: divisionId,
      genreId: genreId,
      image: image ? image.name : "No Image",
      song: song ? song.name : "No Song",
      songType: song ? song.type : "No Song",
    });

    // Fetch divisions
    const { divisions: division } = await apiRequest(`
      query {
        divisions(filter: { id: { _eq: ${divisionId} } }) {
          id
          name
          max_supply
        }
      }
    `);

    // Fetch genres
    const { genres: genres } = await apiRequest(`
      query {
        genres {
          id
          name
        }
      }
    `);

    // fetch leaderboard
    const { leaderboards: leaderboard } = await apiRequest(`
      query {
        leaderboards(filter: {
          division: { id: { _eq: ${divisionId} } },
          genre: { id: { _eq: ${genreId} } } }) {
          id
        }
      }
    `);

    // Check if already in Leaderboard
    const { fans_collections: collections } = await apiRequest(` 
    query {
      fans_collections(
        filter: {
          artist: { id: { _eq: "${user[0].id}" } }
          leaderboard: {
            id: { _eq: "${leaderboard[0].id}" }
          }
        }
      ) {
        id
      }
    }
  `);

    if (collections.length > 0) {
      if (image) {
        fs.unlinkSync(image.path);
      }
      ctx.status = 400;
      ctx.body =
        "You are already in this leaderboard, please select another genre to compete in.";
      return;
    }

    if (!leaderboard.length) {
      if (image) {
        fs.unlinkSync(image.path);
      }
      ctx.status = 400;
      ctx.body =
        "The leaderboard for this genre is not available. Please select another genre to compete in.";
      return;
    }

    // Handle Image Upload
    const handleImage = async (image, currentImageid) => {
      return await handleImageUpload(image, currentImageid);
    };

    // Upload image
    const nft_artwork = image
      ? await handleImage(fs.createReadStream(image.path), false)
      : null;

    // Upload song
    const songRequest = song
      ? await handleImage(fs.createReadStream(song.path), false)
      : null;

    // Resolve promises before constructing the query
    const artwork_imageId = image ? await nft_artwork : null;

    const songId = song ? await songRequest : null;

    // get genre by genreId
    const genreName = () => {
      return genres.filter((genre) => {
        if (genre.id === genreId) {
          return genre.name;
        }
      })[0].name;
    };

    const launchpadName = `WMA Vote ${genreName()} (${division[0].name}) - ${
      user[0].username
    }`;
    // create slug with genre name lowercase and replace space with -
    const launchpadSlug = `wmavote-${genreName()
      .toLowerCase()
      .replace(/\s/g, "-")}-${division[0].name}-${user[0].username}`;

    const { create_fans_launchpad_item: createVoteLaunchpad } =
      await apiRequest(`
    mutation {
      create_fans_launchpad_item(
        data: {
          status: "${defaultField.status}"
          platform: "${defaultField.platform}"
          project_status: "${defaultField.project_status}"
          mint_status: "${defaultField.mint_status}"
          artist: { id: "${user[0].id}" }
          project_name: "${launchpadName}"
          project_slug: "${launchpadSlug.toLowerCase().replace(/\s/g, "-")}"
          collection_type: "${defaultField.collection_type}"
          banner: {
            id: "${artwork_imageId}"
            storage: "cloud"
            filename_download: "${artwork_imageId}"
          }
          launchpad_type: {
            launchInfo: {
              startDate: "${defaultField.launchpad_type.launchInfo.startDate}"
              startTime: "${defaultField.launchpad_type.launchInfo.startTime}"
              endDate: "${defaultField.launchpad_type.launchInfo.endDate}"
              endTime: "${defaultField.launchpad_type.launchInfo.endTime}"
              publicDate: "${defaultField.launchpad_type.launchInfo.publicDate}"
              publicTime: "${defaultField.launchpad_type.launchInfo.publicTime}"
              mintPrice: "${defaultField.launchpad_type.launchInfo.mintPrice}",
              mint_limit: ${defaultField.launchpad_type.launchInfo.mint_limit},
              minPrice:${defaultField.launchpad_type.launchInfo.minPrice},
              maxSupply: ${division[0].max_supply}
            },
            type_gallery: {
              directus_files_id: {
                id: "${artwork_imageId}"
                storage: "cloud"
                filename_download: "${artwork_imageId}"
              }
            }
            fan_collection: {
              status: "published"
              artist: { id: "${user[0].id}" }
              name: "${launchpadName}"
              description: "Vote for me and receive a free NFT as a memorabilia and your confirmation of your vote."
              icon: {
                id: "${artwork_imageId}"
                storage: "cloud"
                filename_download: "${artwork_imageId}"
              }
              banner: {
                id: "${artwork_imageId}"
                storage: "cloud"
                filename_download: "${artwork_imageId}"
              }
              leaderboard: {
                id: "${leaderboard[0].id}"
              }
              song: {
                id: "${songId}"
                storage: "cloud"
                filename_download: "${songId}"
              }
            },
            
          }
        }
      ) {
        id
      }
    }
    `);

    if (createVoteLaunchpad) {
      // add user to leaderboard
      const { create_leaderboards_directus_users_item: addUserToLeaderboard } =
        await apiRequest(`
        mutation {
          create_leaderboards_directus_users_item(
            data: {
              leaderboards_id: {
                id: "${leaderboard[0].id}"
              },
              directus_users_id: {
                id: "${user[0].id}"
              }
            }
          ) {
            id
          }
        }
      `);

      if (image) {
        fs.unlinkSync(image.path);
        fs.unlinkSync(song.path);
      }

      if (addUserToLeaderboard) {
        try {
          /* ================== */
          /* Brevo */
          /* ================== */
          updateContact({
            email: user[0].sso_email,
            attributes: { DIVISIONID: teirList(divisionId) },
          });
        } catch (error) {
          console.log("Brevo Error: ", error);
        }

        /* ================== */
        /* Mixpanel Tracking */
        /* ================== */
        try {
          sendMixpanel({
            event: "Collection Created",
            data: {
              distinct_id: user[0].id,
              event_name: "Collection Created",
              type: "Vote",
              collection_name: launchpadName,
              genre_name: genreName(),
              division_name: division[0].name,
            },
          });
        } catch (error) {
          console.log("Mixpanel Error: ", error);
        }

        // Return
        ctx.status = 200;
        ctx.body = "Vote Collection Created";
        return;
      } else {
        ctx.status = 400;
        ctx.body = "Failed to add user to leaderboard";
        return;
      }
    }
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    //logtail
    logtail.error(`Failed to create Vote Collection: ${err.response}`);
    return;
  }
});

// ********************* //
// Create Support Launchpad
// ********************* //
router.post(`${BASE_URL}/createSupportCollection`, async (ctx) => {
  // formdata
  const { fields, files } = ctx.request.body;

  const { cookie } = fields;
  const { nft_image_1, nft_image_2, nft_image_3 } = files;
  // nft_image_1
  // nft_image_2
  // nft_image_3

  const userData = await authCheck({ cookie });

  // Validate request body
  const { error } = supportCollectionSchema.validate(fields);
  if (error) {
    ctx.status = 400;
    ctx.body = error.details[0].message;
    return;
  }

  if (!userData) {
    ctx.status = 401;
    ctx.body = "Unauthorized";
    return;
  }

  const defaultField = {
    status: "published",
    platform: "app.loop.fans",
    project_status: "upcoming",
    mint_status: "active",
    collection_type: "support",
    launchpad_type: {
      launchInfo: {
        mintPrice: "0",
        mint_limit: 99,
        minPrice:"0",
        // start date is 1 month from today without timestamp
        startDate: new Date("2024-06-15").toISOString(),
        startTime: "00:00:00",
        endDate: new Date("2030-06-15").toISOString(),
        endTime: "23:59:59",
        publicDate: new Date("2024-05-15").toISOString(),
        publicTime: "00:00:00",
      },
    },
  };

  try {
    // Handle Image Upload
    const handleImage = async (image, currentImageid) => {
      return await handleImageUpload(image, currentImageid);
    };

    // Upload image
    const nft_artwork = nft_image_1
      ? await handleImage(fs.createReadStream(nft_image_1.path), false)
      : null;

    // Resolve promises before constructing the query
    const artwork_imageId = nft_image_1 ? await nft_artwork : null;

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

    // Log data for debugging
    logtail.debug(`Creating Support Collection: ${user[0].id}`, {
      user: user[0].id,
      image: nft_image_1 ? nft_image_1.name : "No Image",
      image2: nft_image_2 ? nft_image_2.name : "No Image",
      image3: nft_image_3 ? nft_image_3.name : "No Image",
    });

    // check if user already created a support collection
    const { fans_launchpad: supportCollection } = await apiRequest(`
      query {
        fans_launchpad(
          filter: {
            artist: { id: { _eq: "${user[0].id}" } }
            collection_type: { _eq: "${defaultField.collection_type}" }
          }) {
          id
        }
      }
    `);

    if (supportCollection.length > 0) {
      // remove files
      if (nft_image_1) {
        fs.unlinkSync(nft_image_1.path);
      }
      if (nft_image_2) {
        fs.unlinkSync(nft_image_2.path);
      }
      if (nft_image_3) {
        fs.unlinkSync(nft_image_3.path);
      }
      ctx.status = 400;
      ctx.body =
        "You already have a support collection. You can only have one support collection.";
      return;
    }

    const { create_fans_launchpad_item: createSupportLaunchpad } =
      await apiRequest(`
        mutation {
          create_fans_launchpad_item(
            data: {
              status: "${defaultField.status}"
              platform: "${defaultField.platform}"
              project_status: "${defaultField.project_status}"
              mint_status: "${defaultField.mint_status}"
              artist: { id: "${user[0].id}" }
              project_name: "Good Vibes - ${user[0].username}"
              project_slug: "gv-${user[0].username
                .toLowerCase()
                .replace(/\s/g, "-")}"
              collection_type: "${defaultField.collection_type}"
              banner: {
                id: "${artwork_imageId}"
                storage: "cloud"
                filename_download: "${artwork_imageId}"
              }
            }
          ) {
            id
          }
        }
      `);

    if (createSupportLaunchpad) {
      const { id: launchpadId } = createSupportLaunchpad;
      async function processCollections() {
        const images = [
          { id: 1, file: nft_image_1 },
          { id: 2, file: nft_image_2 },
          { id: 3, file: nft_image_3 },
        ];

        for (const image of images) {
          // Create collection based on the number of images
          if (image.file) {
            // Upload image
            const image_artwork = image.file
              ? await handleImage(fs.createReadStream(image.file.path), false)
              : null;

            // Resolve promises before constructing the query
            const directusUploadId = image.file ? await image_artwork : null;
            await apiRequest(`
              mutation {
                create_fans_launchpad_type_item(data: {
                  fan_collection: {
                    status: "published"
                    artist: { id: "${user[0].id}" }
                    name: "${
                      user[0].display_name ?? user[0].username
                    }: Good Vibes #${image.id}"
                    description: "Support me and receive a free NFT as a memorabilia and your confirmation of your support."
                    icon: {
                      id: "${directusUploadId}"
                      storage: "cloud"
                      filename_download: "${directusUploadId}"
                    }
                    banner: {
                      id: "${directusUploadId}"
                      storage: "cloud"
                      filename_download: "${directusUploadId}"
                    }
                  },
                  collections_type: {
                    name: "${
                      image.id === 1 ? "$5" : image.id === 2 ? "$25" : "$100"
                    }"
                  }
                  launchpad_id: {
                    id: "${launchpadId}"
                    project_status: "upcoming"
                  }
                  type_gallery: {
                    directus_files_id: {
                      id: "${directusUploadId}"
                      storage: "cloud"
                      filename_download: "${directusUploadId}"
                    }
                  }
                  launchInfo: {
                    startDate: "${
                      defaultField.launchpad_type.launchInfo.startDate
                    }"
                    startTime: "${
                      defaultField.launchpad_type.launchInfo.startTime
                    }"
                    endDate: "${defaultField.launchpad_type.launchInfo.endDate}"
                    endTime: "${defaultField.launchpad_type.launchInfo.endTime}"
                    publicDate: "${
                      defaultField.launchpad_type.launchInfo.publicDate
                    }"
                    publicTime: "${
                      defaultField.launchpad_type.launchInfo.publicTime
                    }"
                    mintPrice: "${
                      image.id === 3
                        ? "100 USD"
                        : image.id === 2
                        ? "25 USD"
                        : "5 USD"
                    }",
                    mint_limit: ${
                      defaultField.launchpad_type.launchInfo.mint_limit
                    },
                    minPrice:${
                      defaultField.launchpad_type.launchInfo.minPrice
                    },
                    maxSupply: 2000
                  }
                }) {
                  id
                }
              }
            `);
          }

          // unlink file
          fs.unlinkSync(image.file ? image.file.path : null);
          console.log("Removed file: ", image.id);
        }
      }

      await processCollections();

      // change launchpad status to live
      const { update_fans_launchpad_item: updateLaunchpadStatus } =
        await apiRequest(`
        mutation {
          update_fans_launchpad_item(
            id: "${launchpadId}"
            data: {
              project_status: "upcoming"
            }
          ) {
            id
          }
        }
      `);

      if (updateLaunchpadStatus) {
        /* ================== */
        // Change vote collection status to published
        /* ================== */
        try {
          // fetch vote collection
          const { fans_launchpad: voteCollection } = await apiRequest(`
            query {
              fans_launchpad(
                filter: {
                  artist: { id: { _eq: "${user[0].id}" }},
                  collection_type: { _eq: "vote" }
                }
              ) {
                id
              }
            }
          `);

          // change vote collection status to published
          await apiRequest(`
            mutation {
              update_fans_launchpad_item(
                id: "${voteCollection[0].id}",
                data: {
                  status: "published"
                }
              ) {
                id
              }
            }
          `);
        } catch (error) {}

        /* ================== */
        // Update Creator Status
        /* ================== */
        try {
          await apiRequestSystem(`
          mutation {
            update_users_item(id: "${user[0].id}", data: {creator_status: true, role: "cd70c6cd-0266-4b9c-a42e-eaf0a482f417"}) {
              id
            }
          }
        `);
        } catch (error) {
          console.log("Update User Role Error: ");
        }

        /* ================== */
        /* Brevo */
        /* ================== */
        try {
          await updateContact({
            email: user[0].sso_email,
            listIds: [18],
            attributes: { ONBOARDCOMPLETE: 1 },
          });
        } catch (error) {
          console.log("Brevo Error: ", error);
        }

        /* ================== */
        /* Mixpanel Tracking */
        /* ================== */
        try {
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
        }

        // Return
        ctx.status = 200;
        ctx.body = "Support Launchpad Created";
        return;
      } else {
        ctx.status = 400;
        ctx.body = "Failed to update Launchpad Status";
        return;
      }
    } else {
      ctx.status = 400;
      ctx.body = "Failed to create Support Launchpad";
      return;
    }
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    //logtail
    logtail.error(`Failed to create Support Collection: ${err.response}`);
    return;
  }
});

export default router;
