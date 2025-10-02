import axios from "axios";
import SibApiV3Sdk from "sib-api-v3-sdk";
import { uchat_url, uchat_token, brevo_token } from "./constants.mjs";

const defaultClient = SibApiV3Sdk.ApiClient.instance;
let apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = brevo_token;

/* ============================== */
/* Create Contact */
/* ============================== */
export const createContact = async ({ email, first_name, uuid, listId }) => {
  try {
    // create contact
    let apiInstance = new SibApiV3Sdk.ContactsApi();
    let createContact = new SibApiV3Sdk.CreateContact();

    createContact.email = email;
    createContact.listIds = listId || [14]; // Brevo List ID for New Users
    createContact.attributes = {
      FIRSTNAME: first_name || "",
      UUID: uuid || "",
      USERTYPE: 1,
    };

    try {
      // send contact to Brevo
      const createBrevoContact = await apiInstance
        .createContact(createContact)
        .then((data) => {
          console.log("Brevo Contact Created " + JSON.stringify(data));
          data.exist_in_brevo = false;
          return data;
        });
      return createBrevoContact;
    } catch (error) {
      const getBrevoContact = await apiInstance
        .getContactInfo(email)
        .then((data) => {
          console.log("Brevo Contact Exists " + JSON.stringify(data));
          data.exist_in_brevo = true;
          return data;
        });
      return getBrevoContact;
    }
  } catch (err) {
    // Log Error with query for debugging
    //await logtail.error(`${err} - ${query}`);
    return;
  }
};

/* ============================== */
/* Update Contact Field */
/* ============================== */
export const updateContact = async ({ email, listIds, attributes }) => {
  try {
    console.log({ email, attributes });
    // create contact
    let apiInstance = new SibApiV3Sdk.ContactsApi();
    let updateContact = new SibApiV3Sdk.UpdateContact();

    let identifier = email; // String | Email (urlencoded) OR ID of the contact
    if (listIds) updateContact.listIds = listIds;
    updateContact.attributes = {
      ...attributes,
    };

    // send contact to Brevo
    const brevoResponse = await apiInstance
      .updateContact(identifier, updateContact)
      .then((data) => {
        console.log("API called successfully. " + data);
        return data;
      });

    return brevoResponse;
  } catch (err) {
    //console.log(err);
    // Log Error with query for debugging
    //await logtail.error(`${err} - ${query}`);
    return;
  }
};


/* ============================== */
// Remove from list
/* ============================== */
export const removeBrevoList = async ({ email, listId }) => {
  try {
    // create contact
    let apiInstance = new SibApiV3Sdk.ContactsApi();
    let contactEmails = new SibApiV3Sdk.RemoveContactFromList();
    contactEmails.emails = email; // make sure email is in array ["email@example.com"]

    // send contact to Brevo
    const brevoResponse = await apiInstance
      .removeContactFromList(listId, contactEmails)
      .then((data) => {
        console.log("API called successfully. " + data);
        return data;
      });

    return brevoResponse;
  } catch (err) {
    //console.log(err);
    // Log Error with query for debugging
    //await logtail.error(`${err} - ${query}`);
    return;
  }
};

/* ============================== */
// Trigger Transactional Email
/* ============================== */

export const triggerEmail = async ({ email, name, templateId, params }) => {
  try {
    let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
    console.log({ email, name, templateId, params })

    sendSmtpEmail.to = [{ email: email, name: name }];
    sendSmtpEmail.templateId = templateId;
    sendSmtpEmail.params = params || {};

    apiInstance.sendTransacEmail(sendSmtpEmail).then(
      function (data) {
        console.log(
          "API called successfully. Returned data: " + JSON.stringify(data)
        );
      },
      function (error) {
        console.log(error);
      }
    );
  } catch (error) {
    console.log({ error });
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
