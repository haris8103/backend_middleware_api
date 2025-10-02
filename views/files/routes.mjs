import Router from "koa-router";
import renameFileRoute from "./renameFile.mjs";
import uploadFileRoute from "./uploadFile.mjs";

const routes = new Router();

// Routes
routes.use(renameFileRoute.routes());
routes.use(uploadFileRoute.routes());

export default routes;
