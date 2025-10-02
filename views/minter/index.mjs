import Router from "koa-router";
import axios from "axios";
import dotenv from "dotenv";
import fs from 'fs';
import { DirectSecp256k1HdWallet, coins } from "@cosmjs/proto-signing";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { toUtf8 } from "@cosmjs/encoding";
import * as crypto from "crypto";
dotenv.config();

import {
  backendApiKey,
  backendUrl,
  STARKNET_RPC,
  STARKNET_PAYMASTER_KEY,
  STARKNET_PAYMASTER_URL,
  STARKNET_WALLET_ACCOUNT_ADDRESS,
  STARKNET_WALLET_PRIVATE_KEY,
  STARKNET_WALLET_CLASSHASH,
  LOOP_ADMIN_SEED,
  LOOP_PREFIX,
  LOOP_RPC,
  COSMOS,
  STARKNET,
  LOOP_SECRET_KEY,
  LOOP_DENOM,
} from "../../helpers/constants.mjs";

import authCheck from "../../helpers/auth.mjs";
import { apiRequest, apiRequestSystem } from "../../helpers/apicall.mjs";
import { followCreator } from "../../hooks/directusHooks.mjs";
import { useMixpanel } from "../../helpers/mixpanel.mjs";
import checkCookie from "../../helpers/auth.mjs";
import e from "express";
import { getFieldByUserId } from "../../helpers/userAccount.mjs";
import { triggerEmail } from "../../helpers/brevoSdk.mjs";
import { RpcProvider, PaymasterRpc, Account, Contract, json } from "starknet"
import { Directus } from "@directus/sdk";
import { info } from "console";
const { sendMixpanel } = useMixpanel();

const router = new Router();
const BASE_URL = `/v1/minter`;

const provider = new RpcProvider({
  nodeUrl: STARKNET_RPC
});
const paymasterOptions = {
  nodeUrl: STARKNET_PAYMASTER_URL,
};


paymasterOptions.headers = {
  "x-paymaster-api-key": STARKNET_PAYMASTER_KEY
};

const paymasterRpc = new PaymasterRpc(paymasterOptions);

const MintFreeNFT = async ({ type, query, user_id, bypass_claim_check }) => {
  query.bypass_claim_check = bypass_claim_check;
  const address = query.collection_addr ? `address: {_eq: "${query.collection_addr}"}` : `starknet_address: {_eq: "${query.starknet_address}"}`;
  console.log(address)
  return await axios({
    url: `${backendUrl}/graphql`,
    method: "post",
    headers: { Authorization: `Bearer ${backendApiKey}` },
    data: {
      query: `
        query {
          fans_launchpad(
            filter: { launchpad_type: { fan_collection: { ${address} } } }
          ) {
            id
            project_name
            mint_status
            collection_type
            launchpad_type {
              launchInfo {
                mintPrice
                minPrice
                is_free
              }
            }
          }
        }                  
          `,
    },
  }).then(async (res) => {
    const {
      project_name,
      mint_status,
      id: launchpad_id,
      collection_type,
      launchpad_type: {
        0: {
          launchInfo: { mintPrice, minPrice },
        },
      },
    } = res.data.data.fans_launchpad[0];
    // Checking Minting Status
    
    const minPrice1 = (!minPrice || minPrice === "null") ? "0" : minPrice;
    console.log(mintPrice)
    const mint_price = 0;
    const mint_active = mint_status === "active";

    let result = null;
    if (mint_active && mint_price === 0) {
      if (query.starknet_address) {
        result = MintStarknetNft(query.starknet_address, query.recipient, query.pubKey, query.type_name, type, undefined, "1")
      } else {
        result = MintCosmosNft(query.collection_addr, query.recipient, query.pubKey, query.type_name, type, undefined, "1")
      }
      await result.then(async (res) => {
        /* ================== */
        /* Follow Creator */
        /* ================== */
        await followCreator({
          launchpad_id: launchpad_id,
          user: user_id,
        });

        /* ================== */
        /* Mixpanel Tracking */
        /* ================== */
        await sendMixpanel({
          event: "NFT Minted",
          data: {
            distinct_id: user_id,
            event_name: `NFT Minted -> ${collection_type}`,
            type: `Free Claim -> ${collection_type}`,
            collection_address: query.collection_addr,
            recipient: query.recipient,
          },
        });

        /* ================== */
        /* Trigger Email */
        /* ================== */
        const { sso_email, username, first_name } = await getFieldByUserId({
          user_id: user_id,
          fields: "sso_email, first_name, username, id",
        });
        // Send Email to FAN
        await triggerEmail({
          email: sso_email,
          name: username ?? first_name,
          templateId: 99,
          params: {
            collection_name: project_name,
            return_url: `https://www.loop.fans/user/${user_id || username
              }?tab=nfts`,
          },
        });

        return { mintMessage: res.data, mintStatus: 200 };
      })
        .catch((err) => {
          console.log(err);
          return {
            mintMessage: err.message,
            mintStatus: 500,
          };
        });
    }
  });
};

