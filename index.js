const express = require('express');
const app = express();
const stripe = require('stripe')('sk_test')

app.use(
    express.json({
        verify: (req, res, buffer) => (req['rawBody'] = buffer),
    })
);

////// Data Model ///////

// TODO Implement a real database
// Reverse mapping of stripe to API key. Model this in your preferred database.
const customers = {
    // stripeCustomerId : data
    'apiKey': {
        apiKey: 'apiKey',
        active: true,
        itemId: 'itemId',
    },
};

const apiKeys = {
    'apiKeyHashed': 'apiKey' 
}

  
app.get('/api', async (req, res) => {
    const { apiKey } = req.query;
  
    if (!apiKey) {
      res.sendStatus(400); // bad request
    }
  
    const hashedAPIKey = hashAPIKey(apiKey);
  
    const customerId = apiKeys[hashedAPIKey];
    const customer = customers[customerId];
    
    if (!customer || !customer.active) {
        res.sendStatus(403); // not authorized
    } else {
        // Record usage with Stripe Billing
        const record = await stripe.subscriptionItems.createUsageRecord(
            customer.itemId,
            {
              quantity: 1,
              timestamp: 'now',
              action: 'increment',
            }
          );
        res.send({ data: '🔥🔥🔥🔥🔥🔥🔥🔥', usage: record });    
    }
    
  });

app.post('/checkout', async(req, res)=>{
    const sessions = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items:[
            {
                price: 'price_1KkCxsLbXjNSQaokY127syaT'
            }
        ],
        success_url: 'http://localhost:3000/succcss?session_id=2',
        cancel_url: 'http://localhost:5000/error'
    });
    
    res.send(sessions);
});

// Listen to webhooks from Stripe when important events happen
app.post('/webhook', async (req, res) => {
    let data;
    let eventType;
    // Check if webhook signing is configured.
    const webhookSecret = 'whsec_';

    if (webhookSecret) {
        // Retrieve the event by verifying the signature using the raw body and secret.
        let event;
        let signature = req.headers['stripe-signature'];

        try {
        event = stripe.webhooks.constructEvent(
            req['rawBody'],
            signature,
            webhookSecret
        );
        } catch (err) {
        console.log(`⚠️  Webhook signature verification failed.`);
        return res.sendStatus(400);
        }
        // Extract the object from the event.
        data = event.data;
        eventType = event.type;
    } else {
        // Webhook signing is recommended, but if the secret is not configured in `config.js`,
        // retrieve the event data directly from the request body.
        data = req.body.data;
        eventType = req.body.type;
    }

    switch (eventType) {
        case 'checkout.session.completed':
            console.log(data);
            // Data included in the event object:
            const customerId = data.object.customer;
            const subscriptionId = data.object.subscription;
      
            console.log(
              `💰 Customer ${customerId} subscribed to plan ${subscriptionId}`
            );
      
            // Get the subscription. The first item is the plan the user subscribed to.
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);
            const itemId = subscription.items.data[0].id;
      
            // Generate API key
            const { apiKey, hashedAPIKey } = generateAPIKey();
            console.log(`User's API Key: ${apiKey}`);
            console.log(`Hashed API Key: ${hashedAPIKey}`);

        break;
        case 'invoice.paid':
        // Continue to provision the subscription as payments continue to be made.
        // Store the status in your database and check when a user accesses your service.
        // This approach helps you avoid hitting rate limits.
        break;
        case 'invoice.payment_failed':
        // The payment failed or the customer does not have a valid payment method.
        // The subscription becomes past_due. Notify your customer and send them to the
        // customer portal to update their payment information.
        break;
        default:
        // Unhandled event type
    }

    res.sendStatus(200);
})

// Recursive function to generate a unique random string as API key
function generateAPIKey() {
    const { randomBytes } = require('crypto');
    const apiKey = randomBytes(16).toString('hex');
    const hashedAPIKey = hashAPIKey(apiKey);

      // Ensure API key is unique
    if (apiKeys[hashedAPIKey]) {
     generateAPIKey();
    } else {
    return { hashedAPIKey, apiKey };
    }
}
  
// Hash the API key
function hashAPIKey(apiKey) {
    const { createHash } = require('crypto');
  
    const hashedAPIKey = createHash('sha256').update(apiKey).digest('hex');
  
    return hashedAPIKey;
}

app.get('/usage/:customer', async (req, res) => {
    const customerId = req.params.customer;
    const invoice = await stripe.invoices.retrieveUpcoming({
      customer: customerId,
    });
  
    res.send(invoice);
});

app.listen(4000, ()=> console.log('listening on port 4000'));
