import Router from "koa-router";
import axios from "axios";
import dotenv from "dotenv";
import cache from "../../../helpers/cache.mjs";
dotenv.config();

const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1/fans/pages`;

// ********************* //
// Get Homepage Content
// ********************* //
router.get(`${BASE_URL}/fans_homepage`, async (ctx) => {
  const cacheKey = `fans_homepage`;
  const cachedResponse = cache.get(cacheKey);
  try {
    if (cachedResponse) {
      ctx.body = cachedResponse;
      ctx.status = 200;
      return; // Exit the middleware chain
    } else {
      const request = await axios({
        url: `${url}/graphql`,
        method: "post",
        data: {
          query: `
          query {
            pages(filter: {id: { _eq: "1"}} ) {
              page_name
              block {
                group_type
                headline
                sub_title
                content
                cards {
                  title
                  sub_title
                  image { id }
                  link
                }
                events {
                  title
                  content
                  featured_image { id }
                  video
                }
              }
            }
          }
          `,
        },
      });
      cache.set(cacheKey, request.data.data.pages[0].block);
      //console.log(request.data.data.pages)
      ctx.status = 200;
      ctx.body = request.data.data.pages[0].block;
      return;
    }
  } catch (err) {
    console.log(err, ctx);
  }
});

export default router;
