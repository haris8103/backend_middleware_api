import { cacheExpiration } from "./constants.mjs";
import NodeCache from "node-cache";

export default new NodeCache({ stdTTL: cacheExpiration });