// ********************* //
// Mint NFT
// ********************* //
router.post(`${BASE_URL}/mint`, async (ctx) => {
  const { type, query } = ctx.request.body;
  console.log('query', query);

  try {
    if (type && query) {
      // Check if user is authenticated
      const userData = await checkCookie({ cookie: query.cookie });
      // Fetch User Data
      const { users: user } = await apiRequestSystem(`
        query {
          users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
            id
          }
        }
      `);


      const { id: user_id } = user[0];

      if (type === "free_claim") {
        query['user_id'] = user_id;
        const { mintMessage, mintStatus } = await MintFreeNFT({
          type,
          query,
          user_id,
          bypass_claim_check: false,
        });
        console.log({ mintMessage, mintStatus });
        ctx.status = mintStatus;
        ctx.body = mintMessage;
        return;
      }
    }
  } catch (err) {
    ctx.status = err.response.status;
    //ctx.body = err.response.data;
    ctx.body = err.response.data;
    // Log Error with query for debugging
    /* await logtail.error(
      `${err.response.data} -> Address: ${query?.recipient} -> Contract: ${query?.collection_addr}`
    ); */

    return;
  }
});

// ********************* //
// Check Claim Code
// ********************* //
router.post(`${BASE_URL}/claimNft`, async (ctx) => {
  const { code, query } = ctx.request.body;
  const mixpanelClaimEvent = async ({ event, user_id, query }) => {
    try {
      // Send Mixpanel Event
      await sendMixpanel({
        event: event,
        data: {
          distinct_id: user_id,
          event_name: event,
          type: `Claim`,
          collection_address: query.collection_addr,
          recipient: query.recipient,
        },
      });
    } catch (err) {
      console.log(err);
    }
  };

  try {
    // Check if user is authenticated
    const userData = await checkCookie({ cookie: query.cookie });
    // Fetch User Data
    const { users: user } = await apiRequestSystem(`
    query {
      users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
        id
      }
    }
  `);

    const { id: user_id } = user[0];

    if (!code) {
      ctx.status = 400;
      ctx.body = { message: "Invalid Claim Code" };

      await mixpanelClaimEvent({
        event: `Invalid Claim Code`,
        user_id: user_id,
        query: query
      });
      return;
    }

    const { collection_claim_codes: claimCodeData } = await apiRequest(`
      query {
        collection_claim_codes(
          filter: {
            code: { _eq: "${code}" }
          }
        ) {
          id
          code
          status
          collection {
            address
          }
        }
      }
    `);

    // check if claimCode belongs to another collection
    if (
      claimCodeData.length > 0 &&
      claimCodeData[0].collection.address !== query.collection_addr
    ) {
      ctx.status = 400;
      ctx.body = { code: 1, message: "Invalid Collection Code" };

      await mixpanelClaimEvent({
        event: `Invalid Collection Code`,
        user_id: user_id,
        query: query
      });
      return;
    }

    if (!claimCodeData || claimCodeData.length === 0) {
      ctx.status = 400;
      ctx.body = { code: 3, message: "Invalid Claim Code" };

      // Send Mixpanel Event
      await mixpanelClaimEvent({
        event: `Invalid Claim Code`,
        user_id: user_id,
        query: query
      });
      return;
    }

    const { id: claimId, status } = claimCodeData[0];

    if (status === "claimed") {
      ctx.status = 400;
      ctx.body = { code: 2, message: "Already Claimed" };

      // Send Mixpanel Event
      await mixpanelClaimEvent({
        event: `NFT Already Claimed`,
        user_id: user_id,
        query: query
      });
      return;
    }

    // Mint NFT and send to wallet
    const { mintMessage, mintStatus } = await MintFreeNFT({
      type: "free_claim",
      query: query,
      user_id: user_id,
      bypass_claim_check: true,
    });

    if (mintStatus === 200) {
      // update claim code status
      await apiRequest(`
        mutation {
          update_collection_claim_codes_item(id: "${claimId}", data: {
            status: "claimed"
          }) {
            id
          }
        }
      `);
    }

    // Send Mixpanel Event
    await mixpanelClaimEvent({
      event: `NFT Claimed`,
      user_id: user_id,
      query: query
    });
    ctx.status = mintStatus;
    ctx.body = mintMessage;
    return;
  } catch (err) {
    ctx.status = err.response.status;
    //ctx.body = err.response.data;
    ctx.body = { code: 3, message: err.response.data };
    // Log Error with query for debugging
    /* await logtail.error(
      `${err.response.data} -> Address: ${query?.recipient} -> Contract: ${query?.collection_addr}`
    ); */
    return;
  }
});

