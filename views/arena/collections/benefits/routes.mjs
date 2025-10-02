import Router from "koa-router";
import album from "./album.mjs";
import video from "./video.mjs";
import files from "./files.mjs";
import gallery from "./gallery.mjs";
import deleteBenefit from "./deleteBenefit.mjs";

const routes = new Router();

// Benefits Routes
routes.use(album.routes());
routes.use(video.routes());
routes.use(files.routes());
routes.use(gallery.routes());
routes.use(deleteBenefit.routes());

export default routes;
