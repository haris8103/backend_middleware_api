import Router from "koa-router";
import { apiRequest, apiRequestSystem } from "../../../helpers/apicall.mjs";
import { useMixpanel } from "../../../helpers/mixpanel.mjs";
import { authMiddleware } from "../../../auth/authMiddleware.mjs";
import { handleImageUpload } from "../../../helpers/uploadImage.mjs";
import fs from "fs";
import { updateDomainCollectionAccess } from "../../../helpers/domainAccess.mjs";

const router = new Router();
const BASE_URL = "/v1/wl";

// Helper to sanitize strings
const sanitizedString = (str) => (str ? str.replace(/"/g, '\\"') : "");

router.use(authMiddleware);

// ********************* //
// Enable/Create Event (POST)
// ********************* //
router.post(`${BASE_URL}/events`, async (ctx) => {
  try {
    const { domain } = ctx.request.body;
    if (!domain) {
      ctx.status = 400;
      ctx.body = { error: "Missing required fields: domain is required" };
      return;
    }

    const { user } = ctx.state;

    // Update domain collection access and verify ownership
    try {
      await updateDomainCollectionAccess(domain, user.id, "wl_events");
    } catch (error) {
      ctx.status = 404;
      ctx.body = { message: "Domain not found or unauthorized" };
      return;
    }

    // Get Domain Id
    const { domains: domainData } = await apiRequest(`
      query {
        domains(filter: { domain: { _eq: "${domain}" }, owner_id: { id: { _eq: "${user.id}" } } }) {
          id
        }
      }
    `);

    if (!domainData || !domainData.length) {
      ctx.status = 404;
      ctx.body = { message: "Domain not found or unauthorized" };
      return;
    }

    const { create_wl_events_item: eventData } = await apiRequest(`
      mutation {
        create_wl_events_item(
          data: {
            domain: { id: "${domainData[0].id}", domain: "${domain}" }
          }
        ) {
          id
          domain {
            domain
          }
        }
      }
    `);

    ctx.status = 201;
    ctx.body = { data: eventData };

  } catch (error) {
    ctx.status = error.response?.status || 500;
    ctx.body = error.response?.data || { error: "Internal Server Error" };
  }
});

// ********************* //
// Fetch Events (GET)
// ********************* //
router.get(`${BASE_URL}/events`, async (ctx) => {
  try {
    const { user } = ctx.state;

    const { wl_events: events } = await apiRequest(`
      query {
        wl_events(filter: { domain: { owner_id: { id: { _eq: "${user.id}" } } } }) {
          id
          domain {
            domain
          }
          banner {
            id
          }
          event_items {
            id,
            status,
            title,
            venue,
            date,
            ticket_price,
            is_sold_out,
            event_url
          }
        }
      }
    `);

    ctx.status = 200;
    ctx.body = { data: events };

  } catch (error) {

    ctx.status = error.response?.status || 500;
    ctx.body = error.response?.data || { error: "Internal Server Error" };
  }
});

// ********************* //
// Update Event Banner (PATCH)
// ********************* //
router.patch(`${BASE_URL}/events/:id`, async (ctx) => {
  try {
    const { id } = ctx.params;
    const { fields: { banner, domain }, files: { image } } = ctx.request.body;

    if (!domain) {
      // remove image
      if (image) {
        fs.unlinkSync(image.path);
      }
      ctx.status = 400;
      ctx.body = { error: "Domain is required" };
      return;
    }

    const { user } = ctx.state;

    // Verify user ownership
    const { wl_events: event } = await apiRequest(`
      query {
        wl_events(filter: { id: { _eq: "${id}" }, domain: { domain: { _eq: "${domain}" }, owner_id: { id: { _eq: "${user.id}" } } } }) {
          id
        }
      }
    `);

    if (!event || !event.length) {
      ctx.status = 404;
      ctx.body = { message: "Event not found or unauthorized" };
      return;
    }

    const newBannerId = await handleImageUpload(fs.createReadStream(image.path), banner);

    // Update only the banner
    const { update_wl_events_item: updatedEvent } = await apiRequest(`
      mutation {
        update_wl_events_item(
          id: "${id}",
          data: {
            banner: { id: "${newBannerId}" }
          }
        ) {
          id
        }
      }
    `);

    // Remove image
    if (image) {
      fs.unlinkSync(image.path);
    }

    ctx.status = 200;
    ctx.body = { data: updatedEvent };
  } catch (error) {
    if (image) {
      fs.unlinkSync(image.path);
    }
    ctx.status = error.response?.status || 500;
    ctx.body = error.response?.data || { error: "Internal Server Error" };
  }
});

// ********************* //
// Create Event Item (POST)
// ********************* //
router.post(`${BASE_URL}/events/:id/items`, async (ctx) => {
  try {
    const { id: eventId } = ctx.params;
    const {
      status,
      title,
      venue,
      date,
      ticket_price,
      is_sold_out,
      event_url,
      domain } = ctx.request.body;
      
    if (!title || !date || !domain) {
      ctx.status = 400;
      ctx.body = { error: "Missing required fields: title and date are required" };
      return;
    }

    const { user } = ctx.state;
    const event_Id = Number(eventId);

    // Verify user ownership of the event
    const { wl_events: event } = await apiRequest(`
      query {
        wl_events(filter: { id: { _eq: ${event_Id} }, domain: { domain: { _eq: "${domain}" }, owner_id: { id: { _eq: "${user.id}" } } } }) {
          id
        }
      }
    `);
    
    if (!event || !event.length) {
      ctx.status = 404;
      ctx.body = { message: "Event not found or unauthorized" };
      return;
    }

    const sanitizedTitle = sanitizedString(title);
    const sanitizedVenue = venue ? sanitizedString(venue) : null;
    const sanitizedEventUrl = event_url ? sanitizedString(event_url) : null;

    const { create_event_items_items: itemData } = await apiRequest(`
      mutation {
        create_event_items_items(
          data: {
            event_id: {
              id: ${event_Id}
            },
            status: ${status ? `"${status}"` : "draft"},
            title: "${sanitizedTitle}",
            venue: ${sanitizedVenue ? `"${sanitizedVenue}"` : ""},
            date: "${date}",
            ticket_price: ${ticket_price ? `${ticket_price}` : 0},
            is_sold_out: ${is_sold_out ? is_sold_out : false},
            event_url: ${sanitizedEventUrl ? `"${sanitizedEventUrl}"` : ""}
          }
        ) {
          id
        }
      }
    `);

    ctx.status = 201;
    ctx.body = { data: itemData };
  } catch (error) {
    ctx.status = error.response?.status || 500;
    ctx.body = error.response?.data || { error: "Internal Server Error" };
  }
});

// ********************* //
// Update Event Item (PATCH)
// ********************* //
router.patch(`${BASE_URL}/events/:eventId/items/:itemId`, async (ctx) => {
  try {
    const { eventId, itemId } = ctx.params;
    const { title, status, venue, date, ticket_price, is_sold_out, event_url, domain } = ctx.request.body;

    if (!domain) {
      ctx.status = 400;
      ctx.body = { error: "Missing required field: domain" };
      return;
    }

    const { user } = ctx.state;
    const event_Id = Number(eventId);
    const item_Id = Number(itemId);

    // Verify user ownership of the event
    const { wl_events: event } = await apiRequest(`
      query {
        wl_events(filter: { id: { _eq: ${event_Id} }, domain: { domain: { _eq: "${domain}" }, owner_id: { id: { _eq: "${user.id}" } } } }) {
          id
          event_items(filter: { id: { _eq: ${item_Id} } }) {
            id
          }
        }
      }
    `);
    
    if (!event || !event.length || !event[0].event_items || !event[0].event_items.length) {
      ctx.status = 404;
      ctx.body = { message: "Event or item not found or unauthorized" };
      return;
    }
    
    const updateFields = [];
    if (title) updateFields.push(`title: "${sanitizedString(title)}"`);
    if (status) updateFields.push(`status: "${status}"`);
    if (venue) updateFields.push(`venue: "${sanitizedString(venue)}"`);
    if (date) updateFields.push(`date: "${date}"`);
    if (ticket_price !== undefined) updateFields.push(`ticket_price: ${ticket_price.toFixed(2)}`);
    if (is_sold_out !== undefined) updateFields.push(`is_sold_out: ${is_sold_out}`);
    if (event_url) updateFields.push(`event_url: "${sanitizedString(event_url)}"`);

    if (updateFields.length === 0) {
      ctx.status = 400;
      ctx.body = { error: "No fields to update" };
      return;
    }

    const { update_event_items_item: updatedItem } = await apiRequest(`
      mutation {
        update_event_items_item(
          id: ${item_Id},
          data: {
            ${updateFields.join(",\n            ")}
          }
        ) {
          id
          title
          status
          venue
          date
          ticket_price
          is_sold_out
          event_url
        }
      }
    `);

    ctx.status = 200;
    ctx.body = { data: updatedItem };

  } catch (error) {
    ctx.status = error.response?.status || 500;
    ctx.body = error.response?.data || { error: "Internal Server Error" };
  }
});

// ********************* //
// Delete Event Item (DELETE)
// ********************* //
router.delete(`${BASE_URL}/events/:eventId/items/:itemId`, async (ctx) => {
  try {
    const { eventId, itemId } = ctx.params;
    const { domain } = ctx.query;

    if (!domain) {
      ctx.status = 400;
      ctx.body = { error: "Missing required query parameter: domain" };
      return;
    }

    const { user } = ctx.state;
    const event_Id = Number(eventId);
    const item_Id = Number(itemId);

    // Verify user ownership of the event
    const { wl_events: event } = await apiRequest(`
      query {
        wl_events(filter: { id: { _eq: ${event_Id} }, domain: { domain: { _eq: "${domain}" }, owner_id: { id: { _eq: "${user.id}" } } } }) {
          id
          event_items(filter: { id: { _eq: ${item_Id} } }) {
            id
          }
        }
      }
    `);
    
    if (!event || !event.length || !event[0].event_items || !event[0].event_items.length) {
      ctx.status = 404;
      ctx.body = { message: "Event or item not found or unauthorized" };
      return;
    }

    await apiRequest(`
      mutation {
        delete_event_items_item(id: ${item_Id}) {
          id
        }
      }
    `);

    ctx.status = 200;
    ctx.body = {
      message: "Event item deleted successfully",
      event_id: event_Id,
      item_id: item_Id
    };

  } catch (error) {
    ctx.status = error.response?.status || 500;
    ctx.body = error.response?.data || { error: "Internal Server Error" };
  }
});

export default router;