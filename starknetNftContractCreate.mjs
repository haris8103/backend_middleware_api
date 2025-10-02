import fs from "fs"
import dotenv from "dotenv";
import axios from "axios";
import { hash, RpcProvider, Account, CallData, PaymasterRpc, json, constants, stark } from 'starknet';
import { DirectSecp256k1HdWallet, coins } from "@cosmjs/proto-signing";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";



const provider = new RpcProvider({
  nodeUrl: process.env.STARKNET_RPC
});

const paymasterRpc = new PaymasterRpc({
  nodeUrl: process.env.STARKNET_PAYMASTER_URL,
  headers: { "x-paymaster-api-key": process.env.STARKNET_PAYMASTER_KEY },
});



const deployContract = async () => {

  const res = await axios.get(
    `${process.env.DIRECTUS_BACKEND}/items/fans_launchpad?filter[project_status][_eq]=upcoming&filter[status][_eq]=published&filter[_or][0][launchpad_type][fan_collection][starknet_address][_eq]=false&filter[_or][1][launchpad_type][fan_collection][address][_eq]=false&fields=*,launchpad_type.fan_collection.*,launchpad_type.fan_collection.fans_launchpad_type.*&limit=2`,
  );
  const launchpads = res.data.data;

  if (!launchpads || launchpads.length <= 0 ) {
    console.log("No launchpad to instantiate");
    return;
  }
  
  for (let launchpad of launchpads) {
    for (let launchpad_type of launchpad.launchpad_type) {
      let addressDeploy = "";
      try {
        let collection = launchpad_type.fan_collection
        let name = collection.name;
        let symbol = collection.name.substring(0, 4);
        if (collection.starknet_address == "false") {
          const account = new Account({
            provider: provider,
            address: process.env.STARKNET_WALLET_ACCOUNT_ADDRESS,
            signer: process.env.STARKNET_WALLET_PRIVATE_KEY,
            paymaster: paymasterRpc,
          });


          const compiledTestSierra = json.parse(
            fs.readFileSync('./loop_nft_LoopNft.contract_class.json').toString('ascii')
          );

          const classHash = process.env.STARKNET_NFT_CLASSHASH;
          const contractCallData = new CallData(compiledTestSierra.abi);
          const contractConstructor = contractCallData.compile('constructor', {
            name: name,
            symbol: symbol,
            base_uri: '',
            admin: process.env.STARKNET_WALLET_ACCOUNT_ADDRESS
          });
          const feesDetails = {
            feeMode: { mode: 'sponsored' },
          };
          const salt = stark.randomAddress();
          addressDeploy = hash.calculateContractAddressFromHash(salt, classHash, contractConstructor, 0);
          console.log("Calculated address =", addressDeploy);
          const myCall = {

            contractAddress: constants.UDC.ADDRESS,
            entrypoint: constants.UDC.ENTRYPOINT,
            calldata: CallData.compile({
              classHash: classHash,
              salt: salt,
              unique: "0",
              calldata: contractConstructor,
            }),
          };


          const deployResponse = await account.executePaymasterTransaction([myCall], feesDetails);

          await provider.waitForTransaction(deployResponse.transaction_hash);

          console.log('Contract Transaction Hash =', deployResponse.transaction_hash);
          console.log('Contract connected at =', addressDeploy);
        } else {
          const wallet = await DirectSecp256k1HdWallet.fromMnemonic(process.env.LOOP_ADMIN_SEED, {
              prefix: process.env.LOOP_PREFIX,
            });
            const sender = await wallet.getAccounts().then((res) => {
              return res[0]?.address;
            });
            
            const client = await SigningCosmWasmClient.connectWithSigner(
              process.env.LOOP_RPC,
              wallet
            );
          let data = {
            name,
            symbol,
            minter: sender, //2959,
            royalty_bps: [], // 10%
            royalty_addrs: [],
          };
          const { contractAddress } = await client.instantiate(
            sender,
            uploadReceipt.codeId,
            data,
            "Init NFT Minter",
            0,
            {
              memo: `NFT MInter`,
              admin: sender,
            }
          );

          console.log("Contract Address : ", contractAddress);
          addressDeploy = contractAddress;
        }
        const address = collection.starknet_address != "false" ? `address: {_eq: "${addressDeploy}"}` : `starknet_address: {_eq: "${addressDeploy}"}`;
          let query = `
          mutation {
            update_fans_collections_item(
              id: "${collection.id}",
              data: {
                starknet_address: "${addressDeploy}"

              }
            ) {
              id
            }
          }
        `
          console.log(query)
          let response = await axios({
            url: `${process.env.DIRECTUS_BACKEND}/graphql`,
            method: "post",
            headers: { Authorization: `Bearer ${process.env.BACKEND_API_KEY}` },
            data: { query },
          });

                  query = `
          mutation {
            update_fans_launchpad_item(
              id: "${launchpad.id}",
              data: {
                project_status: "live"
                
              }
            ) {
              id
            }
          }
        `
          console.log(query)
          response = await axios({
            url: `${process.env.DIRECTUS_BACKEND}/graphql`,
            method: "post",
            headers: { Authorization: `Bearer ${process.env.BACKEND_API_KEY}` },
            data: { query },
          });
          // console.log(response.data)
          response.data.data;
        
      } catch (error) {
        console.log(error)
      }
    }
  }

}



deployContract()