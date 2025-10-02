import Router from "koa-router"
import { apiRequest, apiRequestSystem } from "../../../../helpers/apicall.mjs";
import checkCookie from "../../../../helpers/auth.mjs";

const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1/benefit/delete`;

// ********************* //
// Create/Update Video
// ********************* //
router.post(`${BASE_URL}`, async (ctx) => {
  const { cookie, benefit_type, benefit_id } = ctx.request.body;

  try {
    // Check Cookie
    const userAuth = await checkCookie({ cookie });
    if (!userAuth) {
      console.log("error checking Cookie")
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // Fetch User
    const { users: user } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userAuth.profileId}" } }) {
          id
        }
      }
    `);
    let collectionName = `collection_${benefit_type}`;
    // fetch Collection
    if (benefit_type === "gallery") {
      collectionName = benefit_type;
    }
    
    const benefitQuery = `
      query {
        ${collectionName}(filter: {
					id: {
						_eq: "${benefit_id}"
					}
				}) {
          collection {
            id
            artist {
              id
            }
          }
        }
      }
    `;
    const collection = await apiRequest(benefitQuery);

    // Check if benefit exists
    if (!collection) {
      ctx.status = 404;
      ctx.body = "Benefit not found";
      return;
    }


    const {collection: { id: collection_id, artist: { id: artist_id }}} = collection[collectionName][0];

    // Check Auth, is user the owner of the collection
    if (artist_id !== user[0].id) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    // delete the benefit
    const deleteBenefitQuery = `
      mutation {
        delete_${collectionName}_item(id: "${benefit_id}") {
          id
        }
      }
    `;
    await apiRequest(deleteBenefitQuery);

    ctx.status = 200;
    return;
  } catch (err) {
    //console.log(err, ctx);
    console.log(err);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

export default router;