// ********************* //
// Load Redeemable for NFT
// ********************* //
router.get(`${BASE_URL}/redeemables/:nft_id`, async (ctx) => {
  const { nft_id } = ctx.params;
  const { cookie, address } = ctx.query;
  try {
    // Check Auth
    const auth = await authCheck({ cookie });
    // Check NFT Owner
    const { fans_nfts: fans_nfts } = await apiRequest(`
      query {
        fans_nfts(
          filter: {
            id: { _eq: "${nft_id}" }
            owner: { _eq: "${address}" }
          }
        ) {
          id
          owner
          token_id
        }
      }
    `);

    if (!fans_nfts || fans_nfts.length === 0) {
      throw new Error("NFT not found or you are not the owner");
    }

    const { owner, token_id: id } = fans_nfts[0];
    const isOwnerBool = owner === address;

    if (auth && isOwnerBool) {
      // Get Redeemables
      const { redeemables: redeemables } = await apiRequest(`
        query {
          redeemables(
            filter: {
              nft_id: { _eq: "${id}" }
            }
          ) {
            id
            collection_id
            nft_id
            rfc_id
            qr_hash
          }
        }
      `);
      const { collection_id } = redeemables[0];

      // Get Redeemable Info
      const { redeemables_for_collection: redeemables_for_collection } =
        await apiRequest(`
        query {
          redeemables_for_collection(
            filter: {
              collection_id: { _eq: "${collection_id}" }
            }
          ) {
            id
            name
            description
            image_url
        }
      }
      `);

      // Create Redeemable List
      const list = redeemables.map((item, index) => {
        const { name, description, image_url } =
          redeemables_for_collection[index];
        return {
          id: item.id,
          collection_id: item.collection_id,
          nft_id: item.nft_id,
          rfc_id: item.rfc_id,
          qr_hash: item.qr_hash,
          name,
          description,
          image_url,
        };
      });

      ctx.status = 200;
      ctx.body = list;
      return;
    }

    ctx.status = 400;
    ctx.body = "You are not the owner of this NFT";
    return;
  } catch (err) {
    ctx.status = err.response.status;
    ctx.body = "There was an error loading redeemable: Redeemable Error";
    return;
  }
});

