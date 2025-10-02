import axios from "axios";
import Router from "koa-router";

import { apiRequest, apiRequestSystem } from "../../../helpers/apicall.mjs";
import authCheck from "../../../helpers/auth.mjs";
import { triggerEmail } from "../../../helpers/brevoSdk.mjs";
import { useMixpanel } from "../../../helpers/mixpanel.mjs";

const router = new Router();
const BASE_URL = `/v1/arena/inbox`;
const { sendMixpanel } = useMixpanel();

// Create Inbox Conversation List
router.post(`${BASE_URL}/createInbox`, async (ctx) => {
  try {
    const { cookie, receiver_id, title, message } = ctx.request.body;

    // Check JWT
    const userData = await authCheck({ cookie });

    // Check Cookie is present
    if (!cookie || !userData || !receiver_id || !title || !message) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const fetchUser = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          id
          sso_email
          first_name
          display_name
        }
      }
    `);

    const fetchReceiver = await apiRequestSystem(`
      query {
        users(filter: { id: { _eq: "${receiver_id}" } }) {
          id
          sso_email
          first_name
          display_name
        }
      }
    `);

    // Get User and Post Data
    const [user, receiver] = await Promise.all([fetchUser, fetchReceiver]);

    // User Id
    const { id: userId } = user.users[0];

    // Receiver Data
    const {
      sso_email: receiver_email,
      first_name: receiver_first_name,
      display_name: receiver_display_name,
    } = receiver.users[0];

    // Query Create Inbox
    const createInboxQuery = `
      mutation {
        create_inbox_item(
          data: {
            sender: { id: "${userId}" }
            receiver: { id: "${receiver_id}" }
            title: "${title}"
            messages: {
              creator: { id: "${userId}" }
              message: "${message}"
            }
          }
        ) {
          id
          title
          sender {
            id
            display_name
            first_name
            avatar {
              id
            }
          }
          messages {
            id
          }
        }
      }
    `;

    // Create Inbox and First Message
    const { create_inbox_item: inbox } = await apiRequest(createInboxQuery);

    // Send Transactional Email
    try {
      triggerEmail({
        email: receiver_email,
        name: receiver_display_name ?? receiver_first_name,
        templateId: 40,
      });
    } catch (error) {
      console.error(error);
    }

    // Send Mixpanel Event
    try {
      sendMixpanel({
        event: `Created new inbox`,
        data: {
          distinct_id: userId,
          event_name: "Created new inbox",
          inbox_id: inbox.id,
          title: title,
          to: receiver_id,
        },
      });
    } catch (error) {
      console.error(error);
    }

    ctx.status = 200;
    ctx.body = inbox;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// Inbox Conversation List
router.get(`${BASE_URL}/list`, async (ctx) => {
  try {
    const { user_cookie } = ctx.request.headers;
    const cookie = user_cookie;

    // Check JWT
    const userData = await authCheck({ cookie });

    // Check Cookie is present
    if (!cookie || !userData) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const fetchUsers = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          id
        }
      }
    `);

    // Get User and Post Data
    const [users] = await Promise.all([fetchUsers]);

    // User Id
    const { id: userId } = users.users[0];

    // Query Inbox
    const inboxQuery = `
      query {
        inbox(
          filter: {
            _or: [
              { sender: { id: { _eq: "${userId}" } } }
              { receiver: { id: { _eq: "${userId}" } } }
            ]
          }
        ){
          id
          title
          date_created
          sender {
            id
            display_name
            first_name
            avatar {
              id
            }
          }
          receiver {
            id
            display_name
            first_name
            avatar {
              id
            }
          }
          messages {
            id
            date_created
          }
        }
      }    
    `;

    // Fetch Inbox
    const { inbox } = await apiRequest(inboxQuery);

    // create object to store inbox data
    const inboxData = [];
    for (let i = 0; i < inbox.length; i++) {
      const { id, title, sender, receiver, messages } = inbox[i];
      const { display_name, first_name, avatar } = sender;
      const { id: avatarId } = avatar;
      const messageCount = messages.length;
      const lastMessage = messages[messageCount - 1];
      const { id: lastMessageId, content, created_at } = lastMessage;

      inboxData.push({
        id,
        title,
        sender: {
          id: sender.id,
          display_name: sender.display_name || sender.first_name,
          avatar: avatarId,
        },
        receiver: {
          id: receiver.id,
          display_name: receiver.display_name || receiver.first_name,
          avatar: receiver.avatar.id,
        },
        messageCount,
        lastMessage: {
          date_created: messages[messageCount - 1].date_created,
        },
        /* lastMessage: {
          id: lastMessageId,
          content,
          created_at
        } */
      });
    }

    // sort inbox by last message date
    inboxData.sort(
      (a, b) =>
        new Date(b.lastMessage.date_created) -
        new Date(a.lastMessage.date_created)
    );

    ctx.status = 200;
    ctx.body = inboxData;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// Create Inbox Conversation List
