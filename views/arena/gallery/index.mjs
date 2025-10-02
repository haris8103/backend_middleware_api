import Router from "koa-router";
import axios from "axios";
import cache from "../../../helpers/cache.mjs";
import { backendApiKey, backendUrl } from "../../../helpers/constants.mjs";
import { fetchCollectionAddresses, fetchUserNFTs } from "../calls.mjs";
import authCheck from "../../../helpers/auth.mjs";
import { apiRequest, apiRequestSystem } from "../../../helpers/apicall.mjs";
import { handleImageUpload } from "../../../helpers/uploadImage.mjs";

const router = new Router();
const BASE_URL = `/v1/albums`;

// ********************* //
// Fetch Creator Albums
// ********************* //
router.post(`${BASE_URL}/:id`, async (ctx) => {
  const { id } = ctx.params;
  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;

  // Check JWT
  const userData = await authCheck({ cookie });
  let status = `["published"]`;

  // Check Cookie is present
  if (cookie || userData) {
    if (userData && userData.profileId) {
      status = `["published", "draft"]`;
    }
  }

  try {
    const { album } = await apiRequest(`
      query {
        album(filter: { user_created: { username: { _eq: "${id}" } }, status: { _in: ${status} } }, sort: "-date_created") {
          id
          access_type
          name
          desc
            gallery {
              id
              images {
                featured
                directus_files_id {
                  id
                }
              }
            }
          }
        }
      `);

    // Fetch Feed Data

    const albumsList = [];

    // Loop through combined content and add to feed
    album.map((item) => {
      albumsList.push({
        ...item,
      });
    });

    ctx.status = 200;
    ctx.body = albumsList;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// ********************* //
// Update Album
// ********************* //
router.patch(`${BASE_URL}/:id`, async (ctx) => {
  try {
    const { user_cookie } = ctx.request.headers;
    const cookie = user_cookie;
    const userData = await authCheck({ cookie });
    if (!userData) {
      ctx.status = 401;
      ctx.body = { message: "Unauthorized" };
      return;
    }

    // Fetch User
    const { users: user } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          id
        }
      }
    `);

    // Fetch Album
    const {
      id: album_id,
      name: name,
      desc: description,
      gallery,
    } = ctx.request.body;

    // Check if user is creator of album
    const { album } = await apiRequest(`
          query {
            album(filter: { id: { _eq: "${album_id}" } }) {
              user_created {
                id
              }
            }
          }
        `);
    if (album[0].user_created.id !== user[0].id) {
      ctx.status = 401;
      ctx.body = { message: "Unauthorized" };
      return;
    }

    await apiRequest(`
      mutation {
        update_album_item(id: "${album_id}",
        data: { name: "${name}", desc: "${description}" }
        ) {
          id
        }
      }
    `);

    // Convert images array to GraphQL format
    const graphqlImages = gallery.images
      .map(
        (img, index) => `{
          featured: ${index < 3 ? "true" : "false"},
          directus_files_id: {
            id: "${img.directus_files_id.id}"
          }
        }`
      )
      .join(",");

    await apiRequest(`
      mutation {
        update_album_gallery_item(
          id: "${gallery.id}"
          data: {
            images: [${graphqlImages}]
          }
        ) {
          id
          images {
            featured
            directus_files_id {
              id
            }
          }
        }
      }
    `);

    ctx.status = 200;
    ctx.body = {
      message: "Album Updated",
    };
    return;
  } catch (error) {
    console.log(error.response);
    ctx.status = 400;
    ctx.body = error;
    return;
  }
});

// ********************* //
// Create Album
// ********************* //
router.post(`${BASE_URL}`, async (ctx) => {
  try {
    const { user_cookie } = ctx.request.headers;
    const cookie = user_cookie;
    const userData = await authCheck({ cookie });
    if (!userData) {
      ctx.status = 401;
      ctx.body = { message: "Unauthorized" };
      return;
    }

    // Fetch User
    const { users: user } = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          id
        }
      }
    `);

    const { name: name, desc: description, gallery } = ctx.request.body;

    // Convert images array to GraphQL format
    const graphqlImages = gallery.images
      .map(
        (img, index) => `{
          featured: ${index < 3 ? "true" : "false"},
          directus_files_id: {
            id: "${img.directus_files_id.id}"
            storage: "cloud"
            filename_download: "${img.directus_files_id.filename_download}"
          }
        }`
      )
      .join(",");

    await apiRequest(`
      mutation {
        create_album_item(
          data: {
            status: "published",
            name: "${name}",
            desc: "${description}",
            gallery: {
              images: [${graphqlImages}]
            },
            user_created: {
              id: "${user[0].id}"
            }
          }
        ) {
          id
          name
          desc
          gallery {
            id
            images {
              featured
              directus_files_id {
                id
              }
            }
          }
        }
      }
    `);
    ctx.status = 200;
    ctx.body = {
      message: "Album Created",
    };
    return;
  } catch (error) {
    console.log(error.response);
    ctx.status = 400;
    ctx.body = error;
    return;
  }
});

