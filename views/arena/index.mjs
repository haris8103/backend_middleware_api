import Router from "koa-router";
import axios from "axios";
import Joi from "joi";
import cache from "../../helpers/cache.mjs";
import authCheck from "../../helpers/auth.mjs";
import {
  backendApiKey,
  backendUrl,
  logtail,
} from "../../helpers/constants.mjs";
import {
  fetchLikedData,
  fetchCollectionAddresses,
  fetchUserNFTs,
} from "./calls.mjs";
import { feedSchema, commentsSchema } from "../../schema/validationSchema.mjs";
import { sendLog } from "../../helpers/log.mjs";
import { apiRequest } from "../../helpers/apicall.mjs";
import { apiRequestSystem } from "../../helpers/apicall.mjs";
import { updateContact } from "../../helpers/brevoSdk.mjs";
import { useMixpanel } from "../../helpers/mixpanel.mjs";
import { fetchTotalItems, getFollowerIds } from "../../hooks/userHooks.mjs";
const { sendMixpanel } = useMixpanel();

const router = new Router();
const BASE_URL = `/v1/arena`;
const limit = 10;

// ********************* //
// Send Event Analytics
// ********************* //
router.post(`${BASE_URL}/event`, async (ctx) => {
  const { cookie, event, eventId } = ctx.request.body;
  try {
    const user = cookie && await authCheck({ cookie });
    const profile_id = cookie && user.profileId;

    // Send Anonymous Page Analytics
    if (!profile_id) {
      // Send Event Analytics
      sendMixpanel({
        event: event,
        data: {
          distinct_id: "Anonymous",
          event_name: event,
          event_id: eventId,
        },
      });

      ctx.status = 200;
      return;
    }

    // Fetch User ID
    const { users: userData } = await apiRequestSystem(`
    query {
      users(filter: { profile_id: { _eq: "${profile_id}" } }) {
        id
      }
    }
  `);

    // Send Event Analytics
    sendMixpanel({
      event: event,
      data: {
        distinct_id: userData[0].id,
        event_name: event,
        event_id: eventId,
      },
    });

    ctx.status = 200;
    return;
  } catch (error) {
    ctx.status = 400;
    return;
  }
});


// ********************* //
// Send Page Analytics
// ********************* //
router.post(`${BASE_URL}/pageView`, async (ctx) => {
  const { cookie, path } = ctx.request.body;
  try {
    const user = cookie && await authCheck({ cookie });
    const profile_id = cookie && user.profileId;

    // Send Anonymous Page Analytics
    if (!profile_id && path.includes("artist-signup")) {
      // Send Page Analytics
      sendMixpanel({
        event: `Page View: Artist Signup`,
        data: {
          distinct_id: "Anonymous",
          event_name: "Page View",
          path: path,
        },
      });

      ctx.status = 200;
      return;
    } else if (!profile_id) {
      ctx.status = 400;
      return;
    }

    // Fetch User ID
    const { users: userData } = await apiRequestSystem(`
    query {
      users(filter: { profile_id: { _eq: "${profile_id}" } }) {
        id
      }
    }
  `);

    // Send Page Analytics
    sendMixpanel({
      event: `Page View: ${
        path.includes("/user/")
          ? "User Profile"
          : path.includes("/collection/")
          ? "Collection"
          : path.includes("/nftDetail/")
          ? "NFT Detail"
          : path.includes("/launchpad/")
          ? "Launchpad"
          : path.includes("/loops/")
          ? "Loops"
          : path.includes("/wma/list")
          ? "Web3 Music Awards"
          : path.includes("/artist-signup/")
          ? "Artist Signup"
          : path.includes("/collaboration/")
          ? "Collaboration"
          : path.includes("/inbox/")
          ? "Inbox"
          : path.includes("/music-library/")
          ? "Music Library"
          : path
      }`,
      data: {
        distinct_id: userData[0].id,
        event_name: "Page View",
        path: path,
      },
    });

    ctx.status = 200;
    return;
  } catch (error) {
    ctx.status = 400;
    return;
  }
});

