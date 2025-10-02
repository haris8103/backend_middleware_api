import { logtail } from "./constants.mjs";

export const sendLog = async (type, message, object) => {
  // Check the type of log
  switch (type) {
    case "info":
      logtail.info(message, object);
      break;
    case "warn":
      logtail.warn(message, object);
      break;
    case "error":
      logtail.error(message);
      break;
    default:
      logtail.info(message, object);
  }

  // Flush and send to Logtail
  logtail.flush();
};
