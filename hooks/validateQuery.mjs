// Middleware to validate and sanitize query
export const validateQuery = async ({ ctx, query }) => {
  if (!query || typeof query !== "string" || query.trim().length === 0) {
    ctx.status = 400;
    ctx.body = { message: "Query is required and must be a non-empty string" };
    return;
  }

  // Sanitize the query
  return query.trim().replace(/<[^>]*>?/gm, "");
};

// Middleware to check for specific keywords
export const checkQueryKeywords = async ({ ctx, query }) => {
  if (
    query.includes("email") ||
    query.includes("password") ||
    query.includes("token") ||
    query.includes("secret") ||
    query.includes("user_created")
  ) {
    ctx.status = 400;
    ctx.body = { message: "Invalid query" };
    return;
  }

  return query;
};
