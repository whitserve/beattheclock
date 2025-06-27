import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

export default async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email parameter required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    console.log('Checking status for:', normalizedEmail);

    // Get recent payment intents to check status
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 100,
    });

    // Find all payments for this email
    const userPayments = paymentIntents.data.filter(pi => {
      const piEmail = pi.metadata.email?.toLowerCase().trim();
      return piEmail === normalizedEmail;
    });

    if (userPayments.length === 0) {
      return res.json({
        status: 'no_payments',
        message: 'No payments found for this email address.',
        showMessage: false
      });
    }

    // Sort by creation date (newest first)
    const sortedPayments = userPayments.sort((a, b) => b.created - a.created);
    const latestPayment = sortedPayments[0];
    const deadline = Number(latestPayment.metadata.deadline);
    const now = Date.now();

    let status, message, showMessage;

    if (latestPayment.status === 'canceled') {
      // User completed their goal!
      status = 'completed';
      message = '🎉 Congratulations! You completed your goal and your $5 has been refunded!';
      showMessage = true;
    } else if (latestPayment.status === 'succeeded') {
      // Payment was captured (user failed)
      status = 'failed';
      message = '😔 You missed your 24-hour deadline. Your $5 has been forfeited, but don\'t give up - try again!';
      showMessage = true;
    } else if (latestPayment.status === 'requires_capture' && now < deadline) {
      // Still active
      const hoursLeft = Math.round((deadline - now) / (1000 * 60 * 60));
      status = 'active';
      message = `⏰ Your goal is active! You have ${hoursLeft} hours left to complete it.`;
      showMessage = true;
    } else if (latestPayment.status === 'requires_capture' && now >= deadline) {
      // Expired but not yet captured (cron job will handle this)
      status = 'expired';
      message = '⏰ Your deadline has passed. Your payment will be processed shortly.';
      showMessage = true;
    } else {
      status = 'unknown';
      message = 'Unknown status.';
      showMessage = false;
    }

    return res.json({
      status,
      message,
      showMessage,
      goal: latestPayment.metadata.goal,
      deadline: new Date(deadline).toISOString(),
      email: normalizedEmail
    });

  } catch (error) {
    console.error('Error checking status:', error);
    return res.status(500).json({ 
      error: 'Failed to check status',
      details: error.message 
    });
  }
}; 