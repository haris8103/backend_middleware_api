import axios from 'axios';
import { BREVO_API_KEY } from './constants.mjs';

/**
 * Update or create a contact in Brevo
 * @param {Object} params - Contact parameters
 * @param {string} params.email - Contact email address
 * @param {Array<number>} [params.listIds] - List IDs to add the contact to
 * @param {Object} [params.attributes] - Additional contact attributes
 * @returns {Promise<Object>} - API response
 */
export const updateContact = async ({ email, listIds = [], attributes = {} }) => {
  try {
    if (!email) {
      throw new Error('Email is required');
    }

    const response = await axios({
      method: 'post',
      url: 'https://api.brevo.com/v3/contacts',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
      data: {
        email,
        listIds,
        attributes,
        updateEnabled: true, // Update the contact if it already exists
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error updating contact in Brevo:', error.response?.data || error.message);
    throw error;
  }
};

/**
 * Get contact information from Brevo
 * @param {string} email - Contact email address
 * @returns {Promise<Object>} - Contact data
 */
export const getContact = async (email) => {
  try {
    if (!email) {
      throw new Error('Email is required');
    }

    const response = await axios({
      method: 'get',
      url: `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY,
      },
    });

    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null; // Contact not found
    }
    console.error('Error getting contact from Brevo:', error.response?.data || error.message);
    throw error;
  }
};
