import Router from "koa-router";
import getCollection from "./getCollection.mjs";
import handleVoteCollection from "./handleVoteCollection.mjs";
import createCollection from "./createCollection.mjs";

const routes = new Router();

// Collection Routes
routes.use(getCollection.routes());
routes.use(handleVoteCollection.routes());
routes.use(createCollection.routes());

export default routes;
