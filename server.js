// Import necessary libraries
require('dotenv').config(); // Load environment variables from .env file FIRST!
const express = require('express');
const fetch = require("node-fetch");
const hbs = require("hbs");
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');

// --- Environment Variable Checks ---
// Ensure required variables are loaded
if (!process.env.ETSY_CLIENT_ID) {
  console.error("FATAL ERROR: ETSY_CLIENT_ID is not defined in .env file.");
  process.exit(1); // Exit if critical config is missing
}
if (!process.env.SESSION_SECRET) {
  console.error("FATAL ERROR: SESSION_SECRET is not defined in .env file.");
  process.exit(1);
}

// --- Handlebars Helpers ---
hbs.registerHelper('eq', (a, b) => a === b);
hbs.registerHelper('add', (a, b) => parseInt(a, 10) + parseInt(b, 10));
hbs.registerHelper('subtract', (a, b) => parseInt(a, 10) - parseInt(b, 10));

// --- Helper Functions ---
const base64URLEncode = (str) => str.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest();

function getStatusClass(status) {
    status = status ? status.toLowerCase() : 'unknown';
    switch (status) {
        case 'completed': return 'bg-green-100 text-green-800';
        case 'open': return 'bg-yellow-100 text-yellow-800';
        case 'payment processing': return 'bg-yellow-100 text-yellow-800';
        case 'shipped': return 'bg-blue-100 text-blue-800';
        case 'canceled': return 'bg-red-100 text-red-800';
        case 'paid': return 'bg-purple-100 text-purple-800';
        default: return 'bg-gray-100 text-gray-800';
    }
}

// --- App Setup ---
const app = express();
app.set("view engine", "hbs");
app.set("views", path.join(__dirname, 'views'));
app.set('view options', { layout: 'layouts/main' });

// --- Use Environment Variables for Configuration ---
const clientID = process.env.ETSY_CLIENT_ID; // Use from .env
const sessionSecret = process.env.SESSION_SECRET; // Use from .env
const port = process.env.PORT || 3003; // Use from .env or default
const nodeEnv = process.env.NODE_ENV || 'development';

// Session middleware
app.use(session({
    secret: sessionSecret, // Use variable loaded from .env
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: nodeEnv === 'production', // Use 'secure: true' only in production (HTTPS)
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week
    }
}));

// Static files middleware
app.use(express.static(path.join(__dirname, 'public')));

// --- Constants ---
const redirectUri = `http://localhost:${port}/oauth/redirect`; // Make port dynamic
const scopes = ['email_r', 'shops_r', 'listings_r', 'listings_w', 'transactions_r'].join(' ');
const ORDERS_PER_PAGE = 25;

// --- Middleware: requireAuth (Keep as is) ---
const requireAuth = (req, res, next) => {
    if (!req.session.access_token) {
        console.log('Auth required, redirecting to login.');
        return res.redirect('/');
    }
    console.log('User authenticated, proceeding.');
    next();
};

// --- Routes ---

