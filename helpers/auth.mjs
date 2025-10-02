import jwtDecode from "jwt-decode";
import axios from "axios";

// ********************* //
// Check JWT
// ********************* //
export default async function checkCookie({ cookie }) {
  try {
    const decoded = jwtDecode(cookie);
    const signitureCheck = await axios({
      url: `https://cloud.loop.fans/verify-token`,
      method: "post",
      data: {
        cookie,
      },
    });

    if (signitureCheck.data === true) {
      return decoded;
    }
    return false;
  } catch (error) {
    console.log("Error Checking Cookie, Is the verify server down?");
    console.log(error.response?.status);
    console.log(error.response?.statusText);
    if (error instanceof Error) {
      console.log(error.stack);
    }
    return false;
  }
}

// ********************* //
// GET WALLETS
// ********************* //
export async function getWallets({ cookie }) {
  try {
    const signitureCheck = await axios({
      url: `https://cloud.loop.fans/get-user-wallets`,
      method: "post",
      data: {
        cookie,
      },
    });
    if (signitureCheck.data === false) {
      return [];
    }
      return signitureCheck.data;
  } catch (error) {
    if (error instanceof Error) {
      console.log(error.stack);
    }
    return [];
  }
}
