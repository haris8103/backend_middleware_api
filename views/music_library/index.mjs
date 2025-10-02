import Router from "koa-router";
import library from "./library.mjs";

const routes = new Router();

// Collection Routes
routes.use(library.routes());

export default routes;