// ********************* //
// Delete Album
// ********************* //
router.delete(`${BASE_URL}/:id`, async (ctx) => {
  const { id } = ctx.params;
  const { user_cookie } = ctx.request.headers;
  const cookie = user_cookie;

  // Check JWT
  const userData = await authCheck({ cookie });
  if (!userData) {
    ctx.status = 401;
    ctx.body = { message: "Unauthorized" };
    return;
  }

  // Fetch User
  const { users: user } = await apiRequestSystem(`
    query {
      users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
        id
      }
    }
  `);

  // Check if user is creator of album
  const { album } = await apiRequest(`
    query {
      album(filter: { id: { _eq: "${id}" } }) {
        user_created {
          id
        }
      }
    }
  `);
  if (album[0].user_created.id !== user[0].id) {
    ctx.status = 401;
    ctx.body = { message: "Unauthorized" };
    return;
  }

  await apiRequest(`
    mutation {
      delete_album_item(id: "${id}") {
        id
      }
    }
  `);
  ctx.status = 200;
  ctx.body = {
    message: "Album Deleted",
  };
});

// ********************* //
// Fetch Galleries
// ********************* //
router.get(`${BASE_URL}/galleries`, async (ctx) => {
  const { data } = await axios({
    url: `${backendUrl}/graphql`,
    method: "post",
    data: {
      query: `
        query {
          album(filter: { status: { _eq: "published" } }) {
            id
            name
            description
            image { id }
            collection { id, name }
          }
        }
      `,
    },
  });
  ctx.body = data.data.album;
  ctx.status = 200;
  return;
});

// ********************* //
// Fetch Gallery
// ********************* //
router.get(`${BASE_URL}/gallery/:id`, async (ctx) => {
  const { id } = ctx.params;
  const cacheKey = `gallery-${id}`;
  const cachedResponse = cache.get(cacheKey);
  if (cachedResponse) {
    ctx.body = cachedResponse;
    ctx.status = 200;
    return;
  }
  const { data } = await axios({
    url: `${backendUrl}/graphql`,
    method: "post",
    data: {
      query: `
        query {
          album(filter: { id: { _eq: "${id}" } }) {
            id
            name
            description
            image { id }
            collection { id, name }
          }
        }
      `,
    },
  });
  //cache.set(cacheKey, data.data.albums[0]);
  ctx.body = data.data.album[0];
  ctx.status = 200;
  return;
});

// ********************* //
// Delete Gallery
// ********************* //
router.delete(`${BASE_URL}/gallery/:id`, async (ctx) => {
  const { id } = ctx.params;
  const { data } = await axios({
    url: `${backendUrl}/graphql/system`,
    method: "post",
    headers: { Authorization: `Bearer ${backendApiKey}` },
    data: {
      query: `
        mutation {
          delete_album_item(id: "${id}") {
            id
          }
        }
      `,
    },
  });
  //cache.del(`gallery-${id}`);
  ctx.status = 200;
  ctx.body = data.data.album;
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
