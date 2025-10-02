import axios from "axios";
import authCheck from "../helpers/auth.mjs";
import { backendUrl, backendApiKey } from "../helpers/constants.mjs";
import { apiRequest, apiRequestSystem } from "../helpers/apicall.mjs";

export const isAdmin = (role) => {
  const list = [
    "ab50c41f-02ea-4ddb-a4ce-2f6b05a14239",
    "546a5a4e-812c-4eab-a62f-2f963b1e2878",
  ];
  return list.includes(role) ? true : false;
};

// ********************* //
// Fetch Current User ID
// ********************* //
export async function fetchUserId({ profileID }) {
  try {
    const query = `
      query {
        users(filter: { profile_id: { _eq: "${profileID}" } }) {
          id
        }
      }
    `;

    const { users } = await apiRequestSystem(query);
    return users[0].id;
  } catch (err) {
    return null;
  }
}

// ********************* //
// Fetch all follower ids
// ********************* //
export async function getFollowerIds({ user_id }) {
  try {
    const limit = 1000; // Number of records to fetch per request
    let offset = 0; // Start from the first record
    let followerIds = [];

    while (true) {
      // fetch followers
      const { fans_followers: followers } = await apiRequest(`
      query {
        fans_followers(
          filter: { user_id: { id: { _eq: "${user_id}" } } },
          limit: ${limit},
          offset: ${offset}
          ) {
          follower_id {
            id
          }
        }
      }
      `);
      if (followers.length === 0) {
        // No more followers to fetch
        break;
      }

      followerIds = [
        ...followerIds,
        ...followers.map((follower) => follower.follower_id.id),
      ];
      offset += limit; // Move to the next chunk of followers
    }

    return followerIds;
  } catch (err) {
    return [];
  }
}

// ********************* //
// Fetch Total Post Count
// ********************* //
export const fetchTotalItems = async ({ user_id, followerIds }) => {
  const query = `
    query {
      fans_posts_aggregated(
        filter: {
          user_created: { id: { _in: "${followerIds ?? await getFollowerIds({ user_id })}" } }
        }
      ) {
        count {
          id
        }
      }
    }
  `;

  return apiRequest(query);
};

export async function followUser({ payment_flow, user_id, creator_id }) {
  try {
    if (creator_id != user_id) {
      const isfollowing = await axios({
        url: `${backendUrl}/graphql`,
        method: "post",
        headers: { Authorization: `Bearer ${backendApiKey}` },
        data: {
          query: `
            query {
              fans_followers(
                filter: {
                  user_id: { id: { _eq: "${user_id}" } }
                  follower_id: { id: { _eq: "${creator_id}" } }
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
        //Create Follow
        await axios({
          url: `${backendUrl}/items/fans_followers`,
          method: "post",
          headers: { Authorization: `Bearer ${backendApiKey}` },
          data: {
            user_id: user_id,
            follower_id: creator_id,
          },
        });
      }
    } else {
      if (payment_flow === false) {
        //Deleta Follow
        await axios({
          url: `${backendUrl}/items/fans_followers/${isfollowing.data.data.fans_followers[0].id}`,
          method: "delete",
          headers: { Authorization: `Bearer ${backendApiKey}` },
          data: {},
        });
      }
    }

    return;
  } catch (err) {
    console.log(err);
  }
}
