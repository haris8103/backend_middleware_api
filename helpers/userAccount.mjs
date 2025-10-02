import axios from "axios";
import { apiRequestSystem } from "./apicall.mjs";

export const getFieldByUserId = async ({user_id, fields}) => {
  try {
    const response = await apiRequestSystem(`
      query {
        users_by_id(id: "${user_id}") {
          ${fields}
        }
      }
    `);
    return response.users_by_id;
  } catch (err) {
    // Log Error with query for debugging
    //await logtail.error(`${err} - ${query}`);
    console.log({err})
    return null;
  }
};