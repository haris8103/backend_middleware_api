import Router from "koa-router";
import { backendUrl } from "../../helpers/constants.mjs";
import cache from "../../helpers/cache.mjs";
//import uploadMiddleware from "../../helpers/aws.mjs";
//import multer from "koa-multer";
import axios from "axios";
import checkCookie from "../../helpers/auth.mjs";
const router = new Router();

// Create a Multer instance with desired configuration
//const upload = multer({ dest: "uploads/" });

const BASE_URL = `/v1`;

// ********************* //
// Default Routes
// ********************* //
router.get("/", async (ctx) => {
  ctx.status = 200;
  ctx.body = {
    message: "Hello, world",
  };
  return;
});

// ===================== //
// Check Auth
// ===================== // 
router.post(`${BASE_URL}/checkAuth`, async (ctx) => {
  const { usercookie } = ctx.request.headers;
  if (usercookie) {
    const user = await checkCookie({ cookie: usercookie });
    if (!user) {
      ctx.status = 401;
      ctx.body = { message: "User is not authenticated" };
      return;
    }
    ctx.status = 200;
    ctx.body = { message: "User is authenticated" };
    return;
  } else {
    ctx.status = 400;
    ctx.body = { message: "User is not authenticated" };
    return;
  }
});

// ===================== //
// Platform FAQs
// ===================== //
router.get(`${BASE_URL}/faqs/:platform`, async (ctx, next) => {
  const { platform } = ctx.params;
  try {
    const faqs = await axios({
      url: `${backendUrl}/items/faq?filter[platform][_eq]=${platform}&fields=Questions`,
      method: "GET",
    });
    ctx.status = 200;
    ctx.body = faqs.data.data[0];
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ===================== //
// Platform Menu
// ===================== //
router.get(`${BASE_URL}/platform_menu`, async (ctx, next) => {
  const cacheKey = `platform_menu`;
  const cachedResponse = cache.get(cacheKey);
  try {
    if (cachedResponse) {
      ctx.body = cachedResponse;
      ctx.status = 200;
      return; // Exit the middleware chain
    } else {
      const platform_menu = await axios({
        url: `${backendUrl}/items/platform_menu`,
        method: "GET",
      });
      ctx.status = 200;
      ctx.body = platform_menu.data.data;
      cache.set(cacheKey, platform_menu.data.data);
      return;
    }
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

/* router.post("/v1/upload", async (ctx, next) => {
  const { files, fields } = ctx.request.body;
  const path = fields.path;
  // Call the uploadMiddleware function
  try {
    if (path) {
      const file = files.file;
      const AWSImage = await uploadMiddleware({ file, path });
      ctx.status = 200;
      ctx.body = AWSImage; //Image Key
      return;
    }

    ctx.status = 403;
    ctx.body = "Missing Data"; //Throw error
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
}); */

// ********************* //
// Webhook to Clear Cache
// ********************* //
router.post("/clear-cache", (ctx) => {
  //const { cacheName } = ctx.params;
  cache.flushAll();

  ctx.status = 200;
  ctx.body = `Cache cleared successfully`;
  return;
});

export default router;