router.post(`${BASE_URL}/createMessage`, async (ctx) => {
  try {
    const { cookie, inbox_id, message } = ctx.request.body;
    const inboxId = parseInt(inbox_id);

    // Check JWT
    const userData = await authCheck({ cookie });

    // Check Cookie is present
    if (!cookie || !userData || !message) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const fetchUsers = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          id
        }
      }
    `);

    // Get User and Post Data
    const [users] = await Promise.all([fetchUsers]);

    // User Id
    const { id: userId } = users.users[0];

    // Query Create Inbox Message
    const createInboxQuery = `
      mutation {
        create_inboxMessages_item(
          data: {
            inboxId: {
              id: ${inboxId}
            }
            creator: { id: "${userId}"}
            message: "${message}"
          }
        ) {
          id
          message
          creator {
            id
            display_name
            first_name
            avatar {
              id
            }
          }
        }
      }
    `;

    // Create Inbox Message
    const { create_inboxMessages_item: inbox } = await apiRequest(
      createInboxQuery
    );

    // Send Mixpanel Event
    try {
      sendMixpanel({
        event: `New Inbox Message`,
        data: {
          distinct_id: userId,
          event_name: "New Inbox Message",
          inbox_id: inboxId,
        },
      });
    } catch (error) {
      console.error(error);
    }

    ctx.status = 200;
    ctx.body = inbox;
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

// Inbox Conversation Messages
router.get(`${BASE_URL}/messages`, async (ctx) => {
  try {
    const { user_cookie, inbox_id } = ctx.request.headers;
    const indexId = parseInt(inbox_id);
    const cookie = user_cookie;

    // Check JWT
    const userData = await authCheck({ cookie });

    // Check Cookie is present
    if (!cookie || !userData || !indexId) {
      ctx.status = 401;
      ctx.body = "Unauthorized";
      return;
    }

    const fetchUsers = await apiRequestSystem(`
      query {
        users(filter: { profile_id: { _eq: "${userData.profileId}" } }) {
          id
        }
      }
    `);

    // Get User and Post Data
    const [users] = await Promise.all([fetchUsers]);

    // User Id
    const { id: userId } = users.users[0];

    // Query Inbox
    const inboxQuery = `
      query {
        inboxMessages(
          filter: {
            _or: [
              {
                inboxId: {
                  id: { _eq: ${indexId} }
                  sender: { id: { _eq: "${userId}" } }
                }
              }
              {
                inboxId: {
                  id: { _eq: ${indexId} }
                  receiver: { id: { _eq: "${userId}" } }
                }
              }
            ]
          }) {
            inboxId {
              title
              sender {
                id
                display_name
                first_name
                avatar {
                  id
                }
              }
              receiver {
                id
                display_name
                first_name
                avatar {
                  id
                }
              }
            }
          creator {
            id
            first_name
            display_name
            avatar {
              id
            }
          }
          date_created
          message
        } 
      }
    `;

    // Fetch Inbox
    const { inboxMessages: inbox } = await apiRequest(inboxQuery);

    // create object to store inbox data
    const inboxInfo = [
      {
        title: inbox[0].inboxId.title,
        sender: {
          id: inbox[0].inboxId.sender.id,
          display_name:
            inbox[0].inboxId.sender.display_name ||
            inbox[0].inboxId.sender.first_name,
          avatar: inbox[0].inboxId.sender.avatar.id,
        },
        receiver: {
          id: inbox[0].inboxId.receiver.id,
          display_name:
            inbox[0].inboxId.receiver.display_name ||
            inbox[0].inboxId.receiver.first_name,
          avatar: inbox[0].inboxId.receiver.avatar.id,
        },
      },
    ];
    const messages = [];
    for (let i = 0; i < inbox.length; i++) {
      const { creator, date_created, message } = inbox[i];
      const { id: creatorId, first_name, display_name, avatar } = creator;
      const { id: avatarId } = avatar;

      messages.push({
        creator: {
          id: creatorId,
          display_name: display_name || first_name,
          avatar: avatarId,
        },
        date_created,
        message,
      });
    }

    // sort messages by date
    //messages.sort((a, b) => new Date(b.date_created) - new Date(a.date_created));

    ctx.status = 200;
    ctx.body = { inboxInfo, messages };
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

export default router;
