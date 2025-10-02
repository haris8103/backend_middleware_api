import Router from "koa-router";

import codeGenerator from "./code_generator/code_generator.mjs";

const routes = new Router();

// Routes
routes.use(codeGenerator.routes());

export default routes;