// ********************* //
// Redeem Redeemable for NFT
// ********************* //
router.post(`${BASE_URL}/redeem`, async (ctx) => {
  try {



    let response = await axios.get(
      `${backendUrl}/users/me`,
      {
        headers: {
          Authorization: `Bearer ${ctx.request.body.access_token}`,
        },
      }).then(async response => {
        const { user_info: userInfo } = response.data.data;
        const fan_merchant_query = `
          query {
                fan_merchants(
                    filter: {
                        merchant: { id: { _eq: "${userInfo.id}" } }
                    }
                ) {
                    merchant {
                        id
                        first_name
                    }
                    creators {
                        directus_users_id {
                            id
                        }
                    }
                }
            }  
        `;
        const { fan_merchants: fan_merchants } = await axios({
          url: `${backendUrl}/graphql`,
          method: "post",
          headers: { Authorization: `Bearer ${backendApiKey}` },
          data: { fan_merchant_query },
        }).then(response => {
          return response.data.data;
        })
        if (!fm[0]) {
          ctx.status = 500;
          ctx.body = "Merchant not found";
          return;
        }

        let creatorsIds = fan_merchants.creators.map(directus_user => directus_user.id).join(",");
        const allowed_collections_query = `
          query {
                fans_launchpad(
                    filter: {
                        artist: { id: { _in: "${creatorsIds}" } }
                    }
                ) {
                    id
                    status
                    mint_status
                    collection_type
                    project_name
                    project_slug
                    launchpad_type {
                        fan_collection  {
                            name
                            artist {
                                first_name
                                avatar {
                                    id
                                }
                            }
                        }
                        launchInfo {
                            NFT
                            maxSupply
                            mint_limit
                        }
                    }
                }
            }
        `
        const { fans_launchpad: allowed_collections } = await axios({
          url: `${backendUrl}/graphql`,
          method: "post",
          headers: { Authorization: `Bearer ${backendApiKey}` },
          data: { allowed_collections_query },
        }).then(response => {
          return response.data.data;
        })
      
    if (!allowed_collections.contains(ctx.request.body.collection_addr)) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const redeemable_by_qr = `
          query {
                redeemables(
                    filter: {
                        qr_hash: { _eq: "${ctx.request.body.qr_hash}" } 
                    }
                ) {           
                    id
                    collection_id
                    qr_hash
                    nft_id
                    redeemed_at
                    rfc_id
                  }
          }
        `
    const { redeemables: redeemables } = await axios({
      url: `${backendUrl}/graphql`,
      method: "post",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: { redeemable_by_qr },
    }).then(response => {
      return response.data.data;
    })
    if (!redeemables?.[0]) {
      ctx.status = 500;
      ctx.body = `Redeemable not found`;
      return;
    } else if (redeemables?.[0]?.redeemed_at) {
      ctx.status = 200;
      ctx.body = `"redeemed": ${false}, "reason": "Already redeemed.", "redeemed_at": ${redeemables[0].redeemed_at.redeemed_at}`;
      return;
    }
    const address = ctx.request.body.collection_addr ? `address: {_eq: "${ctx.request.body.collection_addr}"}` : `starknet_address: {_eq: "${ctx.request.body.starknet_address}"}`;

    const collection_query = `
          query{
            fans_collections(
              filter: { ${address}}
            ) {
              id
            }
          }
        `
    const { fans_collections: fc } = await apiRequest(collection_query);
    if (!fc?.[0]) {
      ctx.status = 500;
      ctx.body = `Collection not found`;
      return;
    } else if (fc[0].id != redeemables[0].collection_id) {
      ctx.status = 500;
      ctx.body = `Wrong Collection`;
      return;
    }
    const dateTime = new Date().toISOString()
    const query_update_redeemables = `
          mutation {
            update_redeemables_item(id: "${redeemables[0].id}", data: {
            redeemed_at: ${dateTime}
          }) {
            id
          }
        `
    await apiRequest(query_update_redeemables);
    ctx.status = 200;
    ctx.body = `"redeemed": ${true}`;
    return;
  })
  } catch (error) {
    ctx.status = 500;
    ctx.body = `error in redeeming msg: ${error}`;
    return;
  }
});




export const MintStarknetNft = async (contract_address, recipient, pubKey, type_name, type, transaction_id, number_of_nfts) => {
  let data = {};

  const fc = await checkClaimingNftValidity(contract_address, recipient, type, transaction_id, STARKNET);

  const account = new Account({
    provider: provider,
    address: STARKNET_WALLET_ACCOUNT_ADDRESS,
    signer: STARKNET_WALLET_PRIVATE_KEY,
    cairoVersion: "1",
    paymaster: paymasterRpc,
  });
  let deploymentData = null;
  await provider.getClassHashAt(recipient).catch(async (err) => {
    if (err.baseError.code == 20) {
      console.log("Wallet not deployed so deploying the wallet....")

      deployAccountPayload = {
        address: recipient,
        class_hash: STARKNET_WALLET_CLASSHASH,
        salt: pubKey,
        calldata: [
          pubKey,
        ],
        version: 1
      };

      deploymentData = { ...deployAccountPayload, version: 1 };
    } else {
      console.log(JSON.stringify(err));
      throw Error(JSON.stringify(err))
    }
  });

  const calls = [];
  for (let i = 0; i < parseInt(number_of_nfts); i++) {
    calls.push({
      entrypoint: "mint",
      contractAddress: contract_address, // starknet contract
      calldata: [
        recipient, // recipient
      ],
    });
  }

  const feesDetails = {
    deploymentData,
    feeMode: { mode: 'sponsored' },
  };

  console.log(feesDetails)
  const res = await account.executePaymasterTransaction(calls, feesDetails);
  console.log('Waiting for NFT mint transaction confirmation...');
  const txR = await provider.waitForTransaction(res.transaction_hash);
  console.log("Tx hash:", res.transaction_hash);

  const compiledSierraClass = json.parse(
    fs.readFileSync('./loop_nft_LoopNft.contract_class.json').toString('ascii')
  );


  const contract = new Contract({ abi: compiledSierraClass.abi, address: contract_address, });

  let parsedE = contract.parseEvents(txR)
  let token_ids = [];
  for (let i = 0; i < calls.length; i++) {
    token_ids.push(parsedE[i]['openzeppelin_token::erc721::erc721::ERC721Component::Transfer'].token_id)
  }
  await updateClaimedNFTDetails(fc[0], contract_address, token_ids, res.transaction_hash, recipient, type_name, type, transaction_id);
  data['tx_hash'] = res.transaction_hash;
  data['collection_addr'] = contract_address;
  data['minted_ids'] = token_ids.toString();
  return { data: data };
}

