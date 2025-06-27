import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

export default async (req, res) => {
  // Verify this is coming from Vercel Cron
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting cron job: checking for expired payments...');

    // Get all payment intents that need capture
    const paymentIntents = await stripe.paymentIntents.list({
      status: 'requires_capture',
      limit: 100,
    });

    console.log(`Found ${paymentIntents.data.length} payments requiring capture`);

    let expiredCount = 0;
    let capturedCount = 0;
    
    for (const pi of paymentIntents.data) {
      const deadline = Number(pi.metadata.deadline);
      const now = Date.now();
      
      if (now > deadline) {
        console.log(`Capturing expired payment: ${pi.id} for ${pi.metadata.email}`);
        
        try {
          // Capture the payment (charge the user)
          await stripe.paymentIntents.capture(pi.id, {
            metadata: {
              ...pi.metadata,
              captured_at: new Date().toISOString(),
              captured_reason: 'deadline_expired'
            }
          });
          
          capturedCount++;
          console.log(`Successfully captured payment ${pi.id}`);
          
        } catch (captureError) {
          console.error(`Failed to capture payment ${pi.id}:`, captureError);
        }
        
        expiredCount++;
      }
    }

    console.log(`Cron job completed: ${expiredCount} expired, ${capturedCount} captured`);
    
    return res.json({
      success: true,
      totalChecked: paymentIntents.data.length,
      expiredFound: expiredCount,
      successfullyCaptured: capturedCount,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Cron job error:', error);
    return res.status(500).json({ 
      error: 'Cron job failed',
      details: error.message 
    });
  }
}; 