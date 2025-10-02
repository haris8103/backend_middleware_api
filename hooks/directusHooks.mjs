import axios from "axios";
import { backendUrl, backendApiKey } from "../helpers/constants.mjs";
import { followUser } from "./userHooks.mjs";
import * as uchat from "../helpers/uchat.mjs";
import { apiRequest, apiRequestSystem } from "../helpers/apicall.mjs";
import { MintCosmosNft, MintStarknetNft } from "../views/minter/index.mjs"



// ********************* //
// Get Payment ID
// ********************* //
export async function getPaymentId({ wallet_addr, launchpad_id }) {
  const result = await axios.get(
    `${backendUrl}/items/payment_history?filter[payment_status][_eq]=pending&filter[wallet_addr][_eq]=${wallet_addr}&filter[launchpad_id][id][_eq]=${launchpad_id}&fields=*.*`
  );
  return result.data?.data.map(({ payment_id }) => payment_id)[0];
}

// ********************* //
// Check if user is following creator after purchase
// ********************* //
export async function followCreator({ launchpad_id, user }) {
  try {
    const res = await axios.get(
      `${backendUrl}/items/fans_launchpad/${launchpad_id}`
    );
    const user_id = user;
    const creator_id = res.data.data.artist;

    // Check if user is following creator
    await followUser({ payment_flow: true, user_id, creator_id });

    console.log("User is now following the creator");
  } catch (err) {
    console.error("Error in followCreator:", err.message);
    // Handle the error or throw it again if needed
  }
}

// ********************* //
// Update Payment Event
// ********************* //
export async function updatePaymentEvent({
  payment_id,
  transaction_id,
  status,
  reference,
}) {
  const getId = await axios.get(
    `${backendUrl}/items/payment_history?filter[payment_id][_eq]=${payment_id}`,
    {
      payment_id: payment_id,
    },
    {
      headers: {
        Authorization: `Bearer ${backendApiKey}`,
      },
    }
  );

  const id = getId.data?.data.map(({ id }) => id)[0];
  const user_id = getId.data?.data.map(({ user }) => user)[0];
  const wallet_address = getId.data?.data.map(
    ({ wallet_addr }) => wallet_addr
  )[0];
  const launchpad_id = getId.data?.data.map(
    ({ launchpad_id }) => launchpad_id
  )[0];

  const collection_addr = getId.data?.data.map(
    ({ collection_addr }) => collection_addr
  )[0];

  const number_of_nfts = getId.data?.data.map(
    ({ number_of_nfts }) => number_of_nfts
  )[0];

  if (id) {
    const result = await axios.patch(
      `${backendUrl}/items/payment_history/${id}`,
      {
        payment_status: status,
        transaction_id: transaction_id,
        reference: reference,
      },
      {
        headers: {
          Authorization: `Bearer ${backendApiKey}`,
        },
      }
    );

    // Follow creator if payment is approved
    try {
      if (status === "APPROVED") {
        await followCreator({ launchpad_id, user: user_id });

        // Get uChat Tag
        const launchpad = await axios({
          url: `${backendUrl}/graphql`,
          method: "post",
          headers: { Authorization: `Bearer ${backendApiKey}` },
          data: {
            query: `
            query {
              fans_launchpad (
                filter: { id: { _eq: "${launchpad_id}" } }
              ) {
                uchat_tag
              }
            }                   
              `,
          },
        });

        const uchat_tag = launchpad.data.data.fans_launchpad[0].uchat_tag;
        if (uchat_tag) {
          // Get User uChat ID
          const fetchUser = await axios({
            url: `${backendUrl}/graphql/system`,
            method: "post",
            headers: { Authorization: `Bearer ${backendApiKey}` },
            data: {
              query: `
              query {
                users(
                  filter: { wallet_address: {_eq: "${wallet_address}"} }
                ) {
                  uchat_id
                }
              }                  
                `,
            },
          });

          // uChat ID
          const uchat_id = fetchUser.data.data.users[0].uchat_id;

          // Add uChat Tag
          if (uchat_id) {
            if (uchat_tag) {
              await uchat.addTag({ user_ns: uchat_id, tag_name: uchat_tag });
            } else {
              await uchat.TriggerFlow({
                user_ns: uchat_id,
                sub_flow_ns: "f74609s459621",
              });
            }
          }
        }
      }

      const query_fans_collections = `
        query{
          fans_collections(filter: {starknet_address: {_eq: "${collection_addr}"}}) {
            id
          }
        }
      `

      const { fans_collections: fc } = await apiRequest(query_fans_collections);

      if (fc?.[0]?.id) {
        let query_fetch_starknet_address = `
              {
                users(
                  filter: { wallet_address: {_eq: "${wallet_address}"} }
                ) {
                  wallets
                }
              }                  
            `
        const { users: user_wallets } = await apiRequestSystem(query_fetch_starknet_address);

        if (!user_wallets || !user_wallets[0] || !user_wallets[0].wallets || !user_wallets[0].wallets.starknet || !user_wallets[0].wallets.starknet.address || !user_wallets[0].wallets.starknet.pubKey) {
          console.log("starknet wallet not found");
          throw Error("starknet wallet not found");
        }
        // console.log(user_wallets[0].wallets.starknet.address, user_wallets[0].wallets.starknet.pubKey)
        try {
          const response = await MintStarknetNft(collection_addr, user_wallets[0].wallets.starknet.address, user_wallets[0].wallets.starknet.pubKey, "starknet", "paid_claim", transaction_id, number_of_nfts)
          result.data['mint_msg'] = response;
        } catch (error) {
          result.data['mint_error'] = error.message;
        }
      } else {
        
        // console.log(user_wallets[0].wallets.starknet.address, user_wallets[0].wallets.starknet.pubKey)
        try {
          const response = await MintCosmosNft(collection_addr, wallet_address, null, "loop", "paid_claim", transaction_id, number_of_nfts)
          result.data['mint_msg'] = response;
        } catch (error) {
          result.data['mint_error'] = error.message;
        }
      }

    } catch (error) {
      // Handle the error or throw it again if needed
      console.error("Error following creator:", error);
    }

    return result.data;
  }
}

// ********************* //
// Save Payment ID (if not in database)
// ********************* //
export async function savePaymentId({
  wallet_addr,
  user,
  launchpad_id,
  collection_addr,
  payment_id,
  expires_at,
  number_of_nfts,
  payment_amount,
  payment_asset,
  provider,
  document_id,
  referral,
  clientSecret
}) {
  const result = await axios.post(
    `${backendUrl}/items/payment_history`,
    {
      payment_id,
      payment_status: "pending",
      payment_provider: provider,
      wallet_addr: wallet_addr,
      user: user,
      number_of_nfts: number_of_nfts,
      payment_amount: payment_amount,
      payment_asset: payment_asset,
      collection_addr: collection_addr,
      launchpad_id: launchpad_id,
      document_id: document_id,
      referral: referral,
      expires_at: expires_at,
      stripeClientSecret: clientSecret
    },
    {
      headers: {
        Authorization: `Bearer ${backendApiKey}`,
      },
    }
  );
  //console.log(result.data);
  return result.data;
}