export const MintCosmosNft = async (contract_address, recipient, pubKey, type_name, type, transaction_id, number_of_nfts) => {
  let data = {};
  console.log("HEKKO")
  const fc = await checkClaimingNftValidity(contract_address, recipient, type, transaction_id, COSMOS);
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(LOOP_ADMIN_SEED, {
    prefix: LOOP_PREFIX,
  });
  const sender = await wallet.getAccounts().then((res) => {
    return res[0]?.address;
  });
  console.log(sender);
  const client = await SigningCosmWasmClient.connectWithSigner(
    LOOP_RPC,
    wallet
  );
  const response = await axios.get(
    `${backendUrl}/items/fans_nfts?filter[collection][id][_eq]=${fc[0].id}&filter[mint_tx][_nnull]&sort=-id&limit=1&fields=*,collection.id`,
    {
      headers: {
        Authorization: `Bearer ${backendApiKey}`,
      },
    }
  );
  
  
  let token_id = parseInt(response?.data?.data?.[0]?.token_id ? response.data.data[0].token_id : 0);
  console.log(token_id)
  const transactions = [];
  let token_ids = [];
  for (let i = 0; i < parseInt(number_of_nfts); i++) {
    token_id++;
    token_ids.push(token_id)
    const name = fc.name + " #" + token_id;
    transactions.push({
      typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
      value: {
        sender,
        msg: toUtf8(
          JSON.stringify({
            mint: {
              token_id: name,
              owner: recipient,
              extension: {
                tier_index: null,
                attributes: null,
                token1: null,
                token2: null,
                vesting_period: null,
                image: fc[0].banner.id,
                image_data: null,
                external_url: null,
                description: fc[0].description,
                name,
                background_color: null,
                animation_url: null,
                youtube_url: null
              },
              token_uri: null
            },
          })
        ),
        contract: contract_address,
        funds: [],
      },
    });
  }

  const estimate = await client.simulate(sender, transactions, "");
  let lowestPrice = Math.floor(estimate / 10);
  console.log(estimate);
    let tx = await client.signAndBroadcast(sender, transactions, {
    amount: coins(lowestPrice, LOOP_DENOM),
    gas: Math.floor(estimate * 1.3).toString(),
  });

  console.log(tx.transactionHash)


  await updateClaimedNFTDetails(fc[0], contract_address, token_ids, tx.transactionHash, recipient, type_name, type, transaction_id);
  await createRedeemableForNft(fc[0], recipient, contract_address, token_id);
  data['tx_hash'] = tx.transactionHash;
  data['collection_addr'] = contract_address;
  data['minted_ids'] = token_ids.toString();
  return { data: data };
};

