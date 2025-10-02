import Router from "koa-router";

import index from "./index.mjs";
import actions from "./actions.mjs";
import collections from "./collections/index.mjs";
import courses from "./courses/index.mjs";
import gallery from "./gallery/index.mjs";
import leaderboard from "./leaderboard/index.mjs";
import posts from "./posts/postActions.mjs";

import inbox from "./inbox/inboxActions.mjs";

const routes = new Router();

// Routes
routes.use(index.routes());
routes.use(actions.routes());
routes.use(collections.routes());
routes.use(courses.routes());
routes.use(gallery.routes());
routes.use(leaderboard.routes());
routes.use(posts.routes());
routes.use(inbox.routes());

export default routes;
