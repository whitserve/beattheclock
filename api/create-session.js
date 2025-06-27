import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

export default async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Handle both JSON and form-encoded data
    let email, goal;
    let formData;
    
    if (req.body && Object.keys(req.body).length > 0) {
      // If body is already parsed (JSON or form)
      formData = req.body;
    } else {
      // Parse form data manually if needed
      formData = await parseBody(req);
    }
    
    // Extract fields - try multiple possible field names
    email = formData.email || formData.Email;
    goal = formData.goal || formData.Goal || formData.text || formData.message;

    // Debug: log all received fields
    console.log('Received form data:', req.body || 'no req.body');
    
    // Validate required fields
    if (!email || !goal) {
      return res.status(400).json({ 
        error: 'Missing required fields: email and goal are required',
        received: { email: !!email, goal: !!goal },
        debug: { 
          allFields: req.body || 'no req.body',
          contentType: req.headers['content-type']
        }
      });
    }

    const deadline = Date.now() + 24 * 60 * 60 * 1000;   // 24 h

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { 
          name: 'Finish or Forfeit – Focus Deposit',
          description: `Goal: "${goal}"`
        },
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
  
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

// Helper function to parse request body
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        console.log('Raw body:', body);
        console.log('Content-Type:', req.headers['content-type']);
        
        // Try to parse as JSON first
        if (req.headers['content-type']?.includes('application/json')) {
          resolve(JSON.parse(body));
        } else {
          // Parse as form data (application/x-www-form-urlencoded)
          const params = new URLSearchParams(body);
          const result = {};
          for (const [key, value] of params) {
            result[key] = value;
          }
          console.log('Parsed form data:', result);
          resolve(result);
        }
      } catch (error) {
        console.error('Error parsing body:', error);
        reject(error);
      }
    });
    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
    });
  });
}
