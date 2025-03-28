// Import the express and fetch libraries
const express = require('express');
const fetch = require("node-fetch");
const hbs = require("hbs");
const path = require('path');
const session = require('express-session');

// Create a new express application
const app = express();
app.set("view engine", "hbs");
app.set("views", `${process.cwd()}/views`);
app.set('view options', { layout: 'layouts/main' });

// Session middleware
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // set to true if using HTTPS
}));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to check authentication
const requireAuth = (req, res, next) => {
    if (!req.session.access_token) {
        return res.redirect('/');
    }
    next();
};

// Routes for our application
app.get('/statistics', requireAuth, (req, res) => {
    res.render('statistics', { isStatistics: true });
});

app.get('/orders', requireAuth, async (req, res) => {
    try {
        // Extract user ID from the access token
        const user_id = parseInt(req.session.access_token.split('.')[0]);
        
        if (isNaN(user_id)) {
            console.error('Invalid user ID from token');
            return res.render('orders', { 
                isOrders: true, 
                error: 'Invalid authentication token'
            });
        }

        console.log('Fetching shops for user ID:', user_id);
        console.log('Using access token:', req.session.access_token);

        // First, get the user's shops
        const shopsResponse = await fetch(
            `https://api.etsy.com/v3/application/users/${user_id}/shops`,
            {
                headers: {
                    'Authorization': `Bearer ${req.session.access_token}`,
                    'x-api-key': clientID
                }
            }
        );

        console.log('Shops API Response Status:', shopsResponse.status);
        console.log('Shops API Response Headers:', shopsResponse.headers);

        if (!shopsResponse.ok) {
            const errorData = await shopsResponse.json();
            console.error('Shops API Error Details:', {
                status: shopsResponse.status,
                statusText: shopsResponse.statusText,
                error: errorData
            });
            return res.render('orders', { 
                isOrders: true, 
                error: `Failed to fetch shop information: ${errorData.error || 'Unknown error'}`
            });
        }

        const shopsData = await shopsResponse.json();
        console.log('Shops API Response Data:', JSON.stringify(shopsData, null, 2));
        
        // Check if we have a valid shop object
        if (!shopsData.shop_id) {
            console.log('No valid shop data found in response');
            return res.render('orders', { 
                isOrders: true, 
                error: 'No shops found for this user. Please make sure you have at least one Etsy shop.',
                debug: {
                    user_id,
                    response_data: shopsData
                }
            });
        }

        // Use the shop data directly since it's not in a results array
        const shop = shopsData;
        console.log('Found shop:', shop);
        const shop_id = shop.shop_id;
        
        // Fetch orders for the shop
        console.log('Fetching orders for shop ID:', shop_id);
        const ordersResponse = await fetch(
            `https://api.etsy.com/v3/application/shops/${shop_id}/receipts`,
            {
                headers: {
                    'Authorization': `Bearer ${req.session.access_token}`,
                    'x-api-key': clientID
                }
            }
        );

        console.log('Orders API Response Status:', ordersResponse.status);

        if (!ordersResponse.ok) {
            const errorData = await ordersResponse.json();
            console.error('Orders API Error Details:', {
                status: ordersResponse.status,
                statusText: ordersResponse.statusText,
                error: errorData
            });
            return res.render('orders', { 
                isOrders: true, 
                error: `Failed to fetch orders: ${errorData.error || 'Unknown error'}`,
                shop_name: shop.shop_name
            });
        }

        const ordersData = await ordersResponse.json();
        console.log('Orders API Response Data:', JSON.stringify(ordersData, null, 2));
        
        // Transform the orders data to match our view
        const orders = ordersData.results.map(order => ({
            id: order.receipt_id,
            customer: order.buyer_user_id,
            items: order.transactions.length,
            total: order.total_price,
            status: order.status,
            date: new Date(order.created_timestamp * 1000).toLocaleDateString(),
            statusClass: getStatusClass(order.status)
        }));

        res.render('orders', { 
            isOrders: true, 
            orders,
            shop_name: shop.shop_name
        });

    } catch (error) {
        console.error('Unexpected Error:', error);
        console.error('Error Stack:', error.stack);
        res.render('orders', { 
            isOrders: true, 
            error: `An unexpected error occurred: ${error.message}`,
            debug: {
                error_stack: error.stack
            }
        });
    }
});

