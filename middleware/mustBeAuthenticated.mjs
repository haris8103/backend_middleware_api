import authCheck from "../helpers/auth.mjs";

export default async function mustBeAuthenticated(ctx, next) {
  const { user_cookie } = ctx.request.headers;
  const userAuth = await authCheck({ cookie: user_cookie });

  if (!userAuth) {
    ctx.status = 401;
    ctx.body = { error: "Unauthorized" };
    return;
  }
  ctx.state.userAuth = userAuth;
  await next();
}