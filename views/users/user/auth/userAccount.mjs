import axios from "axios";
import {
  backendApiKey,
  backendUrl,
  fanRoleId,
} from "../../../../helpers/constants.mjs";
import { apiRequestSystem, apiRequest } from "../../../../helpers/apicall.mjs";
import PassGen from "../../../../helpers/passGen.mjs";
import { followUser } from "../../../../hooks/userHooks.mjs";
import { getWallets } from '../../../../helpers/auth.mjs';

// ********************* //
// Team Accounts
// ********************* //
const teamAccounts = [
  "097839b3-aa4a-4e48-83c6-db737d619c59", // Maz
  "584bea91-d834-4282-a22f-97e384f9f795", // Tom
  "7c883aca-3e84-4766-8a03-6bc3bd1b654d", // Fagner
  "fc11abe6-e8ed-4092-9ccf-1f5e3325e56c", // Eric
  "277e79a6-713d-4d57-8bdf-86edc7f5309d", // Marcela
];

// ********************* //
// Get User Account
// ********************* //
export default async function getUserAccount({ data, address, cookie }) {
  try {
    const result = await getUser({ data, address });

    // set wallets
    if (cookie && !result?.[0]?.wallets?.length) {
      const wallets = await getWallets({ cookie });
      if (wallets.length > 0) {
        const walletsArr = wallets?.reduce((acc, { chain, address, pubKey }) => {
          acc[chain] = { address, pubKey };
          return acc;
        }, {});
        if (result.length > 0) {
          await setUserWallets({ wallets: walletsArr, id: result[0].id });
          console.log("syncing wallets");
          result[0]['wallets'] = walletsArr;
        } else {
          data['wallets'] = walletsArr;
        }
      }
    }
    return result.length > 0 ? result : await createUser({ data, address });
  } catch (error) {
    console.log(error);
  }
}

// ********************* //
// Update User Account
// ********************* //
export async function updateUserAccount({ user_id, data }) {
  try {
    const result = await axios({
      url: `${backendUrl}/graphql/system`,
      method: "post",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: {
        query: `
        mutation {
          update_users_item(id: "${user_id}", data: ${data}) {
            id
          }
        }
        `,
      },
    });
    return result.data.data.update_users_item;
  } catch (error) {
    console.log(error.response);
  }
}

// ********************* //
// Create User Function
// Create Account
// ********************* //
async function createUser({ data, address }) {
  try {
    // Generate Password
    const password = await PassGen();
    // Create User Account
    const response = await axios({
      url: `${backendUrl}/users`,
      method: "post",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: {
        first_name: data.displayName,
        email: `${data.profileId}@loop.fans`,
        sso_email: data.email,
        password: password,
        wallet_address: address,
        profile_id: data.profileId,
        role: fanRoleId,
      },
    });

    const { id: user_id } = response.data.data;

    /* try {
      await createContact({
        email: data.email,
        first_name: data.displayName,
      });
    } catch (error) {
      console.error("Error in createContact:", error);
    } */

    try {
      /* ================== */
      /* Follow Loop */
      /* ================== */
      await followUser({
        payment_flow: true,
        user_id: user_id,
        creator_id: "468650d0-9490-4b6f-9a01-ca2decaef689", // Loop Fans ID
      });

      /* ================== */
      /* Team Follow user */
      /* ================== */
      teamAccounts.map(async (teamMember) => {
        await followUser({
          payment_flow: true,
          user_id: teamMember,
          creator_id: user_id,
        });
      });
    } catch (error) {
      console.error("Error in followUser:", error);
    }

    return response.status === 200 ? await getUser({ data, address }) : null;
  } catch (error) {
    console.log({ error })
    return error;
  }
}

// ********************* //
// Get User Function
// ********************* //
async function getUser({ data, address }) {
  try {
    // Check if temp account exists
    const { users } = await apiRequestSystem(
      `query {
        users(filter: { sso_email: { _eq: "${data.email}" } }) {
          id
          email
        }
      }`
    );

    /* ================== */
    // Check if temp account, update to permanent account.
    /* ================== */
    if (users.length > 0 && !users[0].email) {
      // Generate Password
      const password = await PassGen();
      await updateUserAccount({
        user_id: users[0].id,
        data: `{
            first_name: "${data.displayName}",
            email: "${data.profileId}@loop.fans",
            sso_email: "${data.email}",
            password: "${password}",
            wallet_address: "${address}",
            profile_id: "${data.profileId}",
            role: "${fanRoleId}",
          },`,
      });
    }

    // User Account Data
    const response = await axios({
      url: `${backendUrl}/graphql/system`,
      method: "post",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: {
        query: `
        query {
          users(filter: {profile_id : {_eq: "${data.profileId}"}}) {
            id
            role
            first_name
            display_name
            username
            whatsapp
            sso_email
            profile_id
            uchat_id
            brevo_id
            mixpanel
            avatar {
              id
            }
            onboard
            wallet_address
            wallets
            wallet {
              id
              tokens
              value
            }
          }
        }
        `,
      },
    });

    // Create user Array
    const userInfo = [];
    // Sort user and push to array
    response.data.data.users.map(async (user) => {
      userInfo.push({
        id: user.id,
        role: user.role,
        profile_id: user.profile_id,
        avatar: user.avatar?.id ? user.avatar?.id : false,
        //email: user.sso_email,
        first_name: user.first_name,
        display_name: user.display_name,
        username: user.username,
        onboard: user.onboard || false,
        wallet_address: user.wallet_address,
        wallet: {
          tokens: user?.wallet[0]?.tokens ?? 0,
          value: user?.wallet[0]?.value ?? 0
        },
        wallets: user?.wallets,
      });

      // user.wallet_address does not start with loop1
      if (!user.wallet_address.startsWith("loop1")) {
        await updateUserAccount({
          user_id: user.id,
          data: `{ wallet_address: "${address}" }`,
        });
      }
    });

    return response.status === 200 ? userInfo : null;
  } catch (error) {
    return error;
  }
}


// ********************* //
// Set User Wallets
// ********************* //
async function setUserWallets({ wallets, id }) {
  try {
    // update User Wallets
    const response = await axios({
      url: `${backendUrl}/users/${id}`,
      method: "patch",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: {
        wallets
      },
    });
    if (response.status === 200) {
      return response.data.data;
    }

    return null;
  } catch (error) {
    console.log({ error })
    return error;
  }
}