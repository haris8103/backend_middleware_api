import Router from "koa-router";
import axios from "axios";
import dotenv from "dotenv";
import cache from "../../helpers/cache.mjs";
import authCheck from "../../helpers/auth.mjs";
import {
  backendApiKey,
  backendUrl,
  indexerUrl,
} from "../../helpers/constants.mjs";

dotenv.config();
const router = new Router();
const BASE_URL = `/v1/indexer`;

// ********************* //
// NFTs by Owner
// ********************* //
router.get(`${BASE_URL}/nfts/owner/:address/:page/:limit`, async (ctx) => {
  const { address, page, limit } = ctx.params;
  let owner = `owner: { _eq: "${address}" }`;

  if(address.includes(',')){
    const addr = address?.split(",").join('","');
    owner = `owner: { _in: ["${addr}"] }`;
  }
  const query = `
          query {
            fans_nfts(
              filter: {
                ${owner}
              }
              sort: ["-created_at"]
              page: ${page}
              limit: ${limit}
            ) {
              id
              owner
              name
              description
              image
              collection {
                id
                name
                address
              }
            }

            fans_nfts_aggregated(
              filter: { owner: { _eq: "${address}" } }
            ) {
              count {
                id
              }
            }
          }
            `
  try {
    const result = await axios({
      url: `${backendUrl}/graphql`,
      method: "POST",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: {
        query
      },
    });

    const nfts = {
      nfts: result.data.data.fans_nfts,
      pagination: {
        // whole number
        total_pages: Math.ceil(
          result.data.data.fans_nfts_aggregated[0].count.id / limit
        ),
        current_page: page,
      },
    };

    ctx.status = 200;
    ctx.body = nfts;
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = [];
    return;
  }
});

// ********************* //
// NFT Detail
// ********************* //
router.get(`${BASE_URL}/nft/:address/:limit`, async (ctx) => {
  const { address, limit } = ctx.params;

  try {
    const result = await axios({
      url: `${indexerUrl}/nft/${address}/${limit}`,
      method: "get",
      data: {},
    });

    ctx.status = 200;
    ctx.body = result.data;
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// ********************* //
// NFT Detail - Directus
// ********************* //
router.get(`${BASE_URL}/nftDetail/:id`, async (ctx) => {
  const { id } = ctx.params;

  try {
    const result = await axios({
      url: `${backendUrl}/graphql`,
      method: "POST",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: {
        query: `
          query {
            fans_nfts(
              filter: {
                id: {
                  _eq: "${id}"
                }
              }) {
              id
              owner
              name
              description
              image
              collection {
                id
                name
                description
                address
                banner { id }
                artist {
                  id
                  username
                  avatar {
                    id
                  }
                  display_name
                  first_name
                }
                song {
                  id
                }
                launchpadInfo: fans_launchpad_type {
                  launchpad: launchpad_id {
                    id
                  }
                }
                  gallery {
                    id
                    name
                    gallery_items {
                      directus_files_id {
                        id
                      }
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
            }
          }
            `,
      },
    });

    ctx.status = 200;
    ctx.body = result.data.data.fans_nfts[0];
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// ********************* //
// NFTs by Collection
// ********************* //
router.get(
  `${BASE_URL}/nfts/collection/:contract/:page/:limit`,
  async (ctx) => {
    const { contract, page, limit } = ctx.params;

    try {
      const result = await axios({
        url: `${indexerUrl}/nfts/collection/${contract}/${page}/${limit}`,
        method: "get",
        data: {},
      });

      ctx.status = 200;
      ctx.body = result.data;
      return;
    } catch (err) {
      //console.log(err, ctx);
      ctx.status = err.response.status;
      ctx.body = err.response.data;
      return;
    }
  }
);

// ********************* //
// Collection Details
// ********************* //
router.get(`${BASE_URL}/collection/:contract`, async (ctx) => {
  const { contract } = ctx.params;
  console.log(`${indexerUrl}/collection/${contract}`);

  try {
    const result = await axios({
      url: `${indexerUrl}/collection/${contract}`,
      method: "get",
      data: {},
    });

    ctx.status = 200;
    ctx.body = result.data;
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// ********************* //
// NFT Events
// ********************* //
router.get(`${BASE_URL}/events/nft/:address/:limit`, async (ctx) => {
  const { address, limit } = ctx.params;

  try {
    const result = await axios({
      url: `${indexerUrl}/events/nft/${address}/${limit}`,
      method: "get",
      data: {},
    });

    ctx.status = 200;
    ctx.body = result.data;
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// ********************* //
// Get User Events
// ********************* //
router.get(`${BASE_URL}/events/user/:address`, async (ctx) => {
  const { address } = ctx.params;

  try {
    const result = await axios({
      url: `${indexerUrl}/events/user/${address}/1/100`,
      method: "get",
      data: {},
    });

    ctx.status = 200;
    ctx.body = result.data;
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// ********************* //
// NNumber of NFTs owned by User for a given artist
// ********************* //
router.get(`${BASE_URL}/nfts/artist/:artistId`, async (ctx) => {
  const { artistId } = ctx.params;
  const { walletAddrs } = ctx.query;
  const wallets = walletAddrs.split(",");

  // check if user is UUID
  const isUUID = artistId.match(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-5][0-9a-fA-F]{3}-[089abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/
  );
  
  try {
    const usersData = [];
    for (let i = 0; i < wallets.length; i++) {
      wallets[i] = wallets[i].trim();
      const result = await axios({
        url: `${backendUrl}/graphql`,
        method: "POST",
        headers: { Authorization: `Bearer ${backendApiKey}` },
        data: {
          query: `
            query {
              fans_nfts_aggregated(
                filter: {
                  collection: { artist: { ${isUUID ? "id" : "username"}: { _eq: "${artistId}"} } }
                  owner: { _eq: "${wallets[i]}" }
                }
                page: 1
                limit: -1
              ) {
                count {
                  id
                }
              }
            }
              `,
        },
      });

      usersData.push({
        user: wallets[i],
        nfts: result.data.data.fans_nfts_aggregated[0].count.id,
      });
    }

    ctx.status = 200;
    ctx.body = usersData;
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = [];
    return;
  }
});

export default router;
