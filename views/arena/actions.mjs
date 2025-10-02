import Router from "koa-router";
import axios from "axios";

import { commentSchema, likeSchema } from "../../schema/validationSchema.mjs";

import authCheck from "../../helpers/auth.mjs";
import { backendApiKey, backendUrl } from "../../helpers/constants.mjs";
import { sendLog } from "../../helpers/log.mjs";
import { useMixpanel } from "../../helpers/mixpanel.mjs";
import { triggerEmail } from "../../helpers/brevoSdk.mjs";
const url = process.env.DIRECTUS_BACKEND ?? "https://loop-markets.directus.app";
const router = new Router();
const BASE_URL = `/v1/arena/action`;

const { sendMixpanel } = useMixpanel();

const handleLike = async ({ create, id, userId }) =>
  await axios({
    url: `${url}/graphql`,
    method: "post",
    headers: { Authorization: `Bearer ${backendApiKey}` },
    data: {
      query: `
      ${
        create
          ? `
      mutation { create_fans_likes_item( data: { user_id: { id: "${userId}" }, post_id: { id: "${id}" } } ) {id} }`
          : `
      mutation { delete_fans_likes_item(id: ${id}) { id }}
      `
      }
    `,
    },
  });

// ********************* //
// Create Comment
// ********************* //
router.post(`${BASE_URL}/comment`, async (ctx) => {
  // Validate request body
  const { error } = commentSchema.validate(ctx.request.body);
  if (error) {
    ctx.status = 400;
    ctx.body = error.details[0].message;
    return;
  }

  const { cookie, userInfo, post_id, comment } = ctx.request.body;
  const userAuth = await authCheck({ cookie });
  try {
    if (userAuth && userAuth.profileId === userInfo.profile_id) {
      // Use parameterized queries or prepared statements to prevent injection attacks
      await axios({
        url: `${backendUrl}/graphql`,
        method: "post",
        headers: { Authorization: `Bearer ${backendApiKey}` },
        data: {
          query: `
            mutation CreateFansComment($comment: String!, $user_id: ID!, $post_id: ID!) {
              create_fans_comments_item(data: { Text: $comment, user_id: { id: $user_id }, post_id: { id: $post_id } }) {
                id
              }
            }
          `,
          variables: {
            comment: comment,
            user_id: userInfo.id,
            post_id: post_id,
          },
        },
      });

      /* ==================== */
      // Mixpanel Analytics
      /* ==================== */
      try {
        sendMixpanel({
          event: "Created Comment",
          data: {
            distinct_id: userInfo.id,
            event_name: "Created Comment",
            post_id: post_id,
          },
        });
      } catch (error) {
        console.log("Error sending mixpanel event", error);
      }

      ctx.status = 200;
      return;
    } else {
      ctx.status = 401; // Unauthorized
      ctx.body = "Unauthorized";
      return;
    }
  } catch (err) {
    // Log message
    sendLog("error", "An error occurred when creating a comment");

    // return error
    ctx.status = 400;
    ctx.body = "An error occurred";
    return;
  }
});

