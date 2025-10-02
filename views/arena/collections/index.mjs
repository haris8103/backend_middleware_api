import Router from "koa-router";
import axios from "axios";
import dotenv from "dotenv";
import cache from "../../../helpers/cache.mjs";
import {
  default_host,
  gethostCreatorRole,
  platform,
} from "../../../helpers/constants.mjs";
import { apiRequest, apiRequestSystem } from "../../../helpers/apicall.mjs";
import authCheck from "../../../helpers/auth.mjs";

dotenv.config();
const router = new Router();
const BASE_URL = `/v1/arena/collections`;
const limit = 10;

/* =================== */
/* Fetch Collections */
/* =================== */
router.get(`${BASE_URL}`, async (ctx) => {
  try {
    const { page, limit } = ctx.query;
    const { query, sortquery } = ctx.headers;
    const origin = ctx.request.header.origin;
    const url = new URL(origin);
    const host = url.hostname;

    if (query) {
      if (query.includes("email") || query.includes("password")) {
        ctx.status = 400;
        ctx.body = "Invalid query";
        return;
      }
    }

    // sort by randomness
    const sortList = [
      "project_name",
      "-project_name",
      "-date_created",
    ];
    const sort = sortList[Math.floor(Math.random() * sortList.length)];

    // Fans Collections Query
    const fans_launchpad = `
        query { 
          fans_launchpad(
          sort: ["sort" "${sortquery ? sortquery : sort}"],
          filter: {
            status: { _eq: "published" },
            project_status: { _neq: "completed" },
            artist: {
              role: {_eq: "${gethostCreatorRole(host)}"}
            }
            platform: { _eq: "${platform(host)}"}
            ${query ? query : ""}
          }
          limit: ${limit ?? 6}
          page: ${page ?? 1}
        ) {
            id
            project_name
            project_slug
            project_status
            required_tags
            status
            banner { id }
            launchpad_type {
              fan_collection {
                description
              }
            }
          }
        }
          `;

    // Fetch Collections
    const { fans_launchpad: collections } = await apiRequest(fans_launchpad);

    ctx.status = 200;
    ctx.body = collections;
    return;
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
    return;
  }
});

// ********************* //
// Fetch Collections by Username
// ********************* //
router.get(`${BASE_URL}/:username`, async (ctx) => {
  const { username } = ctx.params;
  const { status, type, limit } = ctx.query;
  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;

  try {

    // if status is not published check if user is logged in
    if (status && status !== "published") {
      const userAuth = await authCheck({ cookie });
      if (!userAuth) {
        ctx.status = 401;
        ctx.body = { error: "Unauthorized" };
        return;
      }
    }

    const launchpadQuery = `
        query {
          fans_launchpad(
            filter: {
              artist: { username: { _eq: "${username}" } }
              status: {_eq: "${status ?? "published"}"}
              project_status: { _neq: "completed" }
              ${type ? `collection_type: { _eq: "${type}" }` : ""}
            }
            limit: ${limit ?? 6}
          ) {
            id
            project_name
            project_slug
            project_status
            required_tags
            status
            banner {
              id
            }
            collection_type
            launchpad_type {
              collections_type {
                name
                desc
              }
              fan_collection {
                name
                description
                faqs { Questions }
              }
              benefits {
                benefit
              }
            }
          } 
        }
      `;

    // Fetch Launchpads
    const { fans_launchpad: launchpads } = await apiRequest(launchpadQuery);

    ctx.status = 200;
    ctx.body = launchpads;
    return;
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
    return;
  }
});

// ********************* //
// Fetch Collections by ID
// ********************* //
router.get(`${BASE_URL}/byId/:id`, async (ctx) => {
  const { id } = ctx.params;
  const { status, type, limit, page } = ctx.query;
  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;

  try {

    // if status is not published check if user is logged in
    if (status && status !== "published") {
      const userAuth = await authCheck({ cookie });
      if (!userAuth) {
        ctx.status = 401;
        ctx.body = { error: "Unauthorized" };
        return;
      }
    }

    const launchpadQuery = `
        query {
          fans_launchpad(
            filter: {
              artist: { id: { _eq: "${id}" } }
              status: {_eq: "${status ?? "published"}"}
              project_status: { _neq: "completed" }
              ${type ? `collection_type: { _eq: "${type}" }` : ""}
            }
            limit: ${limit ?? 6}
            page: ${page ?? 1}
          ) {
            id
            project_name
            project_slug
            project_status
            required_tags
            status
            banner {
              id
            }
            collection_type
            launchpad_type {
            launchInfo {
                  id
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
                desc
              }
              fan_collection {
                id
                name
                description
                faqs { Questions }
              }
              benefits {
                benefit
              }
            }
          } 
        }
      `;

    // Fetch Launchpads
    const { fans_launchpad: launchpads } = await apiRequest(launchpadQuery);

    ctx.status = 200;
    ctx.body = launchpads;
    return;
  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
    return;
  }
});

