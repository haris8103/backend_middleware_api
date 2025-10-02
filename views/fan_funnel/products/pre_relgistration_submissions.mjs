import Router from "koa-router";

import { apiRequest } from "../../../helpers/apicall.mjs";

const router = new Router();
const BASE_URL = `/v1/fan_funnel`;

// // ********************* //
// // Register pre_registration
// // ********************* //
router.post(`${BASE_URL}/:id/register`, async (ctx) => {
  const id = ctx.params.id;
  const { fields } = ctx.request.body;

  try {
    const { pre_registration_by_id } = await apiRequest(`
          query { 
            pre_registration_by_id(id: "${id}"){
                id
                release_date
                is_default
             }
        }`);

    if (!pre_registration_by_id) {
      ctx.status = 404;
      ctx.body = "Pre registration data not found";
      return;
    }

    // validate if pre_registration not default
    if (!pre_registration_by_id?.is_default) {
      ctx.status = 400;
      ctx.body = "Pre registration is not opened";
      return;
    }

    // validate if date not passed
    if (pre_registration_by_id?.release_date) {
      const releaseDate = new Date(pre_registration_by_id?.release_date);
      const currentDate = new Date();
      if (releaseDate < currentDate) {
        ctx.status = 400;
        ctx.body = "Registration is closed";
        return;
      }
    }

    // save registration data
    const mutate = `
      mutation {
        create_pre_registration_submissions_item(
            data:{
              ${fields?.name ? `name: "${fields.name}",` : ""}
              ${fields?.email ? `email: "${fields.email}",` : ""}
              ${fields?.country ? `country: "${fields.country}",` : ""}
              ${fields?.birthday ? `birthday: "${fields.birthday}",` : ""}
              pre_registration: {
                id: "${pre_registration_by_id.id}"
              }
            }
          ) {
            id
            name
            email
            country
            birthday
          }
      }
    `;

    const { create_pre_registration_submissions_item: response } = await apiRequest(mutate);
    if (!response) {
      ctx.status = 404;
      ctx.body = "Failed to Submit Pre registration";
      return;
    }

    ctx.status = 200;
    ctx.body = response;
    return;
  } catch (err) {
    console.log(err);
    console.log(err.response.data);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// // ********************* //
// // Check already Register
// // ********************* //
router.post(`${BASE_URL}/:id/register/check`, async (ctx) => {
  const id = ctx.params.id;
  const { fields } = ctx.request.body;
  const { email } = fields;
  try {
    const { pre_registration_submissions } = await apiRequest(`
          query { 
            pre_registration_submissions(filter: {
                pre_registration: { id: {_eq: ${id}} }
                email: { _eq: "${email}" }
            }){
                id
             }
        }`);

    if (!pre_registration_submissions?.length) {
      ctx.status = 404;
      ctx.body = "Pre registration data not found";
      return;
    }

    ctx.status = 200;
    ctx.body = pre_registration_submissions?.length > 0;
    return;
  } catch (err) {
    console.log(err);
    console.log(err.response.data);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// // ********************* //
// // Get Count by Ids
// // ********************* //
router.get(`${BASE_URL}/pre_registration_submissions/count`, async (ctx) => {
  if (!ctx.query?.ids) {
    ctx.status = 400;
    ctx.body = "Pre registration ids not found";
    return;
  }
  const ids = ctx.query?.ids;

  try {
    let query = '';
    ids?.split(',').forEach(element => {
      query += `
        i${element}:pre_registration_submissions_aggregated (filter: { pre_registration: { id: { _eq: "${element}"}}}){
            countDistinct: count{
                email
            }
        }
      `
    });
    const data = await apiRequest(`
          query { 
            ${query}
          }`);
    ctx.status = 200;
    ctx.body = data;
    return;
  } catch (err) {
    console.log(err);
    console.log(err.response.data);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

// // ********************* //
// // Get Form Fans
// // ********************* //
router.get(`${BASE_URL}/pre_registration_submissions/fans`, async (ctx) => {
  const id = ctx.query?.id;
  if (!id) {
    ctx.status = 400;
    ctx.body = "Pre registration id not found";
    return;
  }

  try {
    const { pre_registration } = await apiRequest(`
          query { 
          pre_registration(filter: { id: { _eq: "${id}"}}, limit: 1){
             id
                release_date
                name
                description
                pre_registration_submissions{
                 id
                  name
                  email
                  country
                  birthday
                }
    }
          }`);
    ctx.status = 200;
    ctx.body = pre_registration?.[0];
    return;
  } catch (err) {
    console.log(err);
    console.log(err.response.data);
    ctx.status = err.response.status;
    ctx.body = err.response.data;
    return;
  }
});

export default router;