// Root route: / (Keep logic, use clientID variable)
app.get('/', (req, res) => {
    const codeVerifier = base64URLEncode(crypto.randomBytes(32));
    const codeChallenge = base64URLEncode(sha256(codeVerifier));
    const state = crypto.randomBytes(16).toString('hex');

    req.session.codeVerifier = codeVerifier;
    req.session.oauthState = state;

    req.session.save(err => {
        if (err) { return res.status(500).send("Error saving session state."); }

        const authUrl = `https://www.etsy.com/oauth/connect?` +
            `response_type=code` +
            `&client_id=${clientID}` + // Use variable
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&scope=${encodeURIComponent(scopes)}` +
            `&state=${state}` +
            `&code_challenge=${codeChallenge}` +
            `&code_challenge_method=S256`;

        res.render("index", { authUrl, layout: false });
    });
});

// OAuth Redirect route: /oauth/redirect (Keep logic, use clientID, redirectUri variables)
app.get("/oauth/redirect", async (req, res) => {
     const { code, state } = req.query;
     const storedState = req.session.oauthState;
     const storedVerifier = req.session.codeVerifier;

     if (!state || !storedState || state !== storedState) { return res.render('index', { error: 'Authentication failed: Invalid state.', layout: false}); }
     if (!code || !storedVerifier) { return res.render('index', { error: 'Authentication failed: Missing code or session expired.', layout: false}); }

     const verifierForRequest = storedVerifier;
     delete req.session.oauthState;
     delete req.session.codeVerifier;

     try {
         const tokenUrl = 'https://api.etsy.com/v3/public/oauth/token';
         const requestOptions = {
             method: 'POST',
             body: JSON.stringify({
                 grant_type: 'authorization_code',
                 client_id: clientID, // Use variable
                 redirect_uri: redirectUri, // Use variable
                 code: code,
                 code_verifier: verifierForRequest,
             }),
             headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
         };

         const response = await fetch(tokenUrl, requestOptions);
         const responseData = await response.json();

         if (response.ok) {
             req.session.access_token = responseData.access_token;
             req.session.refresh_token = responseData.refresh_token;
             req.session.token_expires_at = Date.now() + (responseData.expires_in * 1000);
             req.session.user_id = responseData.access_token.split('.')[0];

             req.session.save(err => {
                 if(err) { console.error("Session save error after token:", err); }
                 res.redirect('/orders');
             });
         } else {
             let errorMessage = `Authentication failed: ${responseData.error || 'Token exchange error.'}`;
             if (responseData.error_description) errorMessage += ` (${responseData.error_description})`;
             res.render('index', { error: errorMessage, layout: false });
         }
     } catch (error) {
         console.error("OAuth redirect error:", error);
         res.status(500).render('index', { error: 'An unexpected error occurred during authentication.', layout: false });
     }
});

// Ping route: /ping (Keep as is, use clientID variable)
app.get('/ping', requireAuth, async (req, res) => {
    const requestOptions = { headers: { 'x-api-key': clientID } }; // Use variable
    try {
        const response = await fetch('https://api.etsy.com/v3/application/openapi-ping', requestOptions);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `API ping failed with status ${response.status}`);
        res.json(data);
    } catch (error) {
        console.error("Ping error:", error);
        res.status(500).json({ error: "Failed to ping Etsy API", details: error.message });
    }
});

// Statistics route: /statistics (Keep as is)
app.get('/statistics', requireAuth, (req, res) => { res.render('statistics', { isStatistics: true }); });

// Listings route: /listings (Keep as is, use clientID variable)
app.get('/listings', requireAuth, async (req, res) => {
    const access_token = req.session.access_token;
    // ... rest of listings logic using clientID variable ...
    try {
        // Fetch shop ID
        const shopsResponse = await fetch(`https://api.etsy.com/v3/application/users/${req.session.user_id}/shops`, { headers: { 'Authorization': `Bearer ${access_token}`, 'x-api-key': clientID } });
        if (!shopsResponse.ok) throw new Error('Failed to fetch shop ID for listings');
        const shopsData = await shopsResponse.json();
        if (!shopsData?.shop_id) return res.render('listings', { isListings: true, error: 'No shop found.' });
        const shop_id = shopsData.shop_id;

        // Fetch listings
        const listingsResponse = await fetch(`https://api.etsy.com/v3/application/shops/${shop_id}/listings/active?limit=50&includes=Images`, { headers: { 'Authorization': `Bearer ${access_token}`, 'x-api-key': clientID } });
        if (!listingsResponse.ok) throw new Error('Failed to fetch listings');
        const listingsData = await listingsResponse.json();

        // Map data
        const listings = (listingsData.results || []).map(listing => ({ /* ... mapping ... */ }));
        res.render('listings', { isListings: true, listings, shop_name: shopsData.shop_name, error: null });

    } catch(error) {
        console.error("Error in /listings:", error);
        res.status(500).render('listings', { isListings: true, error: `Error fetching listings: ${error.message}`});
    }
});

// Orders Route: /orders (Keep filtering logic, use clientID variable)
app.get('/orders', requireAuth, async (req, res) => {
    const access_token = req.session.access_token;
    const user_id = req.session.user_id;
    const requestedPage = parseInt(req.query.page, 10) || 1;
    const requestedStatus = req.query.status || 'all';

    console.log(`Accessing /orders for user ${user_id}, Page: ${requestedPage}, Status: ${requestedStatus}`);

    try {
        // 1. Get Shop ID
        const shopsResponse = await fetch(`https://api.etsy.com/v3/application/users/${user_id}/shops`, { headers: { 'Authorization': `Bearer ${access_token}`, 'x-api-key': clientID } }); // Use variable
        if (!shopsResponse.ok) { throw new Error('Failed to fetch shop info'); }
        const shopsData = await shopsResponse.json();
        if (!shopsData || !shopsData.shop_id) { return res.render('orders', { isOrders: true, error: 'No shop found.' }); }
        const shop_id = shopsData.shop_id;
        const shop_name = shopsData.shop_name || `Shop ${shop_id}`;

        // 2. Prepare API Call Parameters
        const limit = ORDERS_PER_PAGE;
        const offset = (requestedPage - 1) * limit;
        let apiUrl = `https://api.etsy.com/v3/application/shops/${shop_id}/receipts?limit=${limit}&offset=${offset}`;
        switch (requestedStatus.toLowerCase()) {
            case 'pending': apiUrl += '&was_paid=false'; break;
            case 'processing': apiUrl += '&was_paid=true&was_shipped=false'; break;
            case 'shipped': apiUrl += '&was_shipped=true'; break;
            default: break;
        }
        console.log(`Constructed API URL: ${apiUrl}`);

        // 3. Fetch Receipts
        const ordersResponse = await fetch(apiUrl, { headers: { 'Authorization': `Bearer ${access_token}`, 'x-api-key': clientID } }); // Use variable
        if (!ordersResponse.ok) { throw new Error(`Failed to fetch orders (${ordersResponse.status})`); }
        const ordersData = await ordersResponse.json();

        // 4. Server-Side Filtering
        const apiResults = ordersData.results || [];
        const totalOrdersMatchingFilter = ordersData.count || 0;
        console.log(`API returned ${apiResults.length} results. Correct count matching filter: ${totalOrdersMatchingFilter}.`);
        let filteredResults = [];
        switch (requestedStatus.toLowerCase()) {
            case 'pending': filteredResults = apiResults.filter(order => !order.was_paid); break;
            case 'processing': filteredResults = apiResults.filter(order => order.was_paid && !order.was_shipped); break;
            case 'shipped': filteredResults = apiResults.filter(order => order.was_shipped); break;
            default: filteredResults = apiResults; break;
        }
        console.log(`Server-side filter applied for '${requestedStatus}', ${filteredResults.length} results remain.`);

        // 5. Calculate Pagination
        const totalPages = Math.ceil(totalOrdersMatchingFilter / limit);
        const hasNextPage = requestedPage < totalPages;
        const hasPrevPage = requestedPage > 1;

        // 6. Map Data
        const orders = filteredResults.map(order => ({
            id: order.receipt_id,
            customer: order.name || `Buyer User ID: ${order.buyer_user_id}`,
            items: order.transactions?.length || order.total_items || 0,
            total: (order.grandtotal?.amount / (order.grandtotal?.divisor || 100)).toFixed(2),
            currency: order.grandtotal?.currency_code || 'N/A',
            status: order.status || 'Unknown',
            date: new Date(order.created_timestamp * 1000).toLocaleDateString(),
            statusClass: getStatusClass(order.status)
        }));

        // 7. Render
        res.render('orders', {
            isOrders: true, orders, shop_name, error: null,
            currentPage: requestedPage, totalPages, hasNextPage, hasPrevPage, currentStatus: requestedStatus
        });

    } catch (error) {
        console.error('Error in /orders route:', error);
        res.status(500).render('orders', {
            isOrders: true, orders: [], error: `An error occurred while fetching orders: ${error.message}`,
            currentPage: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false, currentStatus: 'all'
        });
    }
});

// Logout route: /logout (Keep as is)
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Logout error:", err);
            return res.status(500).send("Could not log out.");
        }
        res.clearCookie('connect.sid'); // Default session cookie name
        console.log('User logged out.');
        res.redirect('/');
    });
});

// --- Server Start ---
// *** Reinstate the console log messages ***
app.listen(port, () => {
    console.log(`Etsy App Server running in ${nodeEnv} mode.`);
    console.log(`Listening at http://localhost:${port}`);
    console.log(`Ensure Etsy Redirect URI is set to: ${redirectUri}`); // Show calculated redirect URI
});