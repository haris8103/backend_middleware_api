import axios from "axios";
import { backendUrl, backendApiKey, logtail } from "../helpers/constants.mjs";

export const apiRequest = async (query) => {
  try {
    // console.log(query)
    const response = await axios({
      url: `${backendUrl}/graphql`,
      method: "post",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: { query },
    });
    // console.log(response.data)
    return response.data.data;
  } catch (err) {
    
    const graphqlErrors = err.response?.data?.errors;
    if (graphqlErrors) {
      const error = new Error('GraphQL Error');
      console.error('GraphQL Error', JSON.stringify(graphqlErrors));
      error.response = {
        data: graphqlErrors
      };
      throw error;
    }
    const error = new Error(err.message);
    error.response = err.response;
    throw error;
  }
};

export const apiRequestSystem = async (query) => {
  try {
    const response = await axios({
      url: `${backendUrl}/graphql/system`,
      method: "post",
      headers: { Authorization: `Bearer ${backendApiKey}` },
      data: { query },
    });
    return response.data.data;
  } catch (err) {
    console.log({err})
    // Log Error with query for debugging
    //await logtail.error(`${err} - ${query}`);
    return null;
  }
};