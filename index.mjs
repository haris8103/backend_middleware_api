// Setting Dotenv Globally
import 'dotenv/config';

// es6 syntex
import Koa from "koa";
import helmet from 'koa-helmet';
import cors from "@koa/cors";
import koaBody from "koa-body";
import validate from 'koa-validate';
//import bodyParser from "koa-bodyparser";
import ratelimit from "koa-ratelimit";
import { logtail } from "./helpers/constants.mjs";
import ipBlocker from "./middleware/ipBlocker.mjs";
// Common
import Common from "./views/index.mjs"

// Currency
import Currency from "./views/currency/index.mjs"

// User Routes
import userRoutes from "./views/users/index.mjs"

// Admin Routes
import adminRoutes from "./views/admin/index.mjs"

// Routes
import commonRoutes from "./views/common/common.routes.mjs";
import fanRoutes from "./views/fans/index.mjs";
import paymentRoutes from "./views/payments/providers.mjs";
import launchpadRoutes from "./views/launchpad/index.mjs";
import collectionsRoutes from "./views/collections/index.mjs";
import benefitsRoutes from "./views/arena/collections/benefits/routes.mjs";
import funnelRoutes from "./views/fan_funnel/products/routes.mjs";
import filesRoutes from "./views/files/routes.mjs";

// Pages
import FansPages from "./views/fans/pages/index.mjs";

// Arena
import Arena from "./views/arena/routes.mjs";

// Indexer / Minter
import Indexer from "./views/indexer/index.mjs";
import Minter from "./views/minter/index.mjs";
import Contract from "./views/contract_deploy/index.mjs"
// Leaderboards
import Leaderboards from "./views/arena/leaderboard/index.mjs";

// Music Library
import Music from "./views/music_library/index.mjs";

// White Label
import WhiteLabel from "./views/whitelabel/index.mjs";

// Scripts
import Scripts from "./views/scripts/routes.mjs";

// Umami
import Umami from "./views/umami/routes.mjs";

// Billing
import billing from "./views/billing/index.mjs";
import userBilling from "./views/billing/user/user_billing.mjs";
import billingWebHooks from "./views/billing/webhook.mjs";

// Templates
import templateRoutes from "./views/templates/routes.mjs"

const app = new Koa();
app.use(helmet());

// Add IP blocking middleware first
app.use(ipBlocker);

// Add request timing middleware
app.use(async (ctx, next) => {
  ctx.state.requestStartTime = Date.now();
  await next();
});


// Attach Koa to enable HTTP request logging
logtail.attach(app);
logtail.flush();

// log user data on every request
app.use(async (ctx, next) => {
  logtail.log({
    type: "REQUEST_LOG",
    timestamp: new Date().toISOString(),
    ip: ctx.request.ip,
    endpoint: ctx.request.url,
    method: ctx.request.method,
    headers: ctx.request.headers,
    body: ctx.request.body,
  });
  await next();
});

// Validate request body
validate(app);

const PORT = process.env.PORT ?? 8080;

// ********************* //
// Rate Limit
// ********************* //
/* const limiter = ratelimit({
  driver: "memory",
  db: new Map(),
  duration: 60000, // 1 minute
  max: 5000, // 2500 requests per minute
  whitelist: (ctx) => {
    // Add IP's that should not be rate-limited
    //console.log(ctx)
    return false;
  },
  errorMessage: "Slow down, you are doing too much!",
}); */

// ********************* //
// Upload Limit
// ********************* //
/* const uploadLimiter = ratelimit({
  driver: "memory",
  db: new Map(),
  duration: 60000, // 1 minute
  max: 25, // 25 uploads per minute
  errorMessage: "Slow down, you are doing too much!",
}); */

//app.use(limiter);
//app.use(uploadLimiter);

app.use(async (ctx, next) => {
  await next();
  const rt = ctx.response.get("X-Response-Time");
  console.log(`${ctx.method} ${ctx.url} - ${rt}\n`);
});

// ********************* //
// Enable CORS
// ********************* //
const validOrigins = [
  "http://localhost:3000",
  "https://localhost:3000",
  "https://localhost:3001",
  /^https:\/\/[\w-]+\.loop\.markets$/,
  /^https:\/\/[\w-]+\.loop\.fans$/,
  /^https:\/\/[\w-]+\.fans-studio.pages\.dev$/,
  /^https:\/\/[\w-]+\.loop-fans-frontend.pages\.dev$/,
  /^https:\/\/[\w-]+\.loop-juno-nft-web.pages\.dev$/,
  /^https:\/\/[\w-]+\.fans-arena.pages\.dev$/,
  /^https:\/\/[\w-]+\.pages\.dev$/,
  /^https:\/\/[\w-]+\.loop\.do$/,
  /^https:\/\/[\w-]+\.railway\.app$/,
  "https://dev.loopprotocol.io",
  "https://loopprotocol.io",
  "https://fans-arena.pages.dev",
  "https://loop.markets",
  "https://loop.fans",
  "https://app.loop.fans",
  "https://juno.loop.markets",
  "https://declanorourke.com",
];

function verifyOrigin(ctx) {
  const origin = ctx.headers.origin;
  if (!originIsValid(origin)) return false;
  return origin;
}

function originIsValid(origin) {
  return validOrigins.some((validOrigin) => {
    if (typeof validOrigin === "string") {
      return origin === validOrigin;
    } else {
      return validOrigin.test(origin);
    }
  });
}

const config = {
  cors: {
    origin: verifyOrigin,
    credentials: true,
  },
};

app.use(cors(config.cors));

// ********************* //
// Body Parser
// ********************* //
// Configure koaBody for handling file uploads
//app.use(bodyParser());

app.use(async (ctx, next) => {
  // Skip koaBody for the webhook route
  if (ctx.path === '/v1/billing/webhook') {
    await next();
  } else {
    // Apply koaBody for all other routes
    await koaBody({
      multipart: true,
      formidable: {
        uploadDir: './uploads', // Upload directory
        maxFileSize: 300 * 1024 * 1024, // 300MB
        keepExtensions: true,
        onFile: (fieldName, file) => {
          // Customize the file name here
          file.path = `./uploads/${file.name}`;
        },
      },
    })(ctx, next);
  }
});

// Add error handler for file uploads
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    if (err.status === 413 || (err.message && err.message.includes("maxFileSize"))) {
      ctx.status = 413;
      ctx.body = { error: "File size exceeds limit of 300MB" };
    } else {
      throw err;
    }
  }
});

// ********************* //
// Routes
// ********************* //
app.use(Common.routes());
app.use(Currency.routes());

app.use(commonRoutes.routes());
app.use(paymentRoutes.routes());
app.use(launchpadRoutes.routes());
app.use(collectionsRoutes.routes());
app.use(benefitsRoutes.routes());
app.use(filesRoutes.routes());
app.use(userRoutes.routes());
app.use(adminRoutes.routes());
app.use(fanRoutes.routes());
app.use(FansPages.routes());
app.use(Arena.routes());
app.use(Indexer.routes());
app.use(Minter.routes());
app.use(Contract.routes());
app.use(Leaderboards.routes());
app.use(Music.routes());

app.use(WhiteLabel.routes());

app.use(Scripts.routes());
app.use(funnelRoutes.routes());

// umami routes
app.use(Umami.routes());

// billing routes
app.use(billing.routes());
app.use(userBilling.routes());
app.use(billingWebHooks.routes());

// template routes
app.use(templateRoutes.routes());

const server = app.listen(PORT, () => {
  console.log(`Server listening on port: ${PORT}`);
});

export default server;
