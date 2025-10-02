import Router from "koa-router";
import axios from "axios";

const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1/launchpad`;

// ********************* //
// Get Launchpad
// ********************* //
router.get(`${BASE_URL}/:id`, async (ctx) => {
  const { id } = ctx.params;
  try {
    const result = await axios({
      url: `${url}/graphql`,
      method: "post",
      data: {
        query: `
        query {
          launchpad(filter: { project_slug: { _eq: "${id}" } }) {
            project_name
            project_slug
            banner {
              id
            }
            launchInfo {
              startDate
              startTime
              endDate
              endTime
              publicDate
              publicTime
              minPrice
            }
          }
        }
          `,
      },
    });

    ctx.status = 200;
    ctx.body = result.data.data.launchpad[0];
    return;
  } catch (err) {
    //console.log(err, ctx);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

export default router;
