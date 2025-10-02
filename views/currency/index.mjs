import Router from "koa-router";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

import { backendApiKey, backendUrl } from "../../helpers/constants.mjs";

const router = new Router();
const BASE_URL = `/v1/currency`;

// ********************* //
// Get Currecny Rate
// ********************* //
router.get(`${BASE_URL}/rate/:code`, async (ctx) => {
  const { code } = ctx.params;
  try {
    const result = await axios({
      url: `${backendUrl}/items/currency_data?filter={"code":{"_eq":"${code}"}}&fields=*.*&sort[]=-date_created&page=1&limit1`,
      method: "get"
    });
    const data = result.data.data[0];
    const price = data.value;
    //const formated_value = (value) => parseInt(value.toString().replace(".", ""));
    const formated = {
      base_currency: data.base_currency,
      code: data.code,
      value: price,
    };

    ctx.status = 200;
    ctx.body = formated;
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

export default router;