// ********************* //
// Fetch Feed
// ********************* //
router.post(`${BASE_URL}/feed`, async (ctx) => {
  // Validate request body
  const { error } = feedSchema.validate(ctx.request.body);
  if (error) {
    ctx.status = 400;
    ctx.body = error.details[0].message;
    return;
  }

  // Get Body Data
  const { page, userInfo, forYou } = ctx.request.body;

  // Create feed array
  const feed = [];

  try {
    // fetch followers
    const followerIds = await getFollowerIds({ user_id: userInfo.id });
    followerIds.unshift(userInfo.id); // Add user id to the top of the list

    // Total Items
    const totalItems = await fetchTotalItems({ user_id: userInfo.id, followerIds: followerIds });

    // Fetch public and private content
    const fetchData = async () => {
      const query = `
        query {
          fans_posts(
            filter: {
              ${
                forYou
                  ? `user_created: { id: { _nin: "${followerIds}" } }, wall_user: { id: { _null: true } }`
                  : `user_created: { id: { _in: "${followerIds}" } }`
              }
            },
            sort: ["-date_created"],
            page: ${page},
            limit: ${limit}
          ) {
            id
            type
            visibility
            media { id }
            song { id }
            content
            comments_count: comments_func {
							count
						}
            likes_count: likes_func {
							count
						}
            user_created {
              id
              first_name
              username
              avatar { id }
              display_name
              role
            }
            wall_user {
              id
              first_name
              username
              avatar { id }
              display_name
              role
            }
            date_created
          }
        }
      `;
      return apiRequest(query);
    };

    // Fetch Feed Data
    const [content] = await Promise.all([
      fetchData(),
      //userInfo ? fetchCollectionAddresses() : {},
      /* userInfo ? fetchUserNFTs({ address: userInfo.wallet_address }) : {}, */
    ]);

    // Merge public and private content
    const combinedContent = [...content.fans_posts];

    // Fetch liked data
    const [likedData] = await Promise.all([
      userInfo
        ? fetchLikedData({
            userId: userInfo.id,
            postIds: combinedContent.map((item) => item.id),
          })
        : {},
    ]);

    /* const collectionAddressLookup = [];
    collectionAddresses.length > 0 &&
      collectionAddresses?.forEach(({ artist: { id }, address }) => {
        collectionAddressLookup.push({ address });
      }); */

    /* const userNftsLookup = {};
    userNfts.length > 0 &&
      userNfts.forEach((item) => {
        userNftsLookup[item.collection.address] = true;
      }); */

    // Check if user has access to a gated content
    /* const userCanView = (item) => {
      if (item.visibility === "Private") {
        return !!collectionAddressLookup.some(
          ({ address }) => userNftsLookup[address]
        );
      }
      return true;
    }; */

    // Loop through combined content and add to feed
    combinedContent.map((item) => {
      feed.push({
        id: item.id,
        type: item.type,
        date_created: item.date_created,
        comments: parseInt(item.comments_count.count),
        likes: parseInt(item.likes_count.count),
        liked: likedData?.some((like) => like.post_id.id == item.id),
        image: { id: item.media?.id },
        song: { id: item.song?.id },
        content: item.content ? item.content : "",
        artist: {
          id: item.user_created.id,
          first_name: item.user_created.first_name,
          username: item.user_created.username,
          avatar: item.user_created.avatar?.id,
          display_name: item.user_created.display_name,
          role: item.user_created.role,
        },
        wall_user: item.wall_user?.id
          ? {
              id: item.wall_user?.id,
              first_name: item.wall_user?.first_name,
              username: item.wall_user?.username,
              avatar: item.wall_user?.avatar?.id,
              display_name: item.wall_user?.display_name,
              role: item.wall_user?.role,
            }
          : null,
        visibility: item.visibility,
        access: /* userCanView(item) */ true,
      });
    });

    // Convert dates to timestamps once before sorting
    feed.forEach(
      (item) => (item.timestamp = new Date(item.date_created).getTime())
    );

    // Sort using timestamp to speed up sorting
    feed.sort((a, b) => b.timestamp - a.timestamp);

    // Filter count
    const filter_count = totalItems.fans_posts_aggregated[0].count.id;

    const response = {
      feed,
      meta: { filter_count, limit },
    };

    ctx.status = 200;
    ctx.body = response;
    return;
  } catch (err) {
    // Log message
    //sendLog("error", "Error fetching feed");

    ctx.status = 400;
    ctx.body = "Error fetching feed";
    return;
  }
});

