import axios from "axios";
import { backendApiKey } from "../../helpers/constants.mjs";
import { apiRequest } from "../../helpers/apicall.mjs";
const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";

/* ======================= */
/* === Fetch User NFTs === */
/* ======================= */
export const fetchUserNFTs = async ({ address }) => {
  const nftsQuery = `query {
    fans_nfts(
      filter: {
        owner: { _eq: "${address}" }
      }
    ) {
      collection {
        address
      }
    }
  }
  `;

  const { fans_nfts: _nfts } = await apiRequest(nftsQuery);
  const nfts = [];

  // Iterate through each NFT and push to array
  _nfts.map((item) => {
    nfts.push(item);
  });

  // Return array of NFTs
  return nfts;
};

/* ========================= */
/* === Fetch Collections === */
/* ========================= */
export const fetchCollectionAddresses = async () => {
  try {
    const collectionQuery = `
    query {
      fans_collections(
        filter: {
          gated_content: { _eq: true }
        }
      )  {
        artist {
          id
        }
        address
        gated_content
      }
    }
    `;

    const { fans_collections: _collections } = await apiRequest(collectionQuery);

    // Return array of Collection addresses
    return _collections;
  } catch (error) {
    console.log(error);
    return;
  }
};

export const fetchLikedData = async ({ userId, postIds }) => {
  const likesQuery = `
  query {
    fans_likes(
      filter: {
        user_id: { id: { _eq: "${userId}" } }
        post_id: { id: { _in: ${JSON.stringify(postIds)} } }
      }
    ) {
        id
        post_id {
          id
        }
    }
  }
  `;

  const { fans_likes: likes } = await apiRequest(likesQuery);
  return likes;
};

export const handleLike = async ({ create, id, userId }) =>
  await axios({
    url: `${url}/graphql`,
    method: "post",
    headers: { Authorization: `Bearer ${backendApiKey}` },
    data: {
      query: `
      ${
        create
          ? `
      mutation { create_fans_likes_item( data: { user_id: { id: "${userId}" }, post_id: ${id} } ) {id} }`
          : `
      mutation { delete_fans_likes_item(id: ${id}) { id }}
      `
      }
    `,
    },
  });
