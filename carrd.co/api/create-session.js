import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

export default async (req, res) => {
  const { email, goal } = req.body;           // Carrd form sends POST JSON
  const deadline = Date.now() + 24 * 60 * 60 * 1000;   // 24 h

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: 'Finish or Forfeit – Focus Deposit' },
        unit_amount: 500,
      },
      quantity: 1,
    }],
    payment_intent_data: {
      capture_method: 'manual',
      metadata: { email, goal, deadline },
    },
    success_url: `${process.env.SITE_URL}/done?pi={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.SITE_URL}`,
  });

  return res.redirect(303, session.url);
};
