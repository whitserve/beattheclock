import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

export default async (req, res) => {
  const { pi, complete } = req.query;      // complete=true when user clicks "Done"

  const intent = await stripe.paymentIntents.retrieve(pi);
  const deadline = Number(intent.metadata.deadline);

  if (complete === 'true' && Date.now() < deadline) {
    await stripe.paymentIntents.cancel(pi);      // void, no fee
    return res.json({ status: 'voided' });
  }

  if (Date.now() > deadline && intent.status === 'requires_capture') {
    await stripe.paymentIntents.capture(pi);     // loser, fee applied
    return res.json({ status: 'captured' });
  }

  return res.json({ status: 'no-action' });
};
