import checkCookie from "../helpers/auth.mjs";
import { apiRequestSystem } from "../helpers/apicall.mjs";
import { useCookie } from "../helpers/constants.mjs";

export const authMiddleware = async (ctx, next) => {
  const { user_cookie, cookie: _cookie } = ctx.request.headers;
  const cookie = user_cookie || useCookie(_cookie);

  if (!cookie) {
    ctx.status = 401;
    ctx.body = "Unauthorized: No cookie provided";
    return;
  }

  const user = await checkCookie({ cookie });
  if (!user) {
    ctx.status = 401;
    ctx.body = "Unauthorized: Invalid cookie";
    return;
  }

  // Fetch Directus user ID based on profileId
  const { users: userData } = await apiRequestSystem(`
    query {
      users(filter: { profile_id: { _eq: "${user.profileId}" } }) {
        id
      }
    }
  `);

  if (!userData || userData.length === 0) {
    ctx.status = 403;
    ctx.body = "Forbidden: No matching Directus user found";
    return;
  }

  // Store both profileId and Directus user ID in ctx.state
  ctx.state.user = userData[0];
  await next();
};