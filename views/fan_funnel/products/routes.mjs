import Router from "koa-router";
import pre_release_collection from "./pre_release_collection.mjs";
import pre_registration from "./pre_relgistration_form.mjs";
import pre_registration_submissions from "./pre_relgistration_submissions.mjs";
import index from "../index.mjs"

const routes = new Router();

routes.use(pre_release_collection.routes());
routes.use(pre_release_collection.routes());
routes.use(pre_registration.routes());
routes.use(pre_registration_submissions.routes());
routes.use(index.routes());

export default routes;
