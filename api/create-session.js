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
    console.log('Parsed form data:', formData);
    
    // Validate required fields
    if (!email || !goal) {
      return res.status(400).json({ 
        error: 'Missing required fields: email and goal are required',
        received: { email: !!email, goal: !!goal },
        debug: { 
          allFields: req.body || 'no req.body',
          parsedData: formData,
          contentType: req.headers['content-type']
        }
      });
    }

    const deadline = Date.now() + 24 * 60 * 60 * 1000;   // 24 h

    console.log('Creating Stripe session with:', { email, goal, deadline });
    console.log('Environment check:', {
      hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
      stripeKeyStart: process.env.STRIPE_SECRET_KEY?.substring(0, 7),
      hasSiteUrl: !!process.env.SITE_URL,
      siteUrl: process.env.SITE_URL
    });

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
    
    // Provide more specific error information
    let errorMessage = 'Failed to create checkout session';
    let statusCode = 500;
    
    if (error.type === 'StripeInvalidRequestError') {
      errorMessage = `Stripe error: ${error.message}`;
      statusCode = 400;
    } else if (error.code === 'resource_missing') {
      errorMessage = 'Stripe configuration error - check API keys';
      statusCode = 500;
    } else if (!process.env.STRIPE_SECRET_KEY) {
      errorMessage = 'Missing Stripe API key configuration';
      statusCode = 500;
    } else if (!process.env.SITE_URL) {
      errorMessage = 'Missing SITE_URL configuration';
      statusCode = 500;
    }
    
    return res.status(statusCode).json({ 
      error: errorMessage,
      details: error.message,
      type: error.type || 'Unknown',
      debug: {
        hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
        hasSiteUrl: !!process.env.SITE_URL
      }
    });
  }
};

// Helper function to parse request body
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        console.log('Raw body length:', body.length);
        console.log('Content-Type:', contentType);
        
        // Handle multipart/form-data (what Carrd sends)
        if (contentType.includes('multipart/form-data')) {
          const boundary = contentType.split('boundary=')[1];
          console.log('Boundary:', boundary);
          
          const result = {};
          // Split by boundary and parse each part
          const parts = body.split(`--${boundary}`);
          console.log('Found', parts.length, 'parts');
          
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.includes('Content-Disposition: form-data')) {
              console.log(`Processing part ${i}:`, part.substring(0, 200));
              
              // Extract field name
              const nameMatch = part.match(/name="([^"]+)"/);
              if (nameMatch) {
                const fieldName = nameMatch[1];
                // Extract value (after the double newline)
                const lines = part.split('\r\n');
                let valueStartIndex = -1;
                
                // Find where the actual value starts (after headers)
                for (let j = 0; j < lines.length; j++) {
                  if (lines[j] === '' && j + 1 < lines.length) {
                    valueStartIndex = j + 1;
                    break;
                  }
                }
                
                if (valueStartIndex !== -1 && lines[valueStartIndex]) {
                  result[fieldName] = lines[valueStartIndex].trim();
                  console.log(`Extracted ${fieldName}:`, result[fieldName]);
                }
              }
            }
          }
          
          console.log('Final parsed result:', result);
          resolve(result);
          return;
        }
        
        // Handle JSON
        if (contentType.includes('application/json')) {
          resolve(JSON.parse(body));
          return;
        }
        
        // Handle URL-encoded form data
        const params = new URLSearchParams(body);
        const result = {};
        for (const [key, value] of params) {
          result[key] = value;
        }
        console.log('Parsed URL-encoded data:', result);
        resolve(result);
        
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
