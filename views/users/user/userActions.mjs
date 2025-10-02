import Router from "koa-router";
import axios from "axios";
import fs from "fs";
import {
  backendApiKey,
  backendUrl,
  fanRoleId,
  logtail,
} from "../../../helpers/constants.mjs";
import authCheck from "../../../helpers/auth.mjs";
import { apiRequestSystem, apiRequest } from "../../../helpers/apicall.mjs";
import { handleImageUpload } from "../../../helpers/uploadImage.mjs";
import { profileUpdateSchema } from "../../../schema/validationSchema.mjs";
import { useMixpanel } from "../../../helpers/mixpanel.mjs";
import { createContact, removeBrevoList, updateContact } from "../../../helpers/brevoSdk.mjs";
const { sendMixpanel } = useMixpanel();

const router = new Router();
const BASE_URL = `/v1/user/action`;

// ********************* //
// Handle post creation
// ********************* //
router.post(`${BASE_URL}/post`, async (ctx) => {
  try {
    // formdata
    const { fields, files } = ctx.request.body;
    const {
      cookie,
      user_id,
      profile_id,
      post_content,
      post_visibility,
      post_FileType,
      wall_user,
    } = fields;
    const userAuth = await authCheck({ cookie });
    if (userAuth.profileId === profile_id) {
      const image = files.image ? fs.createReadStream(files.image.path) : null;
      const song = files.song ? fs.createReadStream(files.song.path) : null;

      // Handle File Upload
      const handleFileUpload = async (file, currentImageid) => {
        return await handleImageUpload(file, currentImageid);
      };

      let postData = "";
      const data = wall_user
        ? {
            user_created: {
              id: user_id,
            },
            content: post_content,
            type: post_FileType,
            visibility: post_visibility,
            wall_user: {
              id: wall_user,
            },
          }
        : {
            user_created: {
              id: user_id,
            },
            content: post_content,
            type: post_FileType,
            visibility: post_visibility,
          };

      // check if image exists
      if (!image && !song) {
        // create post
        const response = await axios({
          url: `${backendUrl}/items/fans_posts`,
          method: "post",
          headers: { Authorization: `Bearer ${backendApiKey}` },
          data: data,
        });

        postData = response.data;

        ctx.status = 200;
        ctx.body = postData;
      } else {
        // Upload image || song
        const handleFile = async (file) =>
          file
            ? await handleFileUpload(fs.createReadStream(file.path), false)
            : null;

        const [imageId, songId] = await Promise.all([
          handleFile(files.image),
          handleFile(files.song),
        ]);

        // create post
        const response = await axios({
          url: `${backendUrl}/items/fans_posts`,
          method: "post",
          headers: { Authorization: `Bearer ${backendApiKey}` },
          data: {
            ...data,
            media: imageId ? { id: imageId } : null,
            song: songId ? { id: songId } : null,
          },
        });

        // Delete temp files
        if (files.image) fs.unlinkSync(files.image.path);
        if (files.song) fs.unlinkSync(files.song.path);
        console.log("Files Deleted");

        postData = response.data;

        ctx.status = 200;
        ctx.body = postData;
      }

      /* ================== */
      /* Mixpanel Tracking */
      /* ================== */
      try {
        sendMixpanel({
          event: wall_user ? "Created a community post" : "Created a post",
          data: {
            distinct_id: user_id,
            event_name: "Created a post",
            post_id: postData.id,
            post_type: post_FileType,
          },
        });
      } catch (error) {
        console.log("Mixpanel Error: ", error);
      }

      // Return Post
      return;
    }

    ctx.status = 400;
    ctx.body = "Invalid User";
    return;
  } catch (err) {
    //console.log({ err });
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Get isFollowing
// ********************* //
router.post(`${BASE_URL}/isFollowing`, async (ctx) => {
  try {
    const { cookie, userInfo, id } = ctx.request.body;
    const userAuth = await authCheck({ cookie });
    if (userAuth) {
      if (userAuth.profileId === userInfo.profile_id) {
        const response = await axios({
          url: `${backendUrl}/graphql`,
          method: "post",
          headers: { Authorization: `Bearer ${backendApiKey}` },
          data: {
            query: `
              query {
                fans_followers(
                  filter: {
                    user_id: {
                      id: {
                        _eq: "${userInfo.id}"
                      }
                    },
                    follower_id: {
                      id: {
                        _eq: "${id}"
                      }
                    }
                  }
                ) {
                  follower_id {
                    id
                  }
                }
              }
            `,
          },
        });

        ctx.status = 200;
        ctx.body = response.data.data.fans_followers;
        return;
      }
    }
  } catch (err) {
    ctx.status = 400;
    ctx.body = err.message;
    return;
  }
});

// ********************* //
// Follow/UnFollow Action
// ********************* //
router.post(`${BASE_URL}/follow`, async (ctx) => {
  try {
    const { cookie, userInfo, follower_id } = ctx.request.body;
    const userAuth = await authCheck({ cookie });
    let actionType = "";

    if (userAuth.profileId === userInfo.profile_id) {
      const isfollowing = await axios({
        url: `${backendUrl}/graphql`,
        method: "post",
        headers: { Authorization: `Bearer ${backendApiKey}` },
        data: {
          query: `
            query {
              fans_followers(
                filter: {
                  user_id: { id: { _eq: "${userInfo.id}" } }
                  follower_id: { id: { _eq: "${follower_id}" } }
                }
              ) {
                id
                follower_id {
                  id
                }
              }
            }
            `,
        },
      });

      if (isfollowing.data.data.fans_followers.length === 0) {
        //Save Follow
        const saveFollow = await axios({
          url: `${backendUrl}/items/fans_followers`,
          method: "post",
          headers: { Authorization: `Bearer ${backendApiKey}` },
          data: {
            user_id: userInfo.id,
            follower_id: follower_id,
          },
        });

        actionType = "follow";
        ctx.status = saveFollow.status;
        ctx.body = saveFollow.data;
      } else {
        //Deleta Follow
        const deleteFollow = await axios({
          url: `${backendUrl}/items/fans_followers/${isfollowing.data.data.fans_followers[0].id}`,
          method: "delete",
          headers: { Authorization: `Bearer ${backendApiKey}` },
          data: {
            id: isfollowing.data.data.fans_followers[0].id,
          },
        });

        actionType = "unfollow";
        ctx.status = deleteFollow.status;
        ctx.body = deleteFollow.data;
      }

      /* ================== */
      /* Mixpanel Tracking */
      /* ================== */
      try {
        sendMixpanel({
          event:
            actionType === "follow" ? "Followed a user" : "Unfollowed a user",
          data: {
            distinct_id: userInfo.id,
            event_name:
              actionType === "follow" ? "Followed a user" : "Unfollowed a user",
            follower_id: follower_id,
          },
        });
      } catch (error) {
        console.log("Mixpanel Error: ", error);
      }

      // Return
      return;
    }

    // invalid user
    ctx.status = 400;
    ctx.body = "Invalid User";
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Update Profile by Field
// ********************* //
router.post(`${BASE_URL}/update_field/:id`, async (ctx) => {
  const { id } = ctx.params;
  const { cookie, about } = ctx.request.body;
  console.log({ id, about, cookie });
  try {
    // Auth Check
    const userAuth = await authCheck({ cookie });
    const updatedableFields = ["about", "music"];

    if (!userAuth || !updatedableFields.includes(id)) {
      ctx.status = 400;
      ctx.body = "Invalid";
      return;
    } else {
      // fetch userID
      const userInfo = await apiRequestSystem(
        `query {
          users(filter: { profile_id: { _eq: "${userAuth.profileId}" } }) {
            id
          }
        }`
      );
      // Update User Field
      const updateField = await apiRequestSystem(`mutation {
        update_users_item(
          id: "${userInfo.users[0].id}",
          data: {
            about: "${about}"
          }) {
            id
          }
        }`);

      ctx.status = 200;
      ctx.body = updateField;
      return;
    }
  } catch (err) {
    ctx.status = 400;
    ctx.body = "Error Updating Profile";
    logtail.error(err);
    return;
  }
});

// ********************* //
// Update Profile
// ********************* //
router.post(`${BASE_URL}/update_profile`, async (ctx) => {
  try {
    // formdata
    const { fields, files } = ctx.request.body;

    // Validate request body
    const { error } = profileUpdateSchema.validate(fields);
    if (error) {
      ctx.status = 400;
      ctx.body = error.details[0].message;
      return;
    }

    // Updateable Fields
    const {
      cookie,
      user_id,
      profile_id,
      profile_displayName,
      profile_description,
      profile_about,
      profile_username,
      profile_show_featured_song,
      profile_location,
      profile_onboard,
      profile_type
    } = fields;

    const profile_socials = fields?.profile_socials
      ? JSON.parse(fields?.profile_socials)
      : [];
    const social_query = profile_socials?.map((social) => {
      return `${social.name}: "${social.value}"`;
    });

    // Images
    const { profile_avatar, profile_background, profile_featured_song } = files;

    // Make sure username is not empty and is a valid username ( not an email )
    if (profile_username && !/^[a-zA-Z0-9_]*$/.test(profile_username)) {
      ctx.status = 400;
      ctx.body = "Invalid Username";
      return;
    }

    // Auth Check
    const userAuth = await authCheck({ cookie });

    if (!userAuth || userAuth.profileId !== profile_id) {
      ctx.status = 400;
      ctx.body = "Invalid User";
      return;
    } else {
      // Get User Info
      const userInfo = await apiRequestSystem(
        `query {
            users_by_id(id: "${user_id}") {
              id,
              first_name,
              sso_email,
              display_name,
              description,
              location,
              about,
              avatar {
                id
              },
              background {
                id
              },
              username
              featured_song {
                id
              }
              show_featured_song
              onboard
              role
            }
          }`
      );

      // User Info
      const {
        first_name,
        sso_email,
        display_name,
        description,
        about,
        avatar,
        background,
        username,
        id: userId,
        featured_song,
        show_featured_song,
        location,
        onboard,
        role
      } = userInfo.users_by_id;

      // ROLES
      const roles = {
        "artist":"cd70c6cd-0266-4b9c-a42e-eaf0a482f417",
        "fan":"21052289-c845-44bf-8be0-2bc9ea7cbc1f",
      }

      // Handle Image Upload
      const handleImage = async (image, currentImageid) => {
        try {
          return await handleImageUpload(image, currentImageid);
        } catch (error) {
          console.log({
            error: error.message,
            query: "handleImageUpload",
          });
          return null;
        }
      };

      // wait for each image to upload
      const [NewAvatarId, NewBackgroundId, newFeaturedSongId] =
        await Promise.all([
          profile_avatar
            ? handleImage(fs.createReadStream(profile_avatar.path), avatar?.id)
            : avatar?.id, // if no image, use the current image id
          profile_background
            ? handleImage(
                fs.createReadStream(profile_background.path),
                background?.id
              )
            : background?.id, // if no image, use the current image id
          profile_featured_song
            ? handleImage(
                fs.createReadStream(profile_featured_song.path),
                featured_song?.id
              )
            : featured_song?.id, // if no image, use the current song id
        ]);

      

      // Update User Query
      const query = `mutation {
        update_users_item(
          id: "${user_id}",
          data: {
            ${NewAvatarId ? `avatar: { id: "${NewAvatarId}" },` : ""}
            ${
              NewBackgroundId ? `background: { id: "${NewBackgroundId}" },` : ""
            }
            ${
              newFeaturedSongId
                ? `featured_song: { id: "${newFeaturedSongId}" },`
                : ""
            }
            ${
              profile_displayName || display_name || first_name
                ? `display_name: "${
                    profile_displayName ?? display_name ?? first_name
                  }",`
                : ""
            }
            ${
              profile_description || description
                ? `description: "${profile_description ?? description}",`
                : ""
            }
            ${
              profile_about || about
                ? `about: "${profile_about ?? about}",`
                : ""
            }
            ${
              profile_username || username
                ? `username: "${profile_username || username}",`
                : ""
            }
            ${social_query ? social_query.join(",") : ""}
            ${
              profile_show_featured_song
                ? `show_featured_song: ${profile_show_featured_song},`
                : ""
            }
            ${
              profile_location
                ? `location: "${profile_location}",`
                : `location: "",`
            }
            ${
              profile_onboard
                ? `onboard: ${profile_onboard},`
                : `onboard: ${onboard},`
            }
            ${
              profile_type
                ? `role: "${roles[profile_type] ?? role}",`
                : `role: "${role}",`
            }
          }) {
            id
          }
        }`;

      // Update User
      const response = await apiRequestSystem(query);

      // Delete temp files
      if (profile_avatar) {
        fs.unlinkSync(profile_avatar.path);
      }

      if (profile_background) {
        fs.unlinkSync(profile_background.path);
      }

      if (profile_featured_song) {
        fs.unlinkSync(profile_featured_song.path);
      }

      /* ================== */
      /* Mixpanel Tracking */
      /* ================== */
      try {
        sendMixpanel({
          event: "Profile Updated",
          data: {
            distinct_id: userId,
            event_name: "Profile Updated",
          },
        });
      } catch (error) {
        console.log("Mixpanel Error: ", error);
      }

      /* ================== */
      // Brevo Contact - Update
      /* ================== */
      try {
        await removeBrevoList({
          email: [sso_email],
          listId: roles[profile_type] === roles["artist"] ? "" : 45,
        });

        // create or update a user in Brevo
        await updateContact({
          email: sso_email,
          listIds: roles[profile_type] === roles["artist"] ? [45] : [],
        });
      } catch (error) {
        console.log("Brevo Error: ", error);
      }

      ctx.status = 200;
      ctx.body = response;
      return;
    }
  } catch (err) {
    ctx.status = 400;
    ctx.body = "Error Updating Profile";
    console.log(err);
    //logtail.error(err);
    return;
  }
});

// ********************* //
// Update Genres
// ********************* //
router.post(`${BASE_URL}/update_genres`, async (ctx) => {
  try {
    const { cookie, genresIds, profile_id } = ctx.request.body;
    const userAuth = await authCheck({ cookie });
    if (!userAuth || !profile_id || userAuth.profileId !== profile_id) {
      ctx.status = 400;
      ctx.body = "Invalid User";
      return;
    }

    // Get User ID
    const userInfo = await apiRequestSystem(
      `query {
        users(filter: { profile_id: { _eq: "${profile_id}" } }) {
          id
        }
      }`
    );

    // delete current user genres
    const currentGenres = await apiRequest(`
      query {
        junction_directus_users_genres(
          filter: {
            directus_users_id: {
              id: {
                _eq: "${userInfo.users[0].id}"
              }
            }
          }
        ) {
          id
          genres_id {
            id
          }
        }
      }
      `);

    currentGenres.junction_directus_users_genres.map(async (genre) => {
      await apiRequest(`
        mutation {
          delete_junction_directus_users_genres_item(
            id: ${genre.id}
          ) {
            id
          }
        }
      `);
    });

    // add current user to genres
    genresIds.map(async (genre, index) => {
      const response = await apiRequest(`
        mutation {
          create_junction_directus_users_genres_item(
            data: {
              directus_users_id: {
                id: "${userInfo.users[0].id}"
              },
              genres_id: {
                id: "${genre}"
              }
            }
          ) {
            id
          }
        }
      `);
      return response;
    });

    // Return Profile
    ctx.status = 200;
    ctx.body = "ok";
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Add Fav
// ********************* //
router.post(`${BASE_URL}/add_fav`, async (ctx) => {
  const { address, platform, type, id } = ctx.request.body;
  const create_fields = `{
    wallet_address: "${address}",
    platform: "${platform}",
    ${
      type === "collection" ? `fav_type: "collection"` : `fav_type: "launchpad"`
    },
    ${
      type === "fans_launchpad"
        ? `fans_launchpad: ${id}`
        : `fans_launchpad: null`
    },
    ${
      type === "cosmos_launchpad"
        ? `cosmos_launchpad: ${id}`
        : `cosmos_launchpad: null`
    },
    ${type === "collection" ? `collection: ${id}` : `collection: null`},
  }`;

  const fav_fields = `{
    wallet_address: { _eq: "${address}" },
    platform: { _eq: "${platform}" },
    ${
      type === "collection"
        ? `fav_type: { _eq: "collection" }`
        : `fav_type: { _eq: "launchpad" }`
    },
    ${
      type === "fans_launchpad"
        ? `fans_launchpad: { id: { _eq: ${id} } }`
        : `fans_launchpad: { id: { _null: true } }`
    },
    ${
      type === "cosmos_launchpad"
        ? `cosmos_launchpad: { id: { _eq: ${id} } }`
        : `cosmos_launchpad: { id: { _null: true } }`
    },
    ${
      type === "collection"
        ? `collection: { id: { _eq: ${id} } }`
        : `collection: { id: { _null: true } }`
    },
  }`;

  try {
    const isFav = await axios({
      url: `${backendUrl}/graphql`,
      method: "post",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: {
        query: `
        query {
          favorites(
            filter: ${fav_fields}
          ) {
            id
          }
        }
        `,
      },
    });

    if (isFav.data.data.favorites.length === 0) {
      const response = await axios({
        url: `${backendUrl}/graphql`,
        method: "post",
        headers: { Authorization: `Bearer ${backendApiKey}` },
        data: {
          query: `
          mutation {
            create_favorites_item(data: ${create_fields} ) {
              id
            }
          }     
        `,
        },
      });

      //console.log(response.data.data.create_favorites_item);

      ctx.status = 200;
      ctx.body = response.data.data.create_favorites_item;
      return;
    } else {
      await axios({
        url: `${backendUrl}/graphql`,
        method: "post",
        headers: { Authorization: `Bearer ${backendApiKey}` },
        data: {
          query: `
          mutation {
            delete_favorites_item(id: ${isFav.data.data.favorites[0].id} ) {
              id
            }
          }     
        `,
        },
      });

      ctx.status = 200;
      return;
    }
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

/* ********************* */
/* Get Account Balance */
/* ********************* */
router.post(`${BASE_URL}/account/balance`, async (ctx) => {
  const { cookie } = ctx.request.body;
  try {
    const userAuth = await authCheck({ cookie });
    if (!userAuth) {
      ctx.status;
      ctx.body = "Invalid User";
      return;
    }

    const { artist_balances } = await apiRequest(`
      query {
        artist_balances(
          filter: { artist: { profile_id: { _eq: "${userAuth.profileId}" } } }
        ) {
          balance
        }
      }
    `);

    const platformFee = artist_balances[0]?.balance * (12 / 100) || 0;
    const total = (artist_balances[0]?.balance - platformFee).toFixed(2) || 0;

    const balance = {
      balance: total,
    };

    ctx.status = 200;
    ctx.body = balance;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

/* ********************* */
/* Payout History */
/* ********************* */
router.post(`${BASE_URL}/payout/history`, async (ctx) => {
  const { cookie } = ctx.request.body;
  try {
    const userAuth = await authCheck({ cookie });
    if (!userAuth) {
      ctx.status;
      ctx.body = "Invalid User";
      return;
    }

    const { payout_requests } = await apiRequest(`
      query {
        payout_requests(
          filter: { artist: { profile_id: { _eq: "${userAuth.profileId}" } } }
        ) {
          payout_id
          status
          date_requested
          platform
          payout_email
          amount
        }
      }
    `);

    // sort date_requested
    payout_requests.sort((a, b) => new Date(b.date_requested) - new Date(a.date_requested));

    ctx.status = 200;
    ctx.body = payout_requests;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

/* ********************* */
/* Request Payout */
/* ********************* */
router.post(`${BASE_URL}/payout/request`, async (ctx) => {
  const { cookie, amount, platform, payout_email, full_name, whatsapp } = ctx.request.body;
  try {
    // Check Fields
    if (!amount || !platform || !payout_email || !full_name || !whatsapp) {
      ctx.status = 400;
      ctx.body = "Invalid Fields";
      return;
    }

    const userAuth = await authCheck({ cookie });
    if (!userAuth) {
      ctx.status;
      ctx.body = "Invalid User";
      return;
    }

    // get user
    const { users } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userAuth.profileId}" } }) {
          id
        }
      }
    `);

    const { artist_balances } = await apiRequest(`
      query {
        artist_balances(
          filter: { artist: { id: { _eq: "${users[0].id}" } } }
        ) {
          balance_id
          balance
        }
      }
    `);

    if (artist_balances[0].balance < amount) {
      ctx.status = 400;
      ctx.body = "Insufficient Funds";
      return;
    }

    // Deduct balance
    const { update_artist_balances_item: deductBalance } = await apiRequest(`
      mutation {
        update_artist_balances_item(
          id: ${artist_balances[0].balance_id},
          data: {
            balance: ${artist_balances[0].balance - amount}
          }
        ) {
          balance
        }
      }
    `);

    // check if balance was deducted
    if (!deductBalance) {
      ctx.status = 400;
      ctx.body = "Sorry, we could not process your request at the moment.";
      return;
    }

    // check if balance is less than 0 after deduction
    if (deductBalance.balance < 0) {
      ctx.status = 400;
      ctx.body = "Insufficient Funds";
      return;
    }

    // check if there is a pending payout
    const { payout_requests } = await apiRequest(`
      query {
        payout_requests(
          filter: { artist: { profile_id: { _eq: "${userAuth.profileId}" } }, status: { _eq: "pending" } }
        ) {
          payout_id
        }
      }
    `);

    if (payout_requests.length > 0) {
      ctx.status = 400;
      ctx.body = "You already have a pending payout request";
      return;
    }

    const response = await apiRequest(`
      mutation {
        create_payout_requests_item(
          data: {
            artist: { id: "${users[0].id}" }
            amount: ${amount}
            platform: "${platform}"
            payout_email: "${payout_email}"
            full_name: "${full_name}"
            whatsapp: "${whatsapp}"
          }
        ) {
          payout_id
        }
      }
    `);

    ctx.status = 200;
    ctx.body = response;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Check User Account
// ********************* //
router.post(`${BASE_URL}/checkAccount`, async (ctx) => {
  try {
    const { email } = ctx.request.body;
    console.log({ email: email.toLowerCase() });

    // check if email is valid
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.toLowerCase())) {
      ctx.status = 400;
      ctx.body = "Invalid Email";
      return;
    }

    const { users } = await apiRequestSystem(
      `query {
        users(filter: { sso_email: { _eq: "${email.toLowerCase()}" } }) {
          id
        }
      }`
    );

    // Check if account exists
    if (users.length > 0) {
      ctx.status = 200;
      ctx.body = {
        id: users[0].id,
        account: "exists",
      };
      return;
    } else {
      // Create Temp Account
      const { create_users_item } = await apiRequestSystem(
        `mutation {
          create_users_item(data: { sso_email: "${email.toLowerCase()}" }) {
            id
          }
        }`
      );

      /* ================== */
      // Brevo Contact
      /* ================== */
      await updateContact({
        email: email.toLowerCase(),
        listIds: [47],
      });
      

      ctx.status = 200;
      ctx.body = {
        id: create_users_item.id,
        account: "created",
      };
      return;
    }
  } catch (err) {
    ctx.status = 400;
    ctx.body = err.message;
    return;
  }
});

export default router;
