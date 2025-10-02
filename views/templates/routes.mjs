import Router from "koa-router";
import { apiRequest } from "../../helpers/apicall.mjs";
import { validateQueryParams } from "./validations/queryValidation.mjs";

const router = new Router();
const BASE_URL = "/v1/templates";

// ********************* //
// Get Templates List
// ********************* //
router.get(BASE_URL, async (ctx) => {
  try {
    const validation = validateQueryParams(ctx.query);

    if (!validation.isValid) {
      ctx.status = 400;
      ctx.body = {
        error: "Validation Error",
        message: "Invalid query parameters",
        status: 400,
        details: validation.errors,
      };
      return;
    }

    const queryParams = {
      page: 1,
      limit: 10,
      ...validation.sanitized,
    };

    const { page, limit, sort, filter, plans } = queryParams;
    const offset = (page - 1) * limit;

    // Build sort clause
    let sortClause = "";
    if (sort) {
      // const sortDirection = sort.startsWith('-') ? 'desc' : 'asc';
      // const sortField = sort.replace(/^-/, '');
      sortClause = `sort: ["${sort}"]`;
    }

    let filterClause = 'filter: { status: { _eq: "published" } }';
    
    const filterConditions = ['status: { _eq: "published" }'];
    
    if (filter) {
      filterConditions.push(`name: { _icontains: "${filter}" }`);
    }
    
    if (plans && plans.length > 0) {
      if (plans.length === 1) {
        filterConditions.push(`subscription_plan: { id: { _eq: ${plans[0]} } }`);
      } else {
        filterConditions.push(`subscription_plan: { id: { _in: [${plans.join(', ')}] } }`);
      }
    }
    
    if (filterConditions.length > 1) {
      filterClause = `filter: { ${filterConditions.join(', ')} }`;
    }

    const query = `
      query {
        website_templates(
          limit: ${limit},
          offset: ${offset},
          ${sort ? sortClause + "," : ""}
          ${filterClause ? filterClause + "," : ""}
        ) {
          id
          date_created
          date_updated
          name
          description
          image {
            id
          }
          subscription_plan{
            id
            name
            price_cents
          }
        }
        website_templates_aggregated(${filterClause}) {
          count {
            id
          }
        }
      }
    `;
    const response = await apiRequest(query);

    ctx.status = 200;
    ctx.body = response;
  } catch (err) {
    console.error("Error fetching templates:", err);

    ctx.status = err.response?.status || 500;
    ctx.body = {
      error: "Internal Server Error",
      message: err.message || "An unexpected error occurred",
      status: err.response?.status || 500,
    };
  }
});

export default router;