// Helper function to get status class for styling
function getStatusClass(status) {
    switch (status.toLowerCase()) {
        case 'completed':
            return 'bg-green-100 text-green-800';
        case 'pending':
            return 'bg-yellow-100 text-yellow-800';
        case 'shipped':
            return 'bg-blue-100 text-blue-800';
        case 'cancelled':
            return 'bg-red-100 text-red-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
}

app.get('/listings', (req, res) => {
    // Example listings data
    const listings = [
        { title: 'Handmade Ceramic Mug', price: '24.99', stock: 15, category: 'Home Decor', views: 245 },
        { title: 'Knitted Wool Scarf', price: '34.50', stock: 8, category: 'Accessories', views: 189 }
    ];
    res.render('listings', { isListings: true, listings });
});

// Send a JSON response to a default get request
app.get('/ping', async (req, res) => {
    const requestOptions = {
        'method': 'GET',
        'headers': {
            'x-api-key': 'ozohjuyhb60cgi2j6h5pp3tx',
        },
    };

    const response = await fetch(
        'https://api.etsy.com/v3/application/openapi-ping',
        requestOptions
    );

    if (response.ok) {
        const data = await response.json();
        res.send(data);
    } else {
        res.send("oops");
    }
});

/**
These variables contain your API Key, the state sent
in the initial authorization request, and the client verifier compliment
to the code_challenge sent with the initial authorization request
*/
const clientID = 'ozohjuyhb60cgi2j6h5pp3tx';
const clientVerifier = 'yMI6PUVehxF80D-Ht_BdRdd9ct5-oRoObpVuI77CCKY';
const redirectUri = 'http://localhost:3003/oauth/redirect';

// Update the scopes to match Etsy's valid scope values
const scopes = [
    'address_r',
    'address_w',
    'billing_r',
    'cart_r',
    'cart_w',
    'email_r',
    'favorites_r',
    'favorites_w',
    'feedback_r',
    'listings_r',
    'listings_w',
    'profile_r',
    'profile_w',
    'recommend_r',
    'recommend_w',
    'shops_r',
    'shops_w',
    'transactions_r',
    'transactions_w'
].join(' ');

// Generate a random state for security
const state = Math.random().toString(36).substring(7);

app.get('/', async (req, res) => {
    const authUrl = `https://www.etsy.com/oauth/connect?response_type=code&client_id=${clientID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&code_challenge=${clientVerifier}&code_challenge_method=S256&state=${state}`;
    res.render("index", { authUrl });
});

app.get("/oauth/redirect", async (req, res) => {
    try {
        // Check if we have a code in the query parameters
        if (!req.query.code) {
            console.error('No authorization code received');
            console.error('Query parameters:', req.query);
            return res.render('index', { 
                error: 'Authorization failed: No code received from Etsy. Please try again.'
            });
        }

        const authCode = req.query.code;
        console.log('Received authorization code:', authCode);

        const tokenUrl = 'https://api.etsy.com/v3/public/oauth/token';
        const requestOptions = {
            method: 'POST',
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: clientID,
                redirect_uri: redirectUri,
                code: authCode,
                code_verifier: clientVerifier,
            }),
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        console.log('Requesting token with options:', {
            ...requestOptions,
            body: JSON.parse(requestOptions.body)
        });

        const response = await fetch(tokenUrl, requestOptions);
        const responseData = await response.json();

        if (response.ok) {
            console.log('Token Response:', responseData);
            // Store the access token in session
            req.session.access_token = responseData.access_token;
            res.redirect('/orders'); // Redirect to orders page after authentication
        } else {
            console.error('Token Error:', {
                status: response.status,
                statusText: response.statusText,
                error: responseData
            });
            res.render('index', { 
                error: `Authorization failed: ${responseData.error_description || responseData.error || 'Unknown error'}`
            });
        }
    } catch (error) {
        console.error('Unexpected error during OAuth:', error);
        res.render('index', { 
            error: `An unexpected error occurred: ${error.message}`
        });
    }
});

app.get("/welcome", async (req, res) => {
    // We passed the access token in via the querystring
    const { access_token } = req.query;

    // An Etsy access token includes your shop/user ID
    // as a token prefix, so we can extract that too
    const user_id = access_token.split('.')[0];

    const requestOptions = {
        headers: {
            'x-api-key': clientID,
            // Scoped endpoints require a bearer token
            Authorization: `Bearer ${access_token}`,
        }
    };

    const response = await fetch(
        `https://api.etsy.com/v3/application/users/${user_id}`,
        requestOptions
    );

    if (response.ok) {
        const userData = await response.json();
        // Load the template with the first name as a template variable.
        res.render("welcome", {
            first_name: userData.first_name
        });
    } else {
        res.send("oops");
    }
});


// Start the server on port 3003
const port = 3003;
app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});