// ********************* //
// Get FeedByDate
// ********************* //
router.post(`${BASE_URL}/fetchByDate`, async (ctx) => {
  const { ids, page, lastDate, userInfo } = ctx.request.body;
  const feed = [];
  try {
    const results = await axios({
      url: `${backendUrl}/items/fans_posts?fields=id,title,type,media,content,count(comments),count(likes),user_created.first_name,user_created.avatar,user_created.id,date_created&filter={ "user_created": { "_in": "${ids}" }, "date_created": { "_gt": "${lastDate}"}}&sort[]=-date_created&meta=filter_count,total_count`,
      method: "GET",
    });

    const promises = results.data.data.map(async (item) => {
      feed.push({
        id: item.id,
        type: item.type,
        date_created: item.date_created,
        comments: parseInt(item.comments_count),
        likes: parseInt(item.likes_count),
        liked: await isLiked({ userId: userInfo.id, postId: item.id }),
        image: { id: item.media },
        content: item.content,
        artist: { ...item.user_created },
      });
    });
    // Wait for all promises to resolve
    await Promise.all(promises);
    // Sort feed
    feed.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));

    ctx.status = 200;
    ctx.body = {
      feed: feed,
      meta: { filter_count: results.data.meta.filter_count, limit: limit },
    };
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Get Comments
// ********************* //
router.post(`${BASE_URL}/comments`, async (ctx) => {
  // Validate request body
  const { error } = commentsSchema.validate(ctx.request.body);
  if (error) {
    ctx.status = 400;
    ctx.body = error.details[0].message;
    return;
  }

  // Get Body Data
  const { post_id } = ctx.request.body;
  //const userAuth = await authCheck({ cookie });
  try {
    const comments = await axios({
      url: `${backendUrl}/graphql`,
      method: "post",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: {
        query: `
        query {
          fans_comments(
            filter: {
              post_id: { id: { _eq: "${post_id}" } }
            }
            sort: ["-date_created"]
          ) {
            id
            Text
            date_created
            user_id {
              id
              display_name
              first_name
              avatar { id}
              username
            }
          }
        }
      `,
      },
    });

    ctx.status = 200;
    ctx.body = comments.data.data.fans_comments;

    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Get Profile Feed
// ********************* //
router.post(`${BASE_URL}/profile/feed`, async (ctx) => {
  // Get Body Data
  const { id, page, userInfo, wall } = ctx.request.body;

  // Create feed array
  const feed = [];

  try {
    // Fetch public and private content
    const fetchData = async (visibility) => {
      const headers =
        visibility === "Private"
          ? { Authorization: `Bearer ${backendApiKey}` }
          : {};
      return axios.get(`${backendUrl}/items/fans_posts`, {
        params: {
          fields:
            "id,title,type,visibility,media,song,content,count(comments),count(likes),user_created.first_name,user_created.display_name,user_created.username,user_created.avatar,user_created.id,date_created,wall_user.first_name,wall_user.display_name,wall_user.username,wall_user.avatar,wall_user.id",
          filter: wall
            ? JSON.stringify({
                wall_user: { _in: id },
                visibility: { _eq: visibility },
              })
            : JSON.stringify({
                user_created: { _in: id },
                visibility: { _eq: visibility },
              }),
          sort: "-date_created",
          page: page,
          limit: limit,
          meta: "filter_count,total_count",
        },
        headers: headers,
      });
    };

    // Fetch Feed Data
    const [publicContent, privateContent, collectionAddresses, userNfts] =
      await Promise.all([
        fetchData("Public"),
        /* fetchData("Private"), */
        /* userInfo ? fetchCollectionAddresses() : {},
        userInfo ? fetchUserNFTs({ address: userInfo.wallet_address }) : {}, */
      ]);

    // Merge public and private content
    const combinedContent = [
      ...publicContent.data.data,
      /* ...privateContent.data.data, */
    ];

    // Fetch liked data
    const [likedData] = await Promise.all([
      userInfo
        ? fetchLikedData({
            userId: userInfo.id,
            postIds: combinedContent.map((item) => item.id),
          })
        : {},
    ]);

    // Create lookup objects
    /* const collectionAddressLookup = [];
    collectionAddresses.length > 0 &&
      collectionAddresses
        .filter((item) => item.artist.id == id)
        ?.forEach(({ artist: { id }, address }) => {
          collectionAddressLookup.push({ address });
        }); */

    /* const userNftsLookup = {};
    userNfts.length > 0 &&
      userNfts.forEach((item) => {
        userNftsLookup[item.collection.address] = true;
      }); */

    // Loop through combined content and add to feed
    combinedContent.map((item) => {
      // Check if user has access to gated content
      /* const userCanView = !!collectionAddressLookup.some(
        ({ address }) => userNftsLookup[address]
      );
 */
      feed.push({
        id: item.id,
        type: item.type,
        date_created: item.date_created,
        comments: parseInt(item.comments_count),
        likes: parseInt(item.likes_count),
        liked: userInfo
          ? likedData?.some((like) => like.post_id.id == item.id)
          : false,
        image: { id: item.media },
        song: { id: item.song },
        content: item.content ? item.content : "",
        artist: { ...item.user_created },
        wall_user: { ...item.wall_user },
        visibility: item.visibility,
        access: true,
      });
    });

    // Convert dates to timestamps once before sorting
    feed.forEach(
      (item) => (item.timestamp = new Date(item.date_created).getTime())
    );

    // Sort using timestamp to speed up sorting
    feed.sort((a, b) => b.timestamp - a.timestamp);

    // Filter count
    const filter_count =
      publicContent.data.meta.filter_count/*  +
      privateContent.data.meta.filter_count; */

    const response = {
      feed,
      meta: { filter_count, limit },
    };

    ctx.status = 200;
    ctx.body = response;
    return;
  } catch (err) {
    console.log(err.response.data);
    // Log message
    //sendLog("error", "Error fetching Profile feed");

    ctx.status = 400;
    ctx.body = "Error fetching feed";
    return;
  }
});

// ********************* //
// Get Profile
// ********************* //
router.get(`${BASE_URL}/profile/:id`, async (ctx) => {
  const { id } = ctx.params;

  // check if UUID
  const isUUID = id.match(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-5][0-9a-fA-F]{3}-[089abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
  );

  try {
    if (id) {
      let userObject = null;
      const getUserProfile = await axios({
        url: `${backendUrl}/graphql/system`,
        method: "post",
        headers: { Authorization: `Bearer ${backendApiKey}` },
        data: {
          query: `
            query { 
              users(filter: {
                ${isUUID ? "id" : "username"}: { _eq: "${id}"}
              }) {
                id
                status
                role
                username
                first_name
                display_name
                last_name
                description
                location
                about
                video_link
                avatar {id}
                background {id}
                socials
                stats
                followers
                likes
                verified
                access_courses
                creator_type
                wallet_address
                
                apple
                twitter
                instagram
                facebook
                tiktok
                youtube
                soundcloud
                spotify
                custom_link
                featured_song { id }
                show_featured_song
                featured
              }
            }
          `,
        },
      });

      // Set User Object
      userObject = getUserProfile.data.data.users;

      // Check if user is not found or is archived
      if (!userObject || userObject[0].status === "archived") {
        ctx.status = 404;
        ctx.body = "User not found";
        return;
      }

      const wallet_address = userObject[0].wallet_address;

      // Fetch Latest 3 NFTs
      const { fans_nfts: fansNftsPromise } = await apiRequest(`
          query {
            fans_nfts(
              filter: { owner: { _eq: "${wallet_address}" } },
              sort: ["-created_at"]
              page: 1
              limit: 3
            ) {
              id
              owner
              name
              image
            }
          }
        `);

      // Fetch Latest 3 NFTs
      const { genres: genresPromise } = await apiRequest(`
          query {
            genres(
              filter: { directus_users: { directus_users_id: { ${
                isUUID ? "id" : "username"
              }: { _eq: "${id}"} }}}
            ) {
              id
              name
            }
          }
        `);

      const [fans_nfts, genres, fans_following, fans_followers] =
        await Promise.all([fansNftsPromise, genresPromise]);

      // pull socials links from user profile and put them in an object
      const {
        twitter,
        instagram,
        facebook,
        tiktok,
        apple,
        youtube,
        soundcloud,
        spotify,
        custom_link,
      } = userObject[0];

      // create socials object
      const socials = {
        twitter,
        instagram,
        facebook,
        tiktok,
        apple,
        youtube,
        soundcloud,
        spotify,
        custom_link,
      };

      // remove socials from user profile
      delete userObject[0].twitter;
      delete userObject[0].instagram;
      delete userObject[0].facebook;
      delete userObject[0].tiktok;
      delete userObject[0].apple;
      delete userObject[0].youtube;
      delete userObject[0].soundcloud;
      delete userObject[0].spotify;
      delete userObject[0].custom_link;

      // add socials object to user profile
      userObject[0].socials = socials;

      // Return Profile
      ctx.status = 200;
      ctx.body = {
        ...userObject,
        fans_nfts,
        genres,
      };
      return;
    }

    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Get Genres
// ********************* //
router.get(`${BASE_URL}/genres`, async (ctx) => {
  try {
    // Fetch All Genres
    const { genres: genres } = await apiRequest(`
          query {
            genres {
              id
              name
            }
          }
        `);

    // push id 0 to the front of the array
    genres.unshift({ id: "0", name: "Select Genre" });

    // Return Profile
    ctx.status = 200;
    ctx.body = { genres };
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Get Divisions
// ********************* //
router.get(`${BASE_URL}/divisions`, async (ctx) => {
  try {
    // Fetch All Divisions
    const { divisions: divisions } = await apiRequest(`
          query {
            divisions {
              id
              name
              description
            }
          }
        `);

    // push id 0 to the front of the array
    divisions.unshift({ id: "0", name: "Select Division" });

    // Return Profile
    ctx.status = 200;
    ctx.body = { divisions };
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Check if user is in Leaderboards
// ********************* //
router.post(`${BASE_URL}/checkLeaderboard`, async (ctx) => {
  const { cookie, divisionId, genreId } = ctx.request.body;
  try {
    const user = await authCheck({ cookie });
    const profile_id = user.profileId;

    // fetch user_id
    const { users: userData } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${profile_id}" } }) {
          id
        }
      }
    `);

    // Fetch Leaderboards
    const { leaderboards_directus_users: leaderboards } = await apiRequest(`
    query {
      leaderboards_directus_users(
        filter: {
          directus_users_id: { id: { _eq: "${userData[0].id}" } }
          leaderboards_id: {
            division: {
              id: {
                _eq: ${divisionId}
              }
            }
            genre: {
              id: {
                _eq: ${genreId}
              }
            }
          }
        }
      ) {
        id
      }
    }
  `);

    if (leaderboards.length > 0) {
      ctx.status = 200;
      ctx.body = true;
      return;
    } else {
      ctx.status = 200;
      ctx.body = false;
      return;
    }
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

router.get(`${BASE_URL}/launchpads`, async (ctx) => {
  const cacheKey = `arena_launchpads`;
  const cachedResponse = cache.get(cacheKey);
  try {
    if (cachedResponse) {
      ctx.body = cachedResponse;
      ctx.status = 200;
      return; // Exit the middleware chain
    } else {
      const response = await axios({
        url: `${backendUrl}/graphql`,
        method: "post",
        data: {
          query: `
        query { 
          fans_launchpad(sort: ["sort" "-project_status", "-date_created"], filter: { status: { _eq: "published" }, project_status: { _neq: "completed" }}) {
            id
            project_name
            project_slug
            project_status
            status
            banner { id }
            launchpad_type {
              collection {
                description
              }
            }
          }
        }
          `,
        },
      });

      ctx.status = 200;
      ctx.body = response.data.data.fans_launchpad;
      //cache.set(cacheKey, response.data.data.fans_launchpad);
      return;
    }
  } catch (err) {
    //console.log(err, ctx);
  }
});

/* ===================== */
/* ======  Fetch latest onging launchpad for creator  ======== */
/* ===================== */
router.get(`${BASE_URL}/launchpad/latest/:user`, async (ctx) => {
  const { user } = ctx.params;
  try {
    const response = await axios({
      url: `${backendUrl}/graphql`,
      method: "post",
      data: {
        query: `
        query { 
          fans_launchpad(
            sort: ["sort" "-project_status", "-date_created"],
            filter: { 
              status: { _eq: "published" },
              project_status: { _neq: "completed" },
              artist: { id: { _eq: "${user}" } },
              launchpad_type: { launchInfo: { endDate: { _gt: "$NOW"} } }
            }) {
            project_name
            project_slug
          }
        }
          `,
      },
    });

    ctx.status = 200;
    ctx.body = response.data.data.fans_launchpad;
    return;
  } catch (err) {
    //console.log(err, ctx);
  }
});

router.post(`${BASE_URL}/events/:id`, async (ctx) => {
  const { id } = ctx.params;
  try {
    const fetchEvents = async () =>
      await axios({
        url: `${backendUrl}/graphql`,
        headers: { Authorization: `Bearer ${backendApiKey}` },
        method: "post",
        data: {
          query: `
        query {
          events(filter: { user: { id: { _eq: "${id}" } }, status: { _eq: "published" }}, sort: ["-date_created"]) {
            id
            event_name
            event_description
            event_location
            start_date
            image { id }
            collection {
              id
              fans_launchpad_type {
                id
                launchpad_id {
                  project_slug
                }
                launchInfo {
                  endDate
                  endTime
                  mintPrice
                   minPrice
                   is_free
                }
              }
            }
          }
        }
      `,
        },
      });

    // Fetch Feed Data
    const [creatorEvents] = await Promise.all([fetchEvents()]);

    const eventsList = [];

    // Loop through combined content and add to feed
    creatorEvents.data.data.events.map((item) => {
      eventsList.push({
        ...item,
      });
    });

    ctx.status = 200;
    ctx.body = eventsList;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Change User Role (Artist) | ID: cd70c6cd-0266-4b9c-a42e-eaf0a482f417
// ********************* //
router.post(`${BASE_URL}/changeUserRole`, async (ctx) => {
  // Get Body Data
  const { cookie, role } = ctx.request.body;
  const error = Joi.object({
    cookie: Joi.string().required(),
  }).validate({ cookie });

  if (error.error) {
    ctx.status;
    ctx.body = error.error.details[0].message;
    return;
  }

  try {
    // Get profile_id from cookie
    const user = await authCheck({ cookie });
    const profile_id = user.profileId;

    // Get user_id using profile_id
    const { users: userData } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${profile_id}" } }) {
          id
          sso_email
        }
      }
    `);

    // The user_id
    const user_id = userData[0].id;

    // user email
    const sso_email = userData[0].sso_email;

    // Perform a check to see if the user exists in the database and update the role
    const response = await apiRequestSystem(`
      mutation {
        update_users_item(id: "${user_id}", data: { role: "cd70c6cd-0266-4b9c-a42e-eaf0a482f417"}) {
          id
        }
      }
    `);

    // check if the user role was updated
    if (response) {
      try {
        // update contact in Brevo
        updateContact({
          email: sso_email,
          listIds: [16],
          attributes: { USERTYPE: 2, ONBOARDCOMPLETE: 0 },
        });
      } catch (error) {
        console.log("Brevo Error: ", error);
      }

      /* ================== */
      /* Mixpanel Tracking */
      /* ================== */
      try {
        sendMixpanel({
          event: "Artist Profile Created",
          data: {
            distinct_id: user_id,
            event_name: "Artist Profile Created",
          },
        });
      } catch (error) {
        console.log("Mixpanel Error: ", error);
      }

      // return
      ctx.status = 200;
      ctx.body = response;
      return;
    } else {
      ctx.status = 400;
      ctx.body = "Error updating user role";
      return;
    }
  } catch (error) {
    ctx.status = 400;
    ctx.body = error;
    return;
  }
});

// ********************* //
// Check if Username Exists
// ********************* //
router.post(`${BASE_URL}/checkUsername`, async (ctx) => {
  // Get username from request body
  const { username } = ctx.request.body;
  const { error } = Joi.object({
    username: Joi.string().min(5).max(30).required(),
  }).validate({ username });

  if (error) {
    ctx.status = 400;
    ctx.body = error.details[0].message;
    return;
  }

  // Perform a check to see if the username exists in the database
  const { users: response } = await apiRequestSystem(`
      query {
        users(filter: { username: { _eq: "${username}" } }) {
          id
        }
      }
    `);

  // username exists, return a 400 status
  if (response.length > 0) {
    ctx.status = 400;
    return;
  }
  // username does not exist, return a 200 status
  else {
    ctx.status = 200;
    return;
  }
});

export default router;
