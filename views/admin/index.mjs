import Router from "koa-router";
import AdminActionsRoutes from "./adminActions.mjs";

const routes = new Router();

// User Routes
routes.use(AdminActionsRoutes.routes());

export default routes;