// ********************* //
// Fetch Artist all NFTs by ID
// ********************* //
router.get(`${BASE_URL}/artist/nft/:id/:limit?/:page?`, async (ctx) => {
  const { id, limit, page } = ctx.params;
  // const { user_cookie } = ctx.request.headers;

  // Set defaults if not provided
  const parsedLimit = parseInt(limit) || 10;
  const parsedPage = parseInt(page) || 1;
  const offset = (parsedPage - 1) * parsedLimit;

  try {
    // Step 1: Query to get the NFTs with the owner IDs
    const artistAllNFT = `
      query {
        fans_nfts(
          limit: ${parsedLimit},
          offset: ${offset},
          filter: {
            collection: {
              artist: {
                id: {
                  _eq: "${id}"
                }
              }
            }
          }
        ) {
          owner
          token_id
          collection {
            artist {
              id
              first_name
            }
          }
          name
          id
        }
      }`;


    // Fetch NFT data
    const artistAllNFTData = await apiRequest(artistAllNFT);

    // Step 2: Extract owner IDs from the fetched NFTs data
    const ownerIds = artistAllNFTData.fans_nfts.map(nft => nft.owner); // Assuming each `owner` is a user ID



    if (ownerIds.length === 0) {
      ctx.status = 404;
      ctx.body = { error: "No NFTs found for the artist." };
      return;
    }

    // Step 3: Query the users table to fetch details for the owner IDs (without filtering duplicates)
    const userQuery = `
      query {
        users(
          filter: { wallet_address: { _in: [${ownerIds.map(ownerId => `"${ownerId}"`).join(', ')}] } }
        ) {
          id
          first_name
          last_name
          email
          wallet_address 
        
        }
      }`;


    // Fetch user data based on owner IDs
    const userData = await apiRequestSystem(userQuery);


    // Merge the data
    const mergedData = await mergeData(artistAllNFTData.fans_nfts, userData.users);

    // Step 5: Return the combined result
    ctx.status = 200;
    ctx.body = {
      fansData: userData,
      NftObject: mergedData
    }

  } catch (err) {
    ctx.status = 500;
    ctx.body = { error: err.message };
  }
});


// ********************* //
// Fetch Collections Nft owners
// ********************* //
router.get(`${BASE_URL}/nft_owners/:id`, async (ctx) => {
  const { id } = ctx.params;
  const { collectionName } = ctx.request.query;  // Get the collection name from the query parameter

  try {
    // Correct GraphQL query
    const collectionNftOwners = `
      query {
        fans_nfts(
        filter: { 
            collection: {
              id: { _eq: "${id}" }
              ${collectionName ? `, name: { _eq: "${collectionName}" }` : ''}
              
            }
          }
        ) {
          owner
          id
          token_id
          collection {
            name
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


    const ownerIds = CollectionsResponse.fans_nfts.map(nft => nft.owner); // Assuming each `owner` is a user ID

    // Step 3: Query the users table to fetch details for the owner IDs (without filtering duplicates)
    const userQuery = `
      query {
        users(
          filter: { wallet_address: { _in: [${ownerIds.map(ownerId => `"${ownerId}"`).join(', ')}] } }
        ) {
          id
          first_name
          last_name
          sso_email
          wallet_address
        }
      }`;

    // Fetch user data based on owner IDs
    const userData = await apiRequestSystem(userQuery);

    // Merge the data
    const nftData = await mergeData(CollectionsResponse.fans_nfts, userData.users);

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

const mergeData = async (fansNFTs, users) => {
  return fansNFTs.map(nft => {
    // Extract the owner and check for matching  wallet_address
    const user = users.find(user => user.wallet_address.startsWith(nft.owner));

    // If a user is found, merge their data with the NFT
    if (user) {
      return {
        ...nft,
        user: { // Add the user data to a 'user' key inside the NFT
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.sso_email
        }
      };
    }
    return nft; // Return the nft if no user is found
  });
};


export default router;
