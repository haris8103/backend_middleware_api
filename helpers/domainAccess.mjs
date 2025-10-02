import { apiRequest } from "./apicall.mjs";

/**
 * Updates domain collection access by creating or updating collection permissions
 * @param {string} domain - Domain name
 * @param {string} userId - User ID
 * @param {string} collectionName - Name of the collection to grant access to
 * @returns {Promise<Object>} - Returns the created/updated collection access
 */
export const updateDomainCollectionAccess = async (domain, userId, collectionName) => {
  try {
    // First check if domain exists and user has access
    const { domains } = await apiRequest(`
      query {
        domains(filter: { domain: { _eq: "${domain}" }, owner_id: { id: { _eq: "${userId}" } } }) {
          id
          collection_access
        }
      }
    `);

    if (!domains || !domains.length) {
      throw new Error("Domain not found or unauthorized");
    }

    const domainId = domains[0].id;
    const currentAccess = domains[0].collection_access || [];

    // Check if collection already exists in access list
    if (!currentAccess.includes(collectionName)) {
      // Add new collection to access list
      const updatedAccess = [...currentAccess, collectionName];
      console.log({updatedAccess});

      // Update domain with new collection access
      const { update_domains_item: updatedDomain } = await apiRequest(`
        mutation {
          update_domains_item(
            id: "${domainId}",
            data: {
              collection_access: ${JSON.stringify(updatedAccess).replace(/"(\w+)":/g, "$1:")}
            }
          ) {
            id
            domain
            collection_access
          }
        }
      `);

      return updatedDomain;
    }

    // Collection already exists in access list
    return domains[0];
  } catch (error) {
    console.error("Error updating domain collection access:", error);
    throw error;
  }
};
