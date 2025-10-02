import Router from "koa-router";
import axios from "axios";
import fs from "fs";
import {
  backendApiKey,
  backendUrl,
  fanRoleId,
  logtail,
} from "../../helpers/constants.mjs";
import authCheck from "../../helpers/auth.mjs";
import { apiRequestSystem, apiRequest } from "../../helpers/apicall.mjs";
import { handleImageUpload } from "../../helpers/uploadImage.mjs";
import { profileUpdateSchema } from "../../schema/validationSchema.mjs";
import { useMixpanel } from "../../helpers/mixpanel.mjs";
import { isAdmin } from "../../hooks/userHooks.mjs";
const { sendMixpanel } = useMixpanel();

const router = new Router();
const BASE_URL = `/v1/admin/action`;

// ********************* //
// Admin Update Collection
// ********************* //
router.post(`${BASE_URL}/update_collection/:id`, async (ctx) => {
  const { id } = ctx.params;
  const { cookie, isId, field_name, field_value } = ctx.request.body;

  try {
    // Auth Check
    const userAuth = await authCheck({ cookie });
    const updatedableFields = ["featured"];

    if (!userAuth || !updatedableFields.includes(field_name)) {
      ctx.status = 400;
      ctx.body = "Invalid";
      return;
    } else {
      // fetch userID
      const { users: userInfo } = await apiRequestSystem(
        `query {
          users(filter: { profile_id: { _eq: "${userAuth.profileId}" } }) {
            id
            role
          }
        }`
      );

      // Check if user is admin
      if (!isAdmin(userInfo[0].role)) {
        ctx.status = 400;
        ctx.body = "Invalid";
        return;
      }
      
        // Update Field
        await apiRequest(`mutation {
        update_fans_launchpad_item(
          id: ${id},
          data: {
            ${field_name}:${field_value}
          }) {
          id
        }
      }`);
    }

    ctx.status = 200;
    ctx.body = "Success";
    return;
  } catch (err) {
    ctx.status = 400;
    ctx.body = "Error Updating Profile";
    return;
  }
});

// ********************* //
// Admin Update Profile by Field
// ********************* //
router.post(`${BASE_URL}/update_user/:id`, async (ctx) => {
  const { id } = ctx.params;
  const { cookie, field_name, field_value } = ctx.request.body;

  try {
    // Auth Check
    const userAuth = await authCheck({ cookie });
    const updatedableFields = ["featured"];

    if (!userAuth || !updatedableFields.includes(field_name)) {
      ctx.status = 400;
      ctx.body = "Invalid";
      return;
    } else {
      // fetch userID
      const { users: userInfo } = await apiRequestSystem(
        `query {
          users(filter: { profile_id: { _eq: "${userAuth.profileId}" } }) {
            id
            role
          }
        }`
      );

      // Check if user is admin
      if (!isAdmin(userInfo[0].role)) {
        ctx.status = 400;
        ctx.body = "Invalid";
        return;
      }

      // Update Profile Field
      if (field_name == "featured") {
        await apiRequestSystem(`mutation {
          update_users_item(
            id: "${id}",
            data: {
              featured: ${field_value}
            }) {
            id
          }
        }`);
      }
    }

    ctx.status = 200;
    ctx.body = "Success";
    return;
  } catch (err) {
    ctx.status = 400;
    ctx.body = "Error Updating Profile";
    logtail.error(err);
    return;
  }
});

export default router;
