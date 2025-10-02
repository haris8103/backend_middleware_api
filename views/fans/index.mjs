import Router from "koa-router";
import axios from "axios";
import dotenv from "dotenv";
import cache from "../../helpers/cache.mjs";
import {
  backendUrl,
  backendApiKey,
  creator_role,
  default_host,
  gethostCreatorRole,
  platform,
} from "../../helpers/constants.mjs";
import authCheck from "../../helpers/auth.mjs";
import { apiRequest, apiRequestSystem } from "../../helpers/apicall.mjs";

const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1/fans`;

// ********************* //
// All Creators
// ********************* //
router.get(`${BASE_URL}/creators`, async (ctx) => {
  const { page, limit, genre, searchterm, collab, query } = ctx.headers;

  const cacheKey = `creatorsList`;
  const cachedResponse = cache.get(cacheKey);
  try {
    if (cachedResponse) {
      ctx.body = cachedResponse;
      ctx.status = 200;
      return; // Exit the middleware chain
    } else {
      const origin = ctx.request.header.origin;
      const url = origin && new URL(origin);
      const host = origin ? url.hostname : default_host;

      if (query) {
        if (query.includes("email") || query.includes("password")) {
          ctx.status = 400;
          ctx.body = "Invalid query";
          return;
        }
      }

      // sort by randomness
      const sortList = [
        "-first_name",
        "first_name",
        "-creator_type",
        "creator_type",
        "-display_name",
        "display_name",
        "-create_date",
        "create_date",
        "-username",
        "username",
        "-id",
        "id",
      ];
      const sort = sortList[Math.floor(Math.random() * sortList.length)];

      const request = await axios({
        url: `${backendUrl}/graphql/system`,
        method: "post",
        headers: { Authorization: `Bearer ${backendApiKey}` },
        data: {
          query: `
        query {
          users(filter: {
              role: { _eq: "${gethostCreatorRole(host)}" },
              status: { _nin: ["archived", "draft"] },
              username: { _neq: "null" },
              ${query ? query : ``}
              ${collab ? `show_featured_song: { _eq: true }` : ``}
              ${collab ? `featured_song: { id: { _nnull: true } }` : ``}
              ${genre ? `genres: { genres_id: { id: { _eq: "${genre}" }} }` : ``
            }
              _or: [
                {
                  ${searchterm
              ? `display_name: { _icontains: "${searchterm}" }`
              : ``
            }
                }
                {
                  ${searchterm
              ? `username: { _icontains: "${searchterm}" }`
              : ``
            }
                }
              ]
            }
            sort: ["${sort}"]
            limit: ${limit}
            page: ${page}
          ) {
            id
            username
            first_name
            display_name
            description
            background { id }
            avatar { id }
            creator_type
            create_date
            featured_song { id }
          }
        }        
        `,
        },
      });

      /* const sorted_creators = request.data.data.users.sort(
        (a, b) =>
          // Sort by date created in descending order
          new Date(b.create_date) - new Date(a.create_date)
        //b.create_date.localeCompare(a.create_date)
      ); */

      ctx.status = 200;
      ctx.body = request.data.data.users;
      return;
    }
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Creator Detail
// ********************* //
router.get(`${BASE_URL}/artist/:id`, async (ctx) => {
  const { id } = ctx.params;
  const cacheKey = `artist-${id}`;
  const cachedResponse = cache.get(cacheKey);
  try {
    if (cachedResponse) {
      ctx.body = cachedResponse;
      ctx.status = 200;
      return; // Exit the middleware chain
    } else {
      const UserData = await axios({
        url: `${backendUrl}/graphql/system`,
        method: "post",
        headers: { Authorization: `Bearer ${backendApiKey}` },
        data: {
          query: `
        query { 
          users(filter: {
            username: {
              _eq: "${id}"
            }
          }) {
            id
            username
            first_name
            last_name
            description
            video_link
            video_thumbnail {id}
            avatar {id}
            background {id}
            socials
            stats
            followers
            likes
            verified
            creator_type
            cta_banner {id}
            cta_link
            event_background {id}
            event_date
          }
        }
          `,
        },
      });

      if (UserData.data.data.users.length > 0) {
        const Followers = await axios({
          url: `${backendUrl}/graphql`,
          method: "post",
          data: {
            query: `
          query { 
            fans_followers_aggregated(filter: { follower_id: { username: { _eq: "${id}"}} }) {
              count {
                id
              }
            }
          }
            `,
          },
        });

        const likes = await axios({
          url: `${backendUrl}/graphql`,
          method: "post",
          data: {
            query: `
          query { 
            fans_likes_aggregated(
              filter: {
                post_id: { user_created: { id: { _eq: "${UserData.data.data.users[0]?.id}" } } }
              }
            ) {
              count {id}
            }
          }
            `,
          },
        });

        const data = {
          user: UserData.data.data.users[0],
          followers: UserData.data.data.users[0]?.id
            ? Followers.data.data.fans_followers_aggregated[0].count.id
            : 0,
          likes: UserData.data.data.users[0]?.id
            ? likes.data.data.fans_likes_aggregated[0].count.id
            : 0,
        };

        cache.set(cacheKey, data);
        ctx.status = 200;
        ctx.body = data;
        return;
      }
      ctx.status = 200;
      ctx.body = false;
      return;
    }
  } catch (err) {
    console.log(err, ctx);
  }
});

// ********************* //
// Collections
// ********************* //
router.get(`${BASE_URL}/fans_collections`, async (ctx) => {
  try {
    const request = await axios.get(`${backendUrl}/items/fans_collections`);
    ctx.status = 200;
    ctx.body = request.data;
    return;
  } catch (err) {
    console.log(err, ctx);
  }
});

router.get(`${BASE_URL}/fans_collections/:username`, async (ctx) => {
  const { username } = ctx.params;
  try {
    const _collections = await axios({
      url: `${backendUrl}/graphql`,
      method: "post",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: {
        query: `
        query { 
          nft_collections(
            filter: {
              artist: { username: { _eq: "${username}" } },
              platform: { _eq: "fans"}
            },
            sort: ["sort" "-date_created"],
            limit: 1
          ) {
            url
          }
        }
        `,
      },
    });

    const collections = _collections.data.data.nft_collections;
    const launchpad = [];

    for (let i = 0; i < collections.length; i++) {
      const collection = collections[i];

      const _launchpad = await axios({
        url: `${backendUrl}/graphql`,
        method: "post",
        headers: { Authorization: `Bearer ${backendApiKey}` },
        data: {
          query: `
          query {
            fans_launchpad(
              filter: {
                launchpad_type: { collection: { url: { _eq: "${collection.url}" } } }
              }
              limit: 1
            ) {
              id
              project_name
              required_tags
              project_slug
              banner {
                id
              }
              collection_type
              launchpad_type {
                launchInfo {
                  startDate
                  startTime
                }
                collections_type {
                  name
                  desc
                }
                collection {
                  name
                  description
                  url
                  faqs { Questions }
                }
                benefits {
                  benefit
                }
              }
            }
          } 
          `,
        },
      });
      launchpad.push(..._launchpad.data.data.fans_launchpad);
    }

    ctx.status = 200;
    ctx.body = launchpad;
    return;
  } catch (err) {
    console.log(err, ctx);
    return;
  }
});

// ********************* //
// Featured Artist
// ********************* //
router.get(`${BASE_URL}/featured_artist`, async (ctx) => {
  try {
    const request = await axios.get(`${backendUrl}/items/featured_artist`);
    ctx.status = 200;
    ctx.body = request.data;
    return;
  } catch (err) {
    console.log(err, ctx);
  }
});

// ********************* //
// Fans Exclusive
// ********************* //
router.get(`${BASE_URL}/fans_exclusive/:id`, async (ctx) => {
  const { id } = ctx.params;
  try {
    const request = await axios.get(
      `${backendUrl}/items/fans_exclusive?filter[artist][username][_eq]=${id}`,
      {
        artist: id,
      }
    );
    ctx.status = 200;
    ctx.body = request.data.data[0];
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Get Launchpad Item
// ********************* //
router.get(`${BASE_URL}/fans_launchpad/:id`, async (ctx) => {
  const { id } = ctx.params;
  const { status, isId } = ctx.query;
  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;

  try {
    const userData = await authCheck({ cookie: cookie });
    // Check Cookie is present
    if (cookie && !userData) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const request = await axios({
      url: `${backendUrl}/graphql`,
      method: "post",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: {
        query: `
          query {
            fans_launchpad(filter: {
              ${isId ? `id: { _eq: "${id}" }` : `project_slug: { _eq: "${id}" }`
          }
              ${status ? `status: { _eq: "${status}" }` : ""}
            }) {
              id
              project_name
              project_slug
              project_status
              required_tags
              status
              went_live
              mint_status
              collection_type
              featured
              artist {
                id
                first_name
                username
                display_name
                avatar { id }
              }
              banner {
                id
              }
              launchpad_type {
                launchInfo {
                  startDate
                  startTime
                  publicDate
                  publicTime
									endDate
									endTime
                  mintPrice
                  mint_limit
                  maxSupply
                  minPrice
									NFT
                  is_free
                }
                collections_type {
                  name
                  display_name
                  desc
                }
                fan_collection {
                  id
                  name
                  description
                  address
                  starknet_address
                  icon { id }
                  banner { id }
                  faqs { Questions }
                  gallery {
                    id
                    name
                    gallery_items {
                      directus_files_id {
                        id
                      }
                    }
                  }
                  video_id
                  song {
                    id
                  }
                  leaderboard {
                    id
                    division {
                      id
                      name
                    }
                    genre {
                      id
                      name
                    }
                  }
                  collection_album {
                    id
                    name
                    order
                    genre {
                      id
                      name
                    }
                    tracks {
                      track: directus_files_id {
                        id
                        filename_disk
                        title
                      }
                    }
                  }
                  collection_video {
                    id
                    name
                    order
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
                  collection_files {
                    id
                    name
                    order
                    files {
                      file: directus_files_id {
                        id
                        title
                      }
                    }
                  }
                }
                benefits {
                  benefit
                }
                type_gallery {
									directus_files_id {
										id
									}
								}
              }
            }
          }
      `,
      },
    });

    const { fans_launchpad } = request.data.data;
    const data = { info: fans_launchpad[0] };
    ctx.status = 200;
    ctx.body = data;
    return;
  } catch (err) {
    console.log(err, ctx);
  }
});

// ********************* //
// Fans Launchpad Detail View
// ********************* //
router.get(`${BASE_URL}/fans_launchpad/detail/:id`, async (ctx) => {
  const { id } = ctx.params;
  try {
    const request = await axios.get(
      `${backendUrl}/items/fans_launchpad?filter[project_slug][_eq]=${id}&fields=id,project_name,project_slug,banner.id,launchpad_type.*.*`
    );
    ctx.status = 200;
    ctx.body = request.data.data[0];
    return;
  } catch (err) {
    console.log(err, ctx);
  }
});

// ********************* //
// Fans Launchpad Insights
// ********************* //
router.get(`${BASE_URL}/fans_launchpad/insights/:id`, async (ctx) => {
  const { id } = ctx.params;
  try {
    const { user_cookie } = ctx.request.headers;
    const cookie = user_cookie;
    // Check Cookie
    const userData = await authCheck({ cookie: cookie });
    // Check Cookie is present
    if (cookie && !userData) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const query = `
      query {
        fans_launchpad(filter: {
          id: { _eq: "${id}" }
        }) {
          collection_type
          launchpad_type {
            launchInfo {
              maxSupply
              mintPrice
              minPrice
              is_free
            }
            fan_collection {
							collection_id: id
              name
              address
              artwork: banner {
                id
              }
              artist {
                profile_id
              }
						}
          }
        }
      }
    `;

    const { fans_launchpad } = await apiRequest(query);
    const collections = [];

    // check if user is artist of the collection
    const isArtist = fans_launchpad[0].launchpad_type.some(
      (collection) =>
        collection.fan_collection.artist.profile_id === userData.profileId
    );

    if (isArtist) {
      for (let i = 0; i < fans_launchpad[0].launchpad_type.length; i++) {
        const collection = fans_launchpad[0].launchpad_type[i].fan_collection;
        const [price, currency] =
          fans_launchpad[0].launchpad_type[i].launchInfo.mintPrice.split(" ");
        const maxSupply =
          fans_launchpad[0].launchpad_type[i].launchInfo.maxSupply;
        if (price === 0) {
          // Free Claim Count
          const FreeClaimCountQuery = `
          query {
            nft_free_claims_aggregated(
              filter: { collection_id: { _eq: "${collection.collection_id}" } }
            ) {
              count {
                id
              }
            }
          }
        `;
          const { nft_free_claims_aggregated } = await apiRequest(
            FreeClaimCountQuery
          );
          const subTotal = price * nft_free_claims_aggregated[0].count.id;
          const platformFee = subTotal * (12 / 100);

          collection.maxSupply = maxSupply;
          collection.sold = nft_free_claims_aggregated[0].count.id;
          collection.profit = (subTotal - platformFee).toFixed(2);
          collection.total = (subTotal).toFixed(2);
          collection.collection_type = fans_launchpad[0].collection_type;
          collections.push(collection);
        } else {
          // Paid Claim Count
          const PaymentHistoryQuery = `
          query {
            payment_history_aggregated(
              filter: { collection_addr: { _eq: "${collection?.address}" }, payment_status: { _eq: "APPROVED" } }
            ) {
              sum {
                id: number_of_nfts
              }
            }
          }
        `;
          const { payment_history_aggregated } = await apiRequest(
            PaymentHistoryQuery
          );
          const subTotal = price * payment_history_aggregated[0].sum.id;
          const platformFee = subTotal * (12 / 100);
          collection.maxSupply = maxSupply;
          collection.sold = payment_history_aggregated[0].sum.id || 0;
          collection.profit = (subTotal - platformFee).toFixed(2);
          collection.total = (subTotal).toFixed(2);
          collection.collection_type = fans_launchpad[0].collection_type;
          collections.push(collection);
        }
      }
      ctx.status = 200;
      ctx.body = collections;
      return;
    } else {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }
  } catch (err) {
    console.log(err, ctx);
  }
});

// ********************* //
// Fans Launchpad Insights - latest transactions
// ********************* //
router.get(
  `${BASE_URL}/fans_launchpad/insights/transactions/:id/:page`,
  async (ctx) => {
    const { id, page } = ctx.params;
    try {
      const { user_cookie } = ctx.request.headers;
      const cookie = user_cookie;
      // Check Cookie
      const userData = await authCheck({ cookie: cookie });
      // Check Cookie is present
      if (cookie && !userData) {
        ctx.status = 401;
        ctx.body = "Unauthorized";
        return;
      }
      const query = `
      query {
        payment_history(
          filter: {
            launchpad_id: { id: { _eq: "${id}" } }
            payment_status: { _eq: "APPROVED" }
          }
          sort: "-date_created"
          page: ${page}
        ) {
          id
          date_created
          number_of_nfts
          collection_addr
          user {
            id
            first_name
            last_name
            display_name
            profile_id
            avatar {
              id
            }
          }
        }
      }
    `;
      const { payment_history } = await apiRequest(query);
      if (userData.profileId) {
        const collection_addr = payment_history[0]?.collection_addr;

        if (collection_addr && collection_addr !== "false") {
          // fetch collection price using collection_addr
          const collectionQuery = `
          query {
            fans_collections(
              filter: {
                address: { _eq: "${collection_addr}" }
              }
            ) {
              fans_launchpad_type {
                  launchInfo {
                    mintPrice
                    minPrice
                    is_free
                  }
                  fan_collection {
                    name
                  }
                }
              }
            }
          `;
          const { fans_collections } = await apiRequest(collectionQuery);
          payment_history.forEach((payment) => {
            const [price, currency] =
              fans_collections[0].fans_launchpad_type[0].launchInfo.mintPrice.split(
                " "
              );

            const subTotal = (price * payment.number_of_nfts).toFixed(2);
            const platformFee = subTotal * (12 / 100);

            payment.collection =
              fans_collections[0].fans_launchpad_type[0]?.fan_collection?.name;
            payment.price = `$${(subTotal)} ${currency ?? "USD"}`;
          });
        }

        ctx.status = 200;
        ctx.body = payment_history;
        return;
      } else {
        ctx.status = 401;
        ctx.body = "Unauthorized";
        return;
      }
    } catch (err) {
      console.log(err, ctx);
    }
  }
);


// ********************* //
// Fans following
// ********************* //
router.post(BASE_URL + '/following', async (ctx) => {
  const { userInfo } = ctx.request.body;
  // const now = new Date();
  try {
    // Construct the GraphQL query dynamically to get fans/followers with date_created
    const fansFollowers = `
      query {
        fans_followers(
          filter: {
            follower_id: { id: { _eq: "${userInfo.id}" } }
          }
        ) {
          date_created
          user_id {
            id
            first_name
            last_name
            sso_email
          }
        }
      }
    `;

    // Call the API with the query to get followers
    const userFans = await apiRequest(fansFollowers);


    const followers = userFans.fans_followers || [];
    const formattedFollowers = followers.map((follower) => ({
      id: follower.user_id.id,
      first_name: follower.user_id.first_name || "Anonymous", // Handle null display_name
      last_name: follower.user_id.last_name || "",
      email: follower.user_id.sso_email,
      date_created: new Date(follower.date_created), // Use date_created for growth calculation
    }));

    // Calculate the total number of followers
    const totalFans = formattedFollowers.length;

    // Calculate the followers from last month (e.g., July)
    // const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); // Start of last month
    // const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // End of last month
    // const lastMonthFans = formattedFollowers.filter(follower => {
    //   const createDate = follower.date_created;
    //   return createDate >= lastMonthStart && createDate <= lastMonthEnd;
    // }).length;

    // // Calculate the followers from this month (e.g., August)
    // const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1); // Start of this month
    // const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // End of this month
    // const thiMonthFans = formattedFollowers.filter(follower => {
    //   const createDate = follower.date_created;
    //   return createDate >= thisMonthStart && createDate <= thisMonthEnd;
    // }).length;

    ctx.body = {
      userFans,
      fans_following: formattedFollowers,
      totalFans, // Total number of followers
      // lastMonthFans, // Followers from last month (e.g., July)
      // thiMonthFans, // Followers from this month (e.g., August)
    };
  } catch (err) {
    console.error("Error:", err);
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});

// ********************* //
// Fetch Collections Nft owners
// ********************* //
router.post(`${BASE_URL}/customers`, async (ctx) => {
  const { id } = ctx.params;
  // Get the collection name from the query parameter
  const { userInfo, collection_id, search } = ctx.request.body;


  let collectionFilter = `
  artist: { id: { _eq: "${userInfo.id}" } }
  ${collection_id ? `id: { _eq: ${collection_id} }` : ""}
  `;

  try {
    // Correct GraphQL query
    const collectionNftOwners = `
      query {
        fans_nfts(
       filter: {
        collection: {
          ${collectionFilter}
        }
       }
        ) {
          owner
          id
          token_id
          collection {
           fans_launchpad_type{
            launchInfo{
                minPrice
                mintPrice
                }
              }   
            name
            id
            artist {
              id
              first_name
            }
          }
          name
          id
        }
      }
    `;

    // Fetch response
    const CollectionsResponse = await apiRequest(collectionNftOwners);


    if (!CollectionsResponse.fans_nfts || CollectionsResponse.fans_nfts.length === 0) {
      ctx.body = [];
      return;
    }

    const ownerIds = CollectionsResponse.fans_nfts.map(nft => nft.owner); // Assuming each `owner` is a user ID

    // Step 3: Query the users table to fetch details for the owner IDs (without filtering duplicates)
    let userFilter = `
      wallet_address: { _in: [${ownerIds.map(ownerId => `"${ownerId}"`).join(", ")}] }
    `;
    const userQuery = `
      query {
        users(
          filter: {
        ${userFilter}
              }
         ) {
          id
          first_name
          last_name
          sso_email
          wallet_address
          avatar {
              id
              filename_download
            }
        }
      }`;

    // Fetch user data based on owner IDs
    const userData = await apiRequestSystem(userQuery);


    // Merge the data
    // const nftData = await mergeData(CollectionsResponse.fans_nfts, userData.users);

    const nftData = await mergeData(
      CollectionsResponse.fans_nfts,
      userData.users,
      { search: search }
    );


    // Final result
    // console.log(mergedData);
    // Send successful response
    ctx.status = 200;
    ctx.body = nftData;
    return;
  } catch (err) {
    // Handle errors
    ctx.status = 500;
    ctx.body = { error: err.message };
    return;
  }
});

const mergeData = async (fansNFTs, users, filters = {}) => {
  const { search } = filters;
  const q = search ? search.trim().toLowerCase() : null;

  // helper: extract launch prices safely from array
  const getLaunchPrices = (nft) => {
    const launchInfo = nft?.collection?.fans_launchpad_type?.[0]?.launchInfo;
    return {
      minPrice: launchInfo?.minPrice ?? null,
      mintPrice: launchInfo?.mintPrice ?? null,
    };
  };

  // Merge NFTs with users
  const merged = fansNFTs
    .map((nft) => {
      const user = users.find((u) => u.wallet_address?.startsWith(nft.owner));
      if (!user) return null;

      const { minPrice, mintPrice } = getLaunchPrices(nft);

      return {
        ...nft,
        collectionId: nft?.collection?.id || nft?.collection_id || "unknown",
        collectionName: nft?.collection?.name || nft?.collection_name || "Unknown",
        collectionMinPrice: minPrice,
        collectionMintPrice: mintPrice,
        user: {
          id: user.id,
          first_name: user.first_name || "",
          last_name: user.last_name || "",
          email: user.sso_email || "",
          avatar: user?.avatar?.id || "",
          collections: [],
        },
      };
    })
    .filter(Boolean);

  // Apply search if provided
  const filtered = q
    ? merged.filter((item) => {
      const { user = {}, collectionName, collectionId, id, token_id } = item || {};
      const { first_name = "", last_name = "", email = "", id: userId = "" } = user || {};
      const fullName = `${first_name} ${last_name}`.trim();

      const qNorm = String(q).toLowerCase().trim();

      const haystack = [
        first_name,
        last_name,
        fullName,
        email,
        userId,
        id,
        token_id,
        collectionName,
        collectionId,
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());

      return haystack.some((field) => field.includes(qNorm));
    })
    : merged;

  // Deduplicate by user.id and collect collections {id, name, minPrice, mintPrice}
  const seen = new Map();
  const uniqueByUser = [];

  for (const item of filtered) {
    const { user, collectionId, collectionName, collectionMinPrice, collectionMintPrice } = item;

    const collectionObj = {
      id: collectionId,
      name: collectionName,
      minPrice: collectionMinPrice,
      mintPrice: collectionMintPrice,
    };

    if (!seen.has(user.id)) {
      const newUser = {
        ...item,
        user: { ...user, collections: [collectionObj] },
      };
      seen.set(user.id, newUser);
      uniqueByUser.push(newUser);
    } else {
      const existing = seen.get(user.id);
      const exists = existing.user.collections.some(
        (c) => String(c.id) === String(collectionObj.id)
      );
      if (!exists) {
        existing.user.collections.push(collectionObj);
      }
    }
  }

  return uniqueByUser;
};


router.post(`${BASE_URL}/get/collections`, async (ctx) => {
  const { userInfo } = ctx.request.body;
  try {
    // 1) Fetch collections once
    const getCollections = `
      query {
        fans_launchpad(
          filter: {
            artist: { id: { _in: "${userInfo.id}" } }
            status: { _eq: "published" }
          }
        ) {
          id
          status
          mint_status
          collection_type
          project_name
          launchpad_type {
            launchInfo{
                minPrice
                mintPrice
            }
            fan_collection {
              id
            }
          }
        }
      }
    `;

    const collectionsRes = await apiRequest(getCollections);
    const collections = (collectionsRes?.fans_launchpad || []).map(c => ({
      ...c,
      // normalize collectionId in case launchpad_type is an array
      collectionId: c?.launchpad_type?.[0]?.fan_collection?.id || null,
    })).filter(c => c.collectionId);

    if (collections.length === 0) {
      ctx.status = 200;
      ctx.body = [];
      return;
    }

    // 2) Batch-fetch all nft owners for these collections in ONE go
    // NOTE: we select minimal fields to keep payload small & fast
    const idsLiteral = collections.map(c => `"${c.collectionId}"`).join(", ");
    const ownersQuery = `
      query {
        fans_nfts(
          filter: {
            collection: { id: { _in: [${idsLiteral}] } }
          }
        ) {
          id
          owner
          token_id
          collection { id }
          name
        }
      }
    `;

    const ownersRes = await apiRequest(ownersQuery);
    const owners = ownersRes?.fans_nfts || [];

    // 3) Group nft owners by collection id
    const ownersByCollection = owners.reduce((acc, nft) => {
      const cid = nft?.collection?.id;
      if (!cid) return acc;
      if (!acc[cid]) acc[cid] = [];
      acc[cid].push({
        id: nft.id,
        owner: nft.owner,
        token_id: nft.token_id,
        name: nft.name,
      });
      return acc;
    }, {});

    // 4) Keep only collections that actually have owners
    const finalCollections = collections
      .filter(c => ownersByCollection[c.collectionId]?.length > 0)
      .map(c => ({
        ...c,
        nftOwners: ownersByCollection[c.collectionId],
      }));

    ctx.status = 200;
    ctx.body = finalCollections;
    return;
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
    return;
  }
});




export default router;
