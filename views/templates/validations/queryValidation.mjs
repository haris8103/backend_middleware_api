

export function validateQueryParams(query) {
  const errors = [];
  const sanitized = {};

  // Validate page
  if (query.page !== undefined) {
    const page = parseInt(query.page, 10);
    if (isNaN(page) || page < 1) {
      errors.push({
        field: 'page',
        message: 'Page must be a positive integer',
        value: query.page
      });
    } else {
      sanitized.page = page;
    }
  }

  // Validate limit
  if (query.limit !== undefined) {
    const limit = parseInt(query.limit, 10);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      errors.push({
        field: 'limit',
        message: 'Limit must be between 1 and 100',
        value: query.limit
      });
    } else {
      sanitized.limit = limit;
    }
  }

  // Validate sort
  const allowedSortFields = [
    'name', '-name',
    'date_created', '-date_created', 
    // 'price', '-price',
    'sort', '-sort'
  ];
  
  if (query.sort !== undefined) {
    if (!allowedSortFields.includes(query.sort)) {
      errors.push({
        field: 'sort',
        message: `Invalid sort field. Allowed: ${allowedSortFields.join(', ')}`,
        value: query.sort
      });
    } else {
      sanitized.sort = query.sort;
    }
  }

  // Validate filter
  if (query.filter !== undefined) {
    const filter = String(query.filter).trim();
    if (filter.length > 100) {
      errors.push({
        field: 'filter',
        message: 'Filter must be less than 100 characters',
        value: query.filter
      });
    } else if (filter.length > 0) {
      sanitized.filter = filter;
    }
  }

  // Validate plans filter
  if (query.plans !== undefined) {
    if (Array.isArray(query.plans)) {
      // Handle array of plan IDs
      const planIds = query.plans.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
      if (planIds.length > 0) {
        sanitized.plans = planIds;
      }
    } else {
      // Handle single plan ID or comma-separated string
      const planInput = String(query.plans).trim();
      if (planInput.includes(',')) {
        const planIds = planInput.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
        if (planIds.length > 0) {
          sanitized.plans = planIds;
        }
      } else {
        const planId = parseInt(planInput, 10);
        if (!isNaN(planId)) {
          sanitized.plans = [planId];
        }
      }
    }
    
    if (query.plans !== undefined && !sanitized.plans) {
      errors.push({
        field: 'plans',
        message: 'Plans must be valid integer IDs (single ID, comma-separated, or array)',
        value: query.plans
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized
  };
}