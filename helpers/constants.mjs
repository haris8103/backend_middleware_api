import { Directus } from "@directus/sdk";
import { Logtail } from "@logtail/koa";

export const useCookie = (_cookie) => {
  const cookieArray = _cookie.split(';');
  return cookieArray.find((c) => c.trim().startsWith("cookie="))?.split("=")[1];
};

export const logtail = new Logtail("xhFJ4xgkusA6nXQa1XRwYc15");
export const backendApiKey = process.env.BACKEND_API_KEY;
export const fansMarketApi = process.env.MINTER_API;
//export const fansMarketApi = "https://minter-api.loop.fans";
//export const fansMarketApi = "http://0.0.0.0:1337"; // Localhost
export const backendUrl =
  process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
export const directus = new Directus(backendUrl);
export const indexerUrl = "https://nft-backend.loop.fans";
export const uchat_url = process.env.UCHAT_API;
export const uchat_token = process.env.UCHAT_TOKEN;
export const STARKNET = "Starknet";
export const COSMOS = "COSMOS";
export const brevo_api = process.env.BREVO_API;
export const brevo_token = process.env.BREVO_TOKEN;
export const BREVO_API_KEY = process.env.BREVO_API_KEY || brevo_token;
export const STARKNET_RPC = process.env.STARKNET_RPC;
export const STARKNET_PAYMASTER_KEY = process.env.STARKNET_PAYMASTER_KEY;
export const STARKNET_PAYMASTER_URL = process.env.STARKNET_PAYMASTER_URL;
export const STARKNET_PAYMASTER_HEADER_KEY = process.env.STARKNET_PAYMASTER_HEADER_KEY;
export const STARKNET_NFT_CLASSHASH = process.env.STARKNET_NFT_CLASSHASH;
export const STARKNET_WALLET_ACCOUNT_ADDRESS = process.env.STARKNET_WALLET_ACCOUNT_ADDRESS;
export const STARKNET_WALLET_PRIVATE_KEY = process.env.STARKNET_WALLET_PRIVATE_KEY;
export const STARKNET_WALLET_CLASSHASH = process.env.STARKNET_WALLET_CLASSHASH;
export const LOOP_ADMIN_SEED = process.env.LOOP_ADMIN_SEED;
export const LOOP_PREFIX = process.env.LOOP_PREFIX;
export const LOOP_LCD = process.env.LOOP_LCD;
export const LOOP_RPC = process.env.LOOP_RPC;
export const LOOP_CHAIN_ID = process.env.LOOP_CHAIN_ID;
export const LOOP_GAS_PRICE = process.env.LOOP_GAS_PRICE;
export const LOOP_DENOM = process.env.LOOP_DENOM;
export const LOOP_CW721_CODE_ID = process.env.LOOP_CW721_CODE_ID;
export const LOOP_MINTER_CODE_ID = process.env.LOOP_MINTER_CODE_ID;
export const LOOP_SECRET_KEY = process.env.LOOP_SECRET_KEY;

export const creator_role = "cd70c6cd-0266-4b9c-a42e-eaf0a482f417";

export const fanRoleId = "21052289-c845-44bf-8be0-2bc9ea7cbc1f";

export const cacheExpiration = 3600 * 24; /* 60 Minutes */
export const paymentExpiration = 30 * 60000; /* 30 Minutes */

export const default_host = "app.loop.fans";
export const gethostCreatorRole = (host) => {
  const roles = {
    "app.loop.fans": "cd70c6cd-0266-4b9c-a42e-eaf0a482f417",
    "app.loop.do": "e77156a3-9e18-40d1-a038-199aebd47467",
    localhost: "cd70c6cd-0266-4b9c-a42e-eaf0a482f417",
  };
  // if dont have a role, return the default role
  return roles[host] ?? roles["localhost"];
};
export const platform = (host) => {
  const platforms = {
    "app.loop.fans": "app.loop.fans",
    "app.loop.do": "app.loop.do",
    localhost: "app.loop.fans",
  };
  return platforms[host] ?? platforms["localhost"];
};
