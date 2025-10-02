import Router from "koa-router";
import userAuthRoutes from "./user/auth/index.mjs";
import userActionRoutes from "./user/userActions.mjs";
import userProfileRoutes from "./user/userProfile.mjs";

import merchantRoutes from "./merchant/index.mjs"

const routes = new Router();

// User Routes
routes.use(userAuthRoutes.routes());
routes.use(userActionRoutes.routes());
routes.use(userProfileRoutes.routes());

routes.use(merchantRoutes.routes());

export default routes;
