import Router from "koa-router";
import axios from "axios";
import {
  backendApiKey,
  backendUrl,
  logtail,
} from "../../../helpers/constants.mjs";
import { useMixpanel } from "../../../helpers/mixpanel.mjs";
import { apiRequest } from "../../../helpers/apicall.mjs";
const { sendMixpanel } = useMixpanel();

const router = new Router();
const BASE_URL = `/v1/scripts`;

// ********************* //
// FUNCTIONS
// ********************* //
// Function to generate a random code
function generateRandomCode(collectionId) {
  const numbers = "0123456789";
  let code = `${collectionId}-`;
  for (let i = 0; i < 7; i++) {
    code += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  return code;
}

// Function to check if a code is unique in the array
function isCodeUnique(generatedCodes, code) {
  return !generatedCodes.includes(code);
}

// Function to generate codes and store them in an array
function generateCodes(collectionId, numberOfCodes) {
  const generatedCodes = [];

  for (let i = 0; i < numberOfCodes; i++) {
    let code;
    do {
      code = generateRandomCode(collectionId);
    } while (!isCodeUnique(generatedCodes, code)); // Ensure the code is unique

    generatedCodes.push(code);
  }

  return generatedCodes;
}

// ********************* //
// Generate Codes
// ********************* //
router.post(`${BASE_URL}/codeGen`, async (ctx) => {
  try {
    const { collectionId, numberOfCodes } = ctx.request.body;
    const codes = generateCodes(collectionId, numberOfCodes);
    const adminCodes = generateCodes(`A-${collectionId}`, 10); // Generate 10 admin codes bringing the total to 10 + numberOfCodes

    // Log or handle the generated codes
    console.log(`\nGenerated ${codes.length} unique codes:`);

    // break codes into chunks of 50 for bulk insert
    const chunkedCodes = [];
    for (let i = 0; i < codes.length; i += 50) {
      chunkedCodes.push(codes.slice(i, i + 50));
    }

    // add 10 admin codes to the last chunk
    chunkedCodes[chunkedCodes.length - 1].push(...adminCodes);

    // Insert codes into the database
    for (let i = 0; i < chunkedCodes.length; i++) {
      console.log(`Inserting chunk ${i + 1} of ${chunkedCodes.length}`);
      await apiRequest(`
        mutation {
          create_collection_claim_codes_items(data: [
            ${chunkedCodes[i].map((code) => `{ collection: { id: "${collectionId}" }, code: "${code}" }`).join("\n")}
          ]) {
            id
            collection {
              id
            }
          }
        }
      `);
    }

    // wait for the codes to be inserted before returning
    ctx.status = 200;
    ctx.body = { numberOfCodes, codes };
    return;
  } catch (err) {
    console.log(err, ctx);
    ctx.status = 400;
    ctx.body = err;
    return;
  }
});

export default router;