const checkClaimingNftValidity = async (contract_address, recipient, type, transaction_id, chain) => {

  const address_query = chain === COSMOS ? "address" : "starknet_address";

  const fetchFansCollectionQuery = `
      query {
        fans_collections(filter: {
          ${address_query}: {
            _eq: "${contract_address}"
          }
        }) {
          id
          name
          description
          banner{
            id
          }
        }
      }
    `;



  const { fans_collections: fc } = await apiRequest(fetchFansCollectionQuery);


  if (type == "free_claim") {



    const { nft_free_claims: nfc } = await apiRequest(`
    query {
        nft_free_claims(filter: {
        address:{_eq: "${recipient}"} 
        collection_id: {_eq: "${fc[0].id}"}
        }
      ) {
        id
      }
    }
  ` );

    if (nfc?.[0]?.id) {
      // throw Error("Already claimed.")
    }

  } else {


    const { nft_paid_claims: nfp } = await apiRequest(`
    query {
        nft_paid_claims(filter: {
        transaction_id: {_eq: "${transaction_id}"} 
        }
      ) {
        id
      }
    }
  `);

    if (nfp?.[0]?.id) {
      throw Error("Already claimed.")
    }

  }
  return fc
}

const updateClaimedNFTDetails = async (fc, contract_address, tokenIds, txHash, recipientAddress, typeName, type, transaction_id) => {

  let create_data = [];
  for (let tokenId of tokenIds) {
    const name = fc.name + " #" + tokenId;
    create_data.push(`{
        name: "${name}",
        collection: { id: "${fc.id}"},
        token_id: "${tokenId}",
        description: "${fc.description}",
        image: "${fc.banner.id}",
        owner: "${recipientAddress}",
        mint_tx: "${txHash}",
      }`)
  }
  const create_fans_nfts_query = `
        mutation {
          create_fans_nfts_items(
            data: [${create_data}]
          ) {
            id
          }
        }
      `
  console.log(create_fans_nfts_query)

  await apiRequest(create_fans_nfts_query);

  let create_nft_claims_query = "";
  if (type === "free_claim") {
    create_nft_claims_query = `
      mutation {
        create_nft_free_claims_item(
          data: {
            collection_id: ${fc.id},
            address: "${recipientAddress}",
            type_name: "${typeName}",
          }
        ) {
          id
        }
      }
    `
  } else {
    create_nft_claims_query = `
      mutation {
        create_nft_paid_claims_item(
          data: {
            collection_id: ${fc.id},
            address: "${recipientAddress}",
            transaction_id: "${transaction_id}",
          }
        ) {
          id
        }
      }
    `
  }

  await apiRequest(create_nft_claims_query);
}

const createRedeemableForNft = async (fc, recipient, contract_address, token_id) => {
  let secret_key = LOOP_SECRET_KEY;
  let hasher = crypto.createHash('sha256');
  hasher.update(secret_key);
  hasher.update(contract_address);
  hasher.update(recipient);
  hasher.update(token_id);
  let response = await axios.get(
    `${backendUrl}/items/redeemables?filter[collection_id][_eq]=${fc.id}&filter[nft_id][_eq]=${token_id}`,
    {
      headers: {
        Authorization: `Bearer ${backendApiKey}`,
      },
    }
  );
  let redeemableNft = response?.data?.data?.[0];

  if (redeemableNft) {
    console.log(`Redeemable for NFT ${token_id} of collection ${fc.id} already exists`);
    return;
  }
  response = await axios.get(
    `${backendUrl}/items/redeemables_for_collection?filter[collection_id][_eq]=${fc.id}`,
    {
      headers: {
        Authorization: `Bearer ${backendApiKey}`,
      },
    }
  );
  let redeemableForCollection = response?.data?.data;
  if (!redeemableForCollection) {
    console.log(`No redeemables for collection ${fc.id}`);
    return;
  }
  let newRedeemables = [];

  for (let rfcIndex = 0; rfcIndex < redeemableForCollection.length; rfc++) {
    let redeemableForCollectionId = rfc.collection_id;
    let redeemable_amount = rfc.amount_per_nft;
    for (let n = 0; n < redeemable_amount; n++) {
      let hasherCopy = hasher;
      hasherCopy.update(n.toString());
      hasherCopy.update(rfc.name.clone());
      hasherCopy.update(rfcIndex.toString());
      let redeemableHash = hasher.digest('hex');
      let newRedeemable = `{
        collection_id: ${fc.id},
        nft_id: ${token_id},
        rfc_id: ${redeemableForCollectionId},
        qr_hash: "${redeemableHash}",
      }`;
      newRedeemables.push(newRedeemable);
    }
  }
  const create_redeemables_query = `
    mutation {
      (
        data: [${newRedeemables}]
      ) {
        id
      }
    }
  `

  await apiRequest(create_redeemables_query);
}

export default router;
