import axios from "axios";
import { uchat_url, uchat_token, logtail } from "../helpers/constants.mjs";

/* ============================== */
/* Add Tag to uChat */
/* ============================== */
export const addTag = async ({ user_ns, tag_name }) => {

  try {
    const response = await axios({
      url: `${uchat_url}/subscriber/add-tag`,
      method: "post",
      headers: { Authorization: `Bearer ${uchat_token}` },
      data: {
        user_ns: user_ns,
        tag_ns: tag_name,
      },
    });

    console.log("Tag Added to uChat");
    return response.status === 200 ? response.data : null;
  } catch (err) {
    console.log(err);
    // Log Error with query for debugging
    //await logtail.error(`${err} - ${query}`);
    return;
  }
};


/* ============================== */
/* Add User to uChat */
/* ============================== */
export const addUser = async ({ user, createTag }) => {
  try {
    const response = await axios({
      url: `${uchat_url}/subscriber/create`,
      method: "post",
      headers: { Authorization: `Bearer ${uchat_token}` },
      data: user,
    });
    const { user_ns } = response.data.data;

    if (user_ns !== undefined && createTag) {
      //await addTag({ user_ns, tag_name: "f74609t178435" });
      await TriggerFlow({ user_ns, sub_flow_ns: "f74609s459619" });
    }

    console.log("User Added to uChat");
    return response.data.data;
  } catch (err) {
    console.log(err);
    // Log Error with query for debugging
    //await logtail.error(`${err} - ${query}`);
    return;
  }
};


/* ============================== */
/* Trigger Flow */
/* ============================== */
export const TriggerFlow = async ({ user_ns, sub_flow_ns }) => {

  try {
    const response = await axios({
      url: `${uchat_url}/subscriber/send-sub-flow`,
      method: "post",
      headers: { Authorization: `Bearer ${uchat_token}` },
      data: {
        user_ns: user_ns,
        sub_flow_ns: sub_flow_ns,
      },
    });

    console.log(`Flow Triggered: ${sub_flow_ns}`);
    return response.status === 200 ? response.data : null;
  } catch (err) {
    console.log(err);
    // Log Error with query for debugging
    //await logtail.error(`${err} - ${query}`);
    return;
  }
};