// ********************* //
// Like Post
// ********************* //
router.post(`${BASE_URL}/like`, async (ctx) => {
  // Validate request body
  const { error } = likeSchema.validate(ctx.request.body);
  if (error) {
    ctx.status = 400;
    ctx.body = error.details[0].message;
    return;
  }

  const { cookie, userInfo, post_id } = ctx.request.body;
  const userAuth = await authCheck({ cookie });
  try {
    if (userAuth && userAuth.profileId === userInfo.profile_id) {
      const getLike = await axios({
        url: `${url}/graphql`,
        method: "post",
        headers: { Authorization: `Bearer ${backendApiKey}` },
        data: {
          query: `
            query {
              fans_likes(
                filter: {
                  user_id: { id: { _eq: "${userInfo.id}" } }
                  post_id: { id: { _eq: "${post_id}" } }
                }
              ) {
                id
              }
            }
          `,
        },
      });

      const liked = getLike.data.data.fans_likes[0]?.id;
      if (liked) {
        await handleLike({
          create: false,
          id: getLike.data.data.fans_likes[0].id,
          userId: userInfo.id,
        });
        ctx.status = 200;
        ctx.body = "Unliked";
        return;
      } else {
        await handleLike({ create: true, id: post_id, userId: userInfo.id });
        /* ==================== */
        // Mixpanel Analytics
        /* ==================== */
        try {
          sendMixpanel({
            event: "Post Liked",
            data: {
              distinct_id: userInfo.id,
              event_name: "Post Liked",
              post_id: post_id,
            },
          });
        } catch (error) {
          console.log("Error sending mixpanel event", error);
        }

        ctx.status = 200;
        ctx.body = "Liked";
        return;
      }
    } else {
      ctx.status = 401; // Unauthorized
      ctx.body = "Unauthorized";
      return;
    }
  } catch (err) {
    // Log message
    sendLog("error", "An error occurred when liking a post");

    // return error
    ctx.status = 400;
    ctx.body = "An error occurred";
  }
});

// ********************* //
// Get FeedByDate
// ********************* //
router.post(`${BASE_URL}/fetchByDate`, async (ctx) => {
  const { ids, page, lastDate } = ctx.request.body;
  const feed = [];
  try {
    const results = await axios({
      url: `${url}/graphql`,
      method: "post",
      data: {
        query: `
      query { 
        fans_posts(filter: { user_created: { id: { _in: "${ids}" } }, date_created: {_gt: "${lastDate}"} }) {
          id
          text
          image { id }
          user_created {
            avatar { id }
            first_name
          }
          date_created
        }
      }
        `,
      },
    });

    const getCommentCount = async (id) => {
      const comments = await axios({
        url: `${url}/graphql`,
        method: "post",
        data: {
          query: `
          query {
            fans_comments_aggregated(filter: { post_id: { id: { _in: "${id}" } } }) {
              count {
                id
              }
            }
          }
          `,
        },
      });
      return comments.data.data.fans_comments_aggregated[0].count.id;
    };

    const getLikeCount = async (id) => {
      const likes = await axios({
        url: `${url}/graphql`,
        method: "post",
        data: {
          query: `
          query {
            fans_likes_aggregated(filter: { post_id: { id: { _in: "${id}" } } }) {
              count {
                id
              }
            }
          }
          `,
        },
      });
      return likes.data.data.fans_likes_aggregated[0].count.id;
    };

    const promises = results.data.data.fans_posts.map(async (item) => {
      feed.push({
        id: item.id,
        date_created: item.date_created,
        comments: await getCommentCount(item.id),
        likes: await getLikeCount(item.id),
        liked: false,
        image: { id: item.image.id },
        text: item.text,
        artist: { ...item.user_created },
      });
    });

    // Wait for all promises to resolve
    await Promise.all(promises);
    // Sort feed
    feed.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
    console.log(feed.map((res) => res.date_created));

    ctx.status = 200;
    ctx.body = feed;
    return;
  } catch (err) {
    //console.log(err, ctx);
  }
});



// ********************* //
// Create Comment
// ********************* //
router.post(`${BASE_URL}/accountSetup`, async (ctx) => {
  const { type, email, return_url } = ctx.request.body;
  try {
    // check if email is valid
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      ctx.status = 400;
      ctx.body = "Invalid email";
      return;      
    } 
    switch (type) {
      case "instagram":
        // Trigger Email
        await triggerEmail({
          email: email,
          name: email,
          templateId: 100,
          params: {
            type: type,
            return_url: return_url || "https://loop.fans",
          },
        });
        break;
    
      default:
        break;
    }
    
    ctx.status = 200;
    ctx.body = "Email Sent";
    return
     
  } catch (err) {
    // return error
    ctx.status = 400;
    ctx.body = "An error occurred";
    return;
  }
});

export default router;
