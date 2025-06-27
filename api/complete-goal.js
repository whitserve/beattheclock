import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });

export default async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Handle form data (same multipart parsing as create-session)
    let email, accomplishment;
    let formData;
    
    if (req.body && Object.keys(req.body).length > 0) {
      formData = req.body;
    } else {
      formData = await parseBody(req);
    }
    
    // Extract fields - try multiple possible field names
    email = formData.email || formData.Email;
    accomplishment = formData.accomplishment || formData.what_finished || formData.finished || formData.text || formData.message;
    
    // Debug: log all received fields (same as create-session.js)
    console.log('Received form data:', req.body || 'no req.body');
    console.log('Parsed form data:', formData);
    
    // Normalize email
    email = email?.toLowerCase().trim();
    
    console.log('Goal completion attempt:', { email, accomplishment });
    
    if (!email) {
      return res.status(400).json({ 
        error: 'Email is required',
        received: { email: !!email, accomplishment: !!accomplishment },
        debug: { 
          allFields: req.body || 'no req.body',
          parsedData: formData,
          contentType: req.headers['content-type']
        }
      });
    }

    // Find user's active payments
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 100, // Get more results to search through
    });

    // Filter by email and active status
    const userPayments = paymentIntents.data.filter(pi => {
      const piEmail = pi.metadata.email?.toLowerCase().trim();
      const deadline = Number(pi.metadata.deadline);
      const isActive = Date.now() < deadline && pi.status === 'requires_capture';
      
      return piEmail === email && isActive;
    });

    console.log(`Found ${userPayments.length} active payments for ${email}`);

    if (userPayments.length === 0) {
      return res.redirect(303, `https://beattheclock.carrd.co#no-goal-found`);
    }

    // Get the most recent active payment
    const latestPayment = userPayments.sort((a, b) => b.created - a.created)[0];
    
    console.log('Processing refund for payment:', latestPayment.id);

    // Cancel the payment (refund the user)
    await stripe.paymentIntents.cancel(latestPayment.id);

    // Log the accomplishment for your records
    console.log('Goal completed:', {
      email: email,
      goal: latestPayment.metadata.goal,
      accomplishment: accomplishment,
      paymentId: latestPayment.id,
      completedAt: new Date().toISOString()
    });

    // Redirect to success page
    return res.redirect(303, `https://beattheclock.carrd.co#completed`);

  } catch (error) {
    console.error('Error processing goal completion:', error);
    return res.status(500).json({ 
      error: 'Failed to process goal completion',
      details: error.message 
    });
  }
};

// Helper function to parse request body (same as create-session.js)
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
          const parts = body.split(`--${boundary}`);
          console.log('Found', parts.length, 'parts');
          
          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.includes('Content-Disposition: form-data')) {
              console.log(`Processing part ${i}:`, part.substring(0, 200));
              
              const nameMatch = part.match(/name="([^"]+)"/);
              if (nameMatch) {
                const fieldName = nameMatch[1];
                
                const headerContentSplit = part.split('\r\n\r\n');
                if (headerContentSplit.length >= 2) {
                  let value = headerContentSplit[1];
                  value = value.split('\r\n')[0].trim();
                  
                  if (value && value !== '') {
                    result[fieldName] = value;
                    console.log(`Extracted ${fieldName}:`, result[fieldName]);
                  }
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