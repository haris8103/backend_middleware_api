import Router from "koa-router";
import domainConfig from "./domainConfig.mjs";
import youtubeBlock from "./youtubeBlock.mjs";
import albumBlock from "./albumBlock.mjs";
import contactBlock from "./contactBlock.mjs";
import tracksBlock from "./tracksBlock.mjs";
import events from "./events/events.mjs";
import bannerBlock from "./bannerBlock.mjs";

const routes = new Router();

// Collection Routes
routes.use(domainConfig.routes());
routes.use(youtubeBlock.routes());
routes.use(albumBlock.routes());
routes.use(contactBlock.routes());
routes.use(tracksBlock.routes());
routes.use(events.routes());
routes.use(bannerBlock.routes());

export default routes;
