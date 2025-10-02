import Router from "koa-router";
import axios from "axios";
import dotenv from "dotenv";
import cache from "../../../helpers/cache.mjs";
import { backendApiKey, backendUrl } from "../../../helpers/constants.mjs";

dotenv.config();
const router = new Router();
const BASE_URL = `/v1/courses`;
const limit = 10;

// ********************* //
// Fetch Creator Courses
// ********************* //
router.get(`${BASE_URL}/creator/:id`, async (ctx) => {
  const { id } = ctx.params;
  const cacheKey = `creator-${id}`;
  const cachedResponse = cache.get(cacheKey);

  try {
    if (cachedResponse) {
      ctx.body = cachedResponse;
      ctx.status = 200;
      return; // Exit the middleware chain
    } else {
      const result = await axios({
        url: `${backendUrl}/graphql`,
        method: "post",
        data: {
          query: `
        query {
          courses(filter: { creator: { id: { _eq: "${id}" } }}) {
            id
            slug
            title
            description
            banner { id }
            image { id }
            creator {
              id
              first_name
            }
          }
        }
        
      `,
        },
      });

      ctx.status = 200;
      ctx.body = result.data.data.courses;
      //cache.set(cacheKey, result.data.data.courses);
      return;
    }
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Fetch Course
// ********************* //
router.get(`${BASE_URL}/:slug`, async (ctx) => {
  const { slug } = ctx.params;
  /* const decodedString = id
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char); */

  const cacheKey = `course-${slug}`;
  const cachedResponse = cache.get(cacheKey);

  try {
    if (cachedResponse) {
      ctx.body = cachedResponse;
      ctx.status = 200;
      return; // Exit the middleware chain
    } else {
      const result = await axios({
        url: `${backendUrl}/graphql`,
        method: "post",
        data: {
          query: `
        query {
          courses(filter: { slug: { _eq: "${slug}" } }) {
            id
            slug
            title
            description
            banner { id }
            image { id }
            creator {
              id
              first_name
            }
            introduction {
              id
              title
              description
              excerpt
              placeholder { id }
            }
            classes {
              id
              title
              description
              excerpt
              placeholder { id }
            }
          }
        }
        
      `,
        },
      });

      ctx.status = 200;
      ctx.body = result.data.data.courses;
      //cache.set(cacheKey, result.data.data.courses);
      return;
    }
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Fetch Intro for Courses
// ********************* //
router.get(`${BASE_URL}/intro/:id`, async (ctx) => {
  const { id } = ctx.params;

  try {
    const result = await axios({
      url: `${backendUrl}/graphql`,
      method: "post",
      data: {
        query: `
        query {
          course_introduction(filter: { id: { _eq: "${id}" } }) {
            id
            title
            description
            excerpt
            placeholder { id }
            video { id }
            course_id {
              id
              title
              creator {
                id
                first_name
              }
            }
          }
        }
      `,
      },
    });

    ctx.status = 200;
    ctx.body = result.data.data.course_introduction;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Fetch Intro for Courses
// ********************* //
router.get(`${BASE_URL}/class/:id`, async (ctx) => {
  const { id } = ctx.params;

  try {
    const result = await axios({
      url: `${backendUrl}/graphql`,
      method: "post",
      data: {
        query: `
        query {
          course_classes(filter: { id: { _eq: "${id}" } }) {
            id
            title
            description
            excerpt
            placeholder { id }
            video { id }
            course_id {
              id
              title
              creator {
                id
                first_name
              }
            }
          }
        }
      `,
      },
    });

    ctx.status = 200;
    ctx.body = result.data.data.course_classes;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

export default router;
