import Router from "koa-router";
import axios from "axios";
import dotenv from "dotenv";
import crypto from "crypto";
import cache from "../../helpers/cache.mjs";
dotenv.config();

const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1`;

// ********************* //
// Generate Hash
// ********************* //
function createHash(obj) {
  const jsonString = JSON.stringify(obj);

  // Generate hash of the JSON string
  const hash = crypto.createHash("sha256").update(jsonString).digest("hex");
  return hash;
}

// ********************* //
// check launchpad expiration
// ********************* //
router.get(
  `${BASE_URL}/collection/launchpad_exp/:platform/:address`,
  async (ctx) => {
    const { platform, address } = ctx.params;
    try {
      const query = `
      ${
        platform === "fans"
          ? `query {
            fans_launchpad(
              filter: { launchpad_type: { launchInfo: { NFT: { _eq: "${address}" } } } }
            ) {
              launchpad_type {
                launchInfo {
                  endDate
                  endTime
                }
              }
            }
          }`
          : `query {
            launchpad(
              filter: { launchInfo: { NFT: { _eq: "${address}" } } }
            ) {
              launchInfo {
                  endDate
                  endTime
              }
            }
          }`
      }`;

      const result = await axios({
        url: `${url}/graphql`,
        method: "post",
        data: {
          query: query,
        },
      });

      ctx.status = 200;
      ctx.body =
        platform === "fans"
          ? result.data.data.fans_launchpad[0]?.launchpad_type[0]?.launchInfo
          : result.data.data.launchpad[0]?.launchInfo;
      return;
    } catch (err) {
      //console.log(err, ctx);
    }
  }
);

// ********************* //
// Get Address
// ********************* //
router.get(`${BASE_URL}/collectionByUrl/:address`, async (ctx) => {
  const { address } = ctx.params;
  const cacheKey = `collectionByUrl-${address}`;
  const cachedResponse = cache.get(cacheKey);
  try {
    if (cachedResponse) {
      ctx.body = cachedResponse;
      ctx.status = 200;
      return; // Exit the middleware chain
    } else {
      const collection = await axios({
        url: `${url}/graphql`,
        method: "post",
        data: {
          query: `
        query { 
          nft_collections(filter: { url: { _eq: "${address}" } }) {
            address
          }
        }
          `,
        },
      });

      ctx.status = 200;
      ctx.body = collection.data.data.nft_collections[0];
      //cache.set(cacheKey, collection.data.data.nft_collections[0]);
      return;
    }
  } catch (err) {
    //console.log(err, ctx);
  }
});

// ********************* //
// Get Collections
// ********************* //
router.post(`${BASE_URL}/collections`, async (ctx) => {
  const { sortType, sortOrder, nftType, rewardToken, platform } =
    ctx.request.body;
  const hash = createHash({
    sortType,
    sortOrder,
    nftType,
    rewardToken,
    platform,
  });
  const cacheKey = `${platform}-${hash}-collections`;
  const cachedResponse = cache.get(cacheKey);
  try {
    if (cachedResponse) {
      ctx.body = cachedResponse;
      ctx.status = 200;
      return; // Exit the middleware chain
    } else {
      const collections = await axios({
        url: `${url}/graphql`,
        method: "post",
        data: {
          query: `
        query { 
          nft_collections(sort:"${
            sortOrder == "Desc" ? "-" : ""
          }${sortType}", filter: {
            platform: { _eq: "${platform}" }
            _and: [
              ${
                nftType == `Reward`
                  ? `{ rewardTokens: { _ncontains: "NoReward" }}`
                  : ``
              },
              ${
                rewardToken
                  ? `{ rewardTokens: { _contains: "${rewardToken}" }}`
                  : ``
              },
            ],
          }) {
            name,
            description,
            icon {id},
            banner {id},
            url,
            address,
            rewardTokens,
            itemCount,
            ownerCount,
            floorPrice,
            volumn,
            totalItems
          }
        }
          `,
        },
      });

      ctx.status = 200;
      ctx.body = collections.data.data.nft_collections;
      //cache.set(cacheKey, collections.data.data.nft_collections);
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
// Get Collection Item
// ********************* //
router.get(`${BASE_URL}/collection/:id`, async (ctx) => {
  const { id } = ctx.params;
  const cacheKey = `collection-${id}`;
  const cachedResponse = cache.get(cacheKey);
  try {
    if (cachedResponse) {
      ctx.body = cachedResponse;
      ctx.status = 200;
      return; // Exit the middleware chain
    } else {
      const collection = await axios({
        url: `${url}/graphql`,
        method: "post",
        data: {
          query: `
        query { 
          nft_collections(filter: {url: {_eq:"${id}"}}) {
            id,
            name,
            artist { avatar { id }, first_name, username, description },
            icon { id },
            banner { id },
            description,
            url,
            address,
            floorPrice,
            itemCount,
            ownerCount,
            volumn,
            daily_volume,
            totalItems,
            socials,
            faqs { Questions }
          }
        }
          `,
        },
      });

      ctx.status = 200;
      ctx.body = collection.data.data.nft_collections[0];
      //cache.set(cacheKey, collection.data.data.nft_collections[0]);
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
// Get Creator Collections
// ********************* //
router.get(`${BASE_URL}/collections/creator/:username`, async (ctx) => {
  const { username } = ctx.params;
  const cacheKey = `creator-collections-${username}`;
  const cachedResponse = cache.get(cacheKey);
  try {
    if (cachedResponse) {
      ctx.body = cachedResponse;
      ctx.status = 200;
      return; // Exit the middleware chain
    } else {
      const collection = await axios({
        url: `${url}/graphql`,
        method: "post",
        data: {
          query: `
        query { 
          nft_collections(filter: { artist: { username: { _eq: "${username}" } } }) {
            name,
            url,
            banner { id },
            totalItems
          }
        }
          `,
        },
      });

      ctx.status = 200;
      ctx.body = collection.data.data.nft_collections;
      cache.set(cacheKey, collection.data.data.nft_collections);
      return;
    }
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

export default router;
