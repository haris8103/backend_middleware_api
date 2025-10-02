import axios from "axios";
import Mixpanel from "mixpanel";

export const useMixpanel = () => {
  const mixpanel = Mixpanel.init("b46c3faa0e3cef9a8fdb5085f9d639cb");
  // create/update profile in mixpanel
  const createMixpanelProfile = async ({ user_id, data }) => {
    return mixpanel.people.set(user_id, data);
  };

  // send event to mixpanel
  const sendMixpanel = async ({ event, data }) => {
    return mixpanel.track(event, data);
  };

  return {
    sendMixpanel,
    createMixpanelProfile,
  };
};
