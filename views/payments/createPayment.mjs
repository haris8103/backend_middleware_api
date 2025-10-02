import axios from "axios";
import stripe from "stripe";

const wompiURL = process.env.REACT_WOMPI_API;
const wompiKey = process.env.REACT_WOMPI_KEY;
const stripeClient = stripe(process.env.STRIPE_KEY);

// ********************* //
// Payment Providers
// ********************* //
export async function createPayment({
  name,
  description,
  single_use,
  collect_shipping,
  currency,
  amount_in_cents,
  expires_at,
  redirect_url,
  provider,
  number_of_nfts,
}) {
  switch (provider.toLowerCase()) {
    case "wompi":
      return await createWompiPayment({
        name:name,
        description,
        single_use,
        collect_shipping,
        currency,
        amount_in_cents,
        expires_at,
        redirect_url,
      });
    case "stripe":
      return await createStripePayment({
        name,
        description,
        single_use,
        collect_shipping,
        currency,
        amount_in_cents,
        expires_at,
        redirect_url,
        number_of_nfts,
      });
    default:
      throw new Error("Invalid payment provider");
  }
}

// ********************* //
// Create Wompi Payment
// ********************* //
async function createWompiPayment({
  name,
  description,
  single_use,
  collect_shipping,
  currency,
  amount_in_cents,
  expires_at,
  redirect_url,
}) {
  const wompi_gateway = await axios.post(
  `${wompiURL}/payment_links`,
    {
      name,
      description: description ? ". . ." : ". . .",
      single_use,
      collect_shipping,
      currency,
      amount_in_cents,
      expires_at, // Expiry date in ISO 8601 format and UTC timezone
      redirect_url,
    },
    {
      headers: {
        Authorization: `Bearer ${wompiKey}`,
      },
    }
  );

  const payment = wompi_gateway.data.data;
  return { id: payment.id, url: `https://checkout.wompi.co/l/${payment.id}` };
}



// ********************* //
// Create Stripe Payment
// ********************* //
async function createStripePayment({
  name,
  description,
  single_use,
  collect_shipping,
  currency,
  amount_in_cents,
  expires_at,
  redirect_url,
  number_of_nfts,
}) {
  const payment = {
    line_items: [
      {
        price_data: {
          product_data: {
            name,
            //description
          },
          currency,
          unit_amount: parseInt(amount_in_cents/number_of_nfts), //TODO: pull from query
        },
        quantity: parseInt(number_of_nfts),
      },
    ],
    phone_number_collection: {
      enabled: true,
    },
    mode: 'payment',
    success_url: `${redirect_url}?id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${redirect_url}?id={CHECKOUT_SESSION_ID}`,
  };
  const session = await stripeClient.checkout.sessions.create(payment);
  return { id: session.id, url: session.url };
}