// Import necessary libraries
require('dotenv').config(); // Load environment variables from .env file FIRST!
const express = require('express');
const fetch = require("node-fetch");
const hbs = require("hbs");
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const LISTINGS_PER_PAGE = 20; // Define or adjust as needed

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
// Add necessary helpers for the listings template
hbs.registerHelper('toString', (value) => String(value));
hbs.registerHelper('or', (a, b) => a || b);
// Keep other helpers if needed by other templates
hbs.registerHelper('math', function(lvalue, operator, rvalue) { /* ... keep implementation ... */ });
hbs.registerHelper('isLessThan', function(a, b) { return a < b; });
hbs.registerHelper('isGreaterThan', function(a, b) { return a > b; });
hbs.registerHelper('multiply', (a, b) => parseFloat(a) * parseFloat(b));


// --- Helper Functions ---
const base64URLEncode = (str) => str.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest();

function getStatusClass(status) {
    // ... (keep existing implementation)
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

// Middleware to parse JSON bodies (needed for PATCH request)
app.use(express.json()); // <<<<<< ADD THIS

// --- Constants ---
const listenAddress = '0.0.0.0'; // Listen on all interfaces
const productionUrl = process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : `http://localhost:${port}`;
const redirectUri = `${productionUrl}/oauth/redirect`; // Construct the correct redirect URI
const scopes = ['email_r', 'shops_r', 'listings_r', 'listings_w', 'transactions_r'].join(' ');
const ORDERS_PER_PAGE = 25;
// LISTINGS_PER_PAGE is defined at the top

// Log all this to be sure of the values:
console.log(`Calculated listenAddress: ${listenAddress}`);
console.log(`Calculated productionUrl: ${productionUrl}`);
console.log(`Calculated redirectUri: ${redirectUri}`);

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

// Root route: / (Keep as is)
app.get('/', (req, res) => {
    // ... (keep existing implementation)
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

// OAuth Redirect route: /oauth/redirect (Keep as is)
// ===================================================
// OAuth Redirect route: /oauth/redirect (FETCH & STORE SHOP ID)
// ===================================================
app.get("/oauth/redirect", async (req, res) => {
    const { code, state } = req.query;
    const storedState = req.session.oauthState;
    const storedVerifier = req.session.codeVerifier;

    // --- Validation ---
    console.log("OAuth Redirect: Validating state and code...");
    if (!state || !storedState || state !== storedState) {
         console.error("OAuth Redirect Error: Invalid state.", { received: state, expected: storedState });
         return res.render('index', { error: 'Authentication failed: Invalid state.', layout: false});
    }
    if (!code || !storedVerifier) {
         console.error("OAuth Redirect Error: Missing code or verifier.", { hasCode: !!code, hasVerifier: !!storedVerifier });
         return res.render('index', { error: 'Authentication failed: Missing code or session expired.', layout: false});
    }
    console.log("OAuth Redirect: State and code valid.");

    const verifierForRequest = storedVerifier;
    // Clear used OAuth state values from session
    delete req.session.oauthState;
    delete req.session.codeVerifier;

    try {
         // --- Exchange Code for Tokens ---
         console.log("OAuth Redirect: Exchanging code for tokens...");
         const tokenUrl = 'https://api.etsy.com/v3/public/oauth/token';
         const requestOptions = {
              method: 'POST',
              body: JSON.stringify({
                   grant_type: 'authorization_code',
                   client_id: clientID,
                   redirect_uri: redirectUri,
                   code: code,
                   code_verifier: verifierForRequest,
              }),
              headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
         };

         const tokenResponse = await fetch(tokenUrl, requestOptions);
         const tokenData = await tokenResponse.json();

         if (!tokenResponse.ok) {
              console.error(`OAuth Redirect Error: Token exchange failed (${tokenResponse.status})`, tokenData);
              let errorMessage = `Authentication failed: ${tokenData.error || 'Token exchange error.'}`;
              if (tokenData.error_description) errorMessage += ` (${tokenData.error_description})`;
               // Do not proceed, render error on index
              return res.render('index', { error: errorMessage, layout: false });
         }

         // --- Store Tokens in Session ---
         console.log("OAuth Redirect: Token exchange successful. Storing tokens...");
         req.session.access_token = tokenData.access_token;
         req.session.refresh_token = tokenData.refresh_token;
         req.session.token_expires_at = Date.now() + (tokenData.expires_in * 1000);
         req.session.user_id = tokenData.access_token.split('.')[0];

         console.log("\n\n*** FRESH ACCESS TOKEN GENERATED ***");
         console.log(req.session.access_token); // Log the token stored in session
         console.log("*** END FRESH ACCESS TOKEN ***\n\n");


         // --- ADDED: Fetch and Store Shop ID immediately ---
         let shopIdToStore = null; // Default to null
         try {
              console.log("OAuth Redirect: Attempting to fetch Shop ID for user:", req.session.user_id);
              const shopsUrl = `https://api.etsy.com/v3/application/users/${req.session.user_id}/shops`;
              console.log(`   (OAuth Shop Fetch) Calling: ${shopsUrl}`);

              // Use the NEWLY obtained access token
              const shopsResponse = await fetch(shopsUrl, {
                   headers: {
                        'Authorization': `Bearer ${req.session.access_token}`,
                        'x-api-key': clientID,
                        'Accept': 'application/json'
                   }
              });
              console.log(`   (OAuth Shop Fetch) Status: ${shopsResponse.status}`);

              if (shopsResponse.ok) {
                   const shopsData = await shopsResponse.json();
                   console.log("   (OAuth Shop Fetch) Response data:", JSON.stringify(shopsData));

                   if (shopsData && shopsData.shop_id) {
                        shopIdToStore = shopsData.shop_id; // Store valid ID
                        console.log("   (OAuth Shop Fetch) Success! Shop ID found:", shopIdToStore);
                   } else {
                        console.error("   (OAuth Shop Fetch) Response OK, but shop_id missing in data:", shopsData);
                   }
              } else {
                   const errorText = await shopsResponse.text().catch(() => "Could not read error body");
                   console.error(`   (OAuth Shop Fetch) API Error (${shopsResponse.status}): ${errorText}`);
              }
         } catch (shopFetchError) {
              console.error("   (OAuth Shop Fetch) Network or other error during fetch:", shopFetchError);
              // shopIdToStore remains null
         }
         // Store whatever we found (ID or null)
         req.session.shop_id = shopIdToStore;
         console.log("OAuth Redirect: Storing shop_id in session:", req.session.shop_id);
         // === END: Fetch and Store Shop ID ===


         // --- Save Session and Redirect ---
         console.log("OAuth Redirect: Saving session...");
         // Using callback style for save as it's common with express-session
         req.session.save(err => {
              if(err) {
                   console.error("OAuth Redirect Error: Session save failed!", err);
                   // Critical error, maybe render an error page instead of redirecting?
                   // For now, we attempt redirect anyway but log the error.
                   return res.status(500).send("Error saving session. Please try logging in again.");
              }
              console.log("OAuth Redirect: Session saved. Redirecting to /listings...");
              res.redirect('/listings'); // Redirect AFTER save completes
         });

    } catch (error) {
         // Catch errors from token exchange fetch or other synchronous issues
         console.error("OAuth Redirect Error: Unexpected error in try block.", error);
         res.status(500).render('index', { error: 'An unexpected server error occurred during authentication.', layout: false });
    }
}); // End of /oauth/redirect route

// Ping route: /ping (Keep as is)
app.get('/ping', requireAuth, async (req, res) => {
    // ... (keep existing implementation)
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

// ===================================================
// Statistics Route (NO CACHE, Corrected Fetch Loop & Data Processing)
// ===================================================
app.get('/statistics', requireAuth, async (req, res) => {
    const access_token = req.session.access_token;
    const user_id = req.session.user_id;
    const shop_id = req.session.shop_id; // Get shop_id from session

    console.log(`Processing /statistics request for user ${user_id}, shop ${shop_id}`);

    // --- Validation ---
    if (!user_id || !shop_id || !access_token) {
        console.error("Statistics Fetch Error: Missing user_id, shop_id, or access_token in session.");
        return res.render('statistics', {
            isStatistics: true,
            error: "User session data is missing. Please log in again.",
            processingOrders: [], // Pass empty arrays on error
            bestPerformingListings: [],
            worstPerformingListings: []
        });
    }

    // --- Define etsyFetch Helper ---
    const etsyFetch = async (urlPath, options = {}) => {
        const fullUrl = `https://api.etsy.com/v3/application${urlPath}`;
        console.log(`  (Stats Fetch) Calling: ${fullUrl}`);
        let response;
        try {
             response = await fetch(fullUrl, {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'x-api-key': clientID,
                    'Accept': 'application/json',
                     ...options.headers
                },
                 ...options
            });
        } catch (networkError) {
            console.error(`  (Stats Fetch) Network error fetching ${fullUrl}:`, networkError);
            throw new Error(`Network error trying to GET ${urlPath}: ${networkError.message}`);
        }

        if (!response.ok) {
            let errorDetails = { messageFromStatus: `API GET Error: Status ${response.status} ${response.statusText}` };
            try { errorDetails = { ...errorDetails, ...(await response.json()) }; } catch (e) {}
            console.error(`  (Stats Fetch) Etsy API GET Error (${response.status}) calling ${fullUrl}:`, errorDetails);
            const errorToThrow = new Error(errorDetails.error || `API GET failed for ${urlPath}`);
            errorToThrow.status = response.status; errorToThrow.data = errorDetails; throw errorToThrow;
        }
        if (response.status === 204) { console.log(`  (Stats Fetch) Received 204 No Content for: ${fullUrl}`); return null; }
        try {
            console.log(`  (Stats Fetch) Success for: ${fullUrl}`);
            return await response.json();
        } catch (jsonError) {
             console.error(`  (Stats Fetch) Error parsing successful JSON response for ${fullUrl}:`, jsonError);
             throw new Error(`Error parsing JSON response from ${urlPath}: ${jsonError.message}`);
        }
    };
    // --- End etsyFetch Helper ---


    // --- Variables to hold fetched data ---
    let processingOrders = [];
    let bestPerformingListings = [];
    let worstPerformingListings = [];
    let fetchError = null;

    try {
        // --- 1. Fetch & Filter Processing Orders ---
        console.log("Fetching recent paid receipts...");
        const receiptsPath = `/shops/${shop_id}/receipts?was_paid=true&sort_on=created&sort_order=desc&limit=100`;
        const receiptsData = await etsyFetch(receiptsPath);
        const fetchedReceipts = receiptsData?.results || [];
        const processingStatuses = ["paid", "payment processing", "open"]; // Statuses indicating needs action

        processingOrders = fetchedReceipts
            .filter(receipt => {
                 const statusLower = receipt.status?.toLowerCase();
                 const needsProcessing = processingStatuses.includes(statusLower);
                 // Add extra log to see why shipped orders might be included
                 if (!needsProcessing && statusLower === 'completed' || receipt.is_shipped) {
                     console.log(`   Receipt ${receipt.receipt_id} skipped. Status: ${receipt.status}, is_shipped: ${receipt.is_shipped}`);
                 }
                 return needsProcessing;
            })
            .map(receipt => {
                 const orderUrl = `https://www.etsy.com/your/orders/${receipt.receipt_id}`;
                 // Log the specific ID used in the URL
                 console.log(`   Processing Order: ID=${receipt.receipt_id}, Status=${receipt.status}, URL=${orderUrl}`);
                 return {
                     id: receipt.receipt_id,
                     orderUrl: orderUrl,
                     customerName: receipt.name || `Buyer ${receipt.buyer_user_id}`,
                     orderDate: new Date(receipt.created_timestamp * 1000).toLocaleDateString(),
                     total: (receipt.grandtotal?.amount / (receipt.grandtotal?.divisor || 100)).toFixed(2),
                     currency: receipt.grandtotal?.currency_code || 'N/A',
                     status: receipt.status || 'Unknown'
                 };
            });
        console.log(`Found ${processingOrders.length} orders with processing status.`);


        // --- 2. Fetch ALL Active Listings for View Stats ---
        console.log("Fetching all active listings for view stats...");
        let allApiResults = [];
        let totalListingsReported = 0; // Use a different name than outer scope if needed
        const limitPerApiPage = 100;
        let currentOffset = 0;
        let keepFetchingListings = true; // Use specific variable name
        let apiPage = 1;

        while (keepFetchingListings) { // Use specific variable name
            const fetchUrl = `/shops/${shop_id}/listings/active?limit=${limitPerApiPage}&offset=${currentOffset}&fields=listing_id,title,views`;
            console.log(`   Fetching listings API page ${apiPage} (offset ${currentOffset})...`);
            try {
                const pageData = await etsyFetch(fetchUrl);
                const results = pageData?.results || [];

                if (apiPage === 1) {
                    totalListingsReported = pageData?.count || 0;
                    console.log(`   API reported total active listings: ${totalListingsReported}`);
                     // Safety check: if count is 0, stop immediately
                     if (totalListingsReported === 0) {
                          keepFetchingListings = false;
                          console.log("   No active listings reported by API.");
                          continue; // Skip to end of loop
                     }
                }

                if (results.length > 0) {
                    allApiResults.push(...results);
                     console.log(`   Fetched ${results.length} this page. Total in memory: ${allApiResults.length}`);
                } else {
                    keepFetchingListings = false; // No more results this page
                    console.log("   No more results from API on this page.");
                }

                // Stop if we have fetched enough based on the count OR if last page had < limit
                 if (allApiResults.length >= totalListingsReported || results.length < limitPerApiPage) {
                    keepFetchingListings = false; // Correct stop condition
                }

                currentOffset += limitPerApiPage; apiPage++;
                if (keepFetchingListings) await new Promise(resolve => setTimeout(resolve, 250)); // Delay only if fetching more

            } catch (listFetchError) {
                 console.error(`   Error fetching listings API page ${apiPage}:`, listFetchError);
                 fetchError = listFetchError; // Store error
                 keepFetchingListings = false; // Stop fetching on error
            }
        } // End while loop
        console.log(`Finished fetching listings. Total fetched: ${allApiResults.length}`);


        // --- 3. Process Listing Stats ---
        if (allApiResults.length > 0) {
            console.log("Calculating listing performance stats...");
             // Ensure views is a number, default to 0 if null/undefined or invalid
            const listingsWithViews = allApiResults.map(l => ({
                listing_id: l.listing_id,
                title: l.title || 'Untitled Listing', // Add default title
                views: parseInt(l.views, 10) || 0 // Ensure views is a number
            }));

            // Sort descending for best
            bestPerformingListings = [...listingsWithViews]
                .sort((a, b) => b.views - a.views)
                .slice(0, 20)
                 .map(l => ({ id: l.listing_id, title: l.title, views: l.views })); // Map after slicing

            // Sort ascending for worst
            worstPerformingListings = [...listingsWithViews]
                .sort((a, b) => a.views - b.views)
                .slice(0, 20)
                .map(l => ({ id: l.listing_id, title: l.title, views: l.views })); // Map after slicing

            console.log(`Calculated top ${bestPerformingListings.length} and lowest ${worstPerformingListings.length} viewed listings.`);

             // Debug log for calculated lists
            // console.log("Top Viewed Data:", JSON.stringify(bestPerformingListings, null, 2));
            // console.log("Lowest Viewed Data:", JSON.stringify(worstPerformingListings, null, 2));

        } else {
            console.log("No active listings data available to calculate stats.");
        }


    } catch (error) {
        // Catch errors from Receipt fetch or initial Listing fetch steps
        console.error("Error fetching main statistics data:", error);
        fetchError = error;
    }

    // --- 4. Render Template ---
    console.log("Rendering statistics page...");
    res.render('statistics', {
        isStatistics: true,
        processingOrders, // Send the filtered list
        bestPerformingListings,
        worstPerformingListings,
        error: fetchError ? `Failed to load statistics: ${fetchError.message}` : null
        // Removed lastRefreshed as cache is disabled
    });
});


// ===================================================
// Listings route: /listings (OPTIMIZED: Fetch Page 1 normally, Fetch All only if filtering/searching)
// ===================================================
app.get('/listings', requireAuth, async (req, res) => {
    const access_token = req.session.access_token;
    const user_id = req.session.user_id;

    // --- Get Query Parameters ---
    const requestedPage = parseInt(req.query.page, 10) || 1;
    const requestedSectionId = req.query.section || null;
    const searchQuery = req.query.search || '';
    const isFilteredView = !!requestedSectionId || !!searchQuery; // Check if any filter/search is active

    console.log(`Processing listings page ${requestedPage} for user ID: ${user_id}, Search: '${searchQuery}', Section ID: ${requestedSectionId || 'null'}. Filtered View: ${isFilteredView}`);

    // --- Helper: API Fetch Function ---
    const etsyFetch = async (urlPath, options = {}) => {
        // ... (Keep the revised etsyFetch function with correct error handling from previous answer) ...
        const defaultHeaders = { 'Authorization': `Bearer ${access_token}`, 'x-api-key': clientID, 'Accept': 'application/json'};
        const requestOptions = { ...options, headers: { ...defaultHeaders, ...options.headers }};
        const fullUrl = `https://api.etsy.com/v3/application${urlPath}`;
        const response = await fetch(fullUrl, requestOptions);
        if (!response.ok) {
             let errorDetails = {/*...*/}; try { /*...*/ } catch(e) {/*...*/}
             console.error(`Etsy API Error (${response.status}) calling ${urlPath}:`, errorDetails);
             const err = new Error(errorDetails.error || `API call failed for ${urlPath}`);
             err.status = response.status; err.data = errorDetails; throw err;
        }
        if (response.status === 204) return null;
        return response.json();
    };
    // --- End of etsyFetch Function ---

    try {
        // --- 1. Get Shop Info (Always needed) ---
        const shopsData = await etsyFetch(`/users/${user_id}/shops`);
        if (!shopsData?.shop_id) { throw new Error('Shop ID not found'); }
        const shop_id = shopsData.shop_id;
        const shop_name = shopsData.shop_name || `Shop ${shop_id}`;

        // --- 2. Get Shop Sections (Always needed for sidebar) ---
        let shopSections = [];
        try {
            const sectionsData = await etsyFetch(`/shops/${shop_id}/sections`);
            shopSections = sectionsData?.results || [];
            console.log(`Fetched ${shopSections.length} shop sections.`);
             shopSections = shopSections.map(s => ({ ...s, known_count: s.active_listing_count }));
        } catch (sectionError) {
             console.warn(`Could not fetch shop sections: ${sectionError.message}.`);
        }

        // --- Declare variables used in both branches ---
        let listingsForCurrentPage = [];
        let totalListingsMatchingFilter = 0;
        let totalPages = 1;
        let currentPageActual = requestedPage; // Will adjust later
        const yourAppLimitPerPage = LISTINGS_PER_PAGE; // Items per page in your UI

        // --- 3. Conditional Fetching Logic ---
        if (isFilteredView) {
            // --- 3a. FILTERED VIEW: Fetch ALL, then filter/paginate ---
            console.log("Filter/Search active. Fetching all listings...");
            let allApiResults = [];
            let totalListingsInShop = 0;
            const limitPerApiPage = 100; // Max fetch limit
            let currentOffset = 0;
            let keepFetching = true;
            let apiPage = 1;

            // Loop to fetch all pages from Etsy
            while (keepFetching) {
                // Apply keywords directly to API fetch if searching, even when fetching all
                const fetchUrl = `/shops/${shop_id}/listings/active?limit=${limitPerApiPage}&offset=${currentOffset}&includes=Images${searchQuery ? '&keywords=' + encodeURIComponent(searchQuery) : ''}`;
                console.log(`   Fetching API page ${apiPage} (offset ${currentOffset})... URL: ${fetchUrl}`);
                try {
                    const pageData = await etsyFetch(fetchUrl);
                    const results = pageData?.results || [];

                    if (apiPage === 1) { // Get total count (reflecting keyword search if applied)
                        totalListingsInShop = pageData?.count || 0;
                        console.log(`   API reported total listings (potentially keyword-filtered): ${totalListingsInShop}`);
                    }

                    if (results.length > 0) {
                        allApiResults.push(...results);
                        console.log(`   Added ${results.length}. Total in memory: ${allApiResults.length}`);
                    } else { keepFetching = false; console.log("   No more results from API."); }

                    if (allApiResults.length >= totalListingsInShop || results.length < limitPerApiPage) {
                        keepFetching = false;
                    }

                    currentOffset += limitPerApiPage; apiPage++;
                    if (keepFetching) await new Promise(resolve => setTimeout(resolve, 250));

                } catch (fetchError) {
                     console.error(`   Error fetching API page ${apiPage}:`, fetchError);
                     throw fetchError; // Re-throw to main catch
                }
            }
            console.log(`Finished fetching all listings. Total in memory: ${allApiResults.length}`);

            // Filter FULL list by Section (if needed)
            let filteredListings = allApiResults;
            if (requestedSectionId) {
                console.log(`Filtering for section_id ${requestedSectionId}...`);
                filteredListings = filteredListings.filter(listing =>
                    listing.shop_section_id?.toString() === requestedSectionId
                );
                console.log(`   Listings after section filter: ${filteredListings.length}`);
            }

            // Calculate pagination based on the FINAL filtered list
            totalListingsMatchingFilter = filteredListings.length;
            totalPages = Math.ceil(totalListingsMatchingFilter / yourAppLimitPerPage) || 1;
            currentPageActual = Math.max(1, Math.min(requestedPage, totalPages));

            // Manually paginate the FINAL filtered list
            const startIndex = (currentPageActual - 1) * yourAppLimitPerPage;
            const endIndex = startIndex + yourAppLimitPerPage;
            listingsForCurrentPage = filteredListings.slice(startIndex, endIndex);
            console.log(`Final pagination: Displaying page ${currentPageActual} of ${totalPages}. Items on page: ${listingsForCurrentPage.length}`);

        } else {
            // --- 3b. DEFAULT VIEW: Fetch only the requested page ---
            console.log("No Filter/Search. Fetching only requested page...");
            const offset = (requestedPage - 1) * yourAppLimitPerPage; // Use UI limit directly
            const listingParams = new URLSearchParams({
                limit: yourAppLimitPerPage.toString(),
                offset: offset.toString(),
                sort_on: 'created',
                sort_order: 'desc'
            });
            // NOTE: No keywords or section filter applied here
            const activeListingsPath = `/shops/${shop_id}/listings/active?${listingParams.toString()}`;
            console.log(`>>> ABOUT TO FETCH PAGINATED ACTIVE LISTINGS FROM: ${activeListingsPath}`);
            const listingsData = await etsyFetch(activeListingsPath);

            listingsForCurrentPage = listingsData?.results || []; // Results for this page
            // Use the potentially inaccurate count from API ONLY for this default view pagination
            totalListingsMatchingFilter = listingsData?.count || 0;
            console.log(`<<< ACTIVE LISTINGS ENDPOINT RETURNED COUNT: ${totalListingsMatchingFilter}. Results array length for page: ${listingsForCurrentPage.length}`);

            // Calculate pagination based on the API's count
            totalPages = Math.ceil(totalListingsMatchingFilter / yourAppLimitPerPage) || 1;
            currentPageActual = Math.max(1, Math.min(requestedPage, totalPages));
            console.log(`Default view pagination: Page ${currentPageActual} of ${totalPages}. Items on page: ${listingsForCurrentPage.length}`);
            // No further filtering or slicing needed here, API already did it.
        }

        // --- 4. Calculate hasNextPage / hasPrevPage (Common logic) ---
        const hasNextPage = currentPageActual < totalPages;
        const hasPrevPage = currentPageActual > 1;

        // --- 5. Map Listing Data for the Current Page ---
        const listings = listingsForCurrentPage.map(listing => ({
            // ... (keep existing mapping logic)
            id: listing.listing_id,
            title: listing.title || 'Untitled',
            price: (listing.price?.amount / (listing.price?.divisor || 100)).toFixed(2),
            currency: listing.price?.currency_code || 'N/A',
            stock: listing.quantity || 0,
            views: listing.views || 0,
            should_auto_renew: listing.should_auto_renew, // ADD THIS LINE
            editUrl: `https://www.etsy.com/your/shops/me/listing-editor/${listing.listing_id}`,
            section_id_debug: listing.shop_section_id,
            tags: listing.tags || [], // Get tags, default to empty array if null/undefined
            materials: listing.materials || [], // Get materials, default to empty array if null/undefined
        }));

        // --- 6. Render Template ---
        res.render('listings', {
            isListings: true,
            listings,
            shop_name,
            shopSections,
            error: null,
            currentPage: currentPageActual,
            totalPages,
            hasNextPage,
            hasPrevPage,
            totalListings: totalListingsMatchingFilter, // This count is now context-dependent
            currentSectionId: requestedSectionId,
            searchQuery
        });

    } catch (error) {
        // ... (keep existing error handling)
        console.error("Error in /listings route:", error);
        res.status(error.status || 500).render('listings', {
             isListings: true, error: `Error processing listings: ${error.message}`, listings: [],
             shop_name: 'Error', shopSections: [], currentPage: 1, totalPages: 1,
             hasNextPage: false, hasPrevPage: false, totalListings: 0,
             currentSectionId: requestedSectionId, searchQuery: searchQuery
         });
    }
});
// ===================================================
// End of Updated /listings Route
// ===================================================


// Orders Route: /orders (Keep as is)
app.get('/orders', requireAuth, async (req, res) => {
    // ... (keep existing implementation)
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
        // Etsy API v3 uses status directly or boolean flags
        // Adjust based on specific needs - using boolean flags as before:
        switch (requestedStatus.toLowerCase()) {
            case 'pending': apiUrl += '&was_paid=false&was_shipped=false'; break; // Unpaid and unshipped
            case 'processing': apiUrl += '&was_paid=true&was_shipped=false'; break; // Paid but unshipped
            case 'shipped': apiUrl += '&was_shipped=true'; break; // Shipped (regardless of payment?) - CHECK ETSY DOCS
            // case 'completed': apiUrl += '&was_paid=true&was_shipped=true'; break; // Example if needed
            // case 'canceled': // Might need a different endpoint or status filter if available
            default: break; // 'all' - no extra filters
        }
        console.log(`Constructed API URL: ${apiUrl}`);

        // 3. Fetch Receipts
        const ordersResponse = await fetch(apiUrl, { headers: { 'Authorization': `Bearer ${access_token}`, 'x-api-key': clientID } }); // Use variable
        if (!ordersResponse.ok) {
             const errorText = await ordersResponse.text();
             throw new Error(`Failed to fetch orders (${ordersResponse.status}) - ${errorText}`);
        }
        const ordersData = await ordersResponse.json();

        // 4. Process Results (API count should be accurate for boolean filters)
        const apiResults = ordersData.results || [];
        const totalOrdersMatchingFilter = ordersData.count || 0;
        console.log(`API returned ${apiResults.length} results. Total matching filter: ${totalOrdersMatchingFilter}.`);

        // NOTE: Server-side filtering might not be needed if API filters (was_paid, was_shipped) work correctly.
        // Keep it if API filtering is insufficient or status mapping is complex.
        // For now, assuming API filters work and using apiResults directly.
        let filteredResults = apiResults;
        // console.log(`Using ${filteredResults.length} results from API after filters.`);

        // 5. Calculate Pagination
        const totalPages = Math.ceil(totalOrdersMatchingFilter / limit);
        const hasNextPage = requestedPage < totalPages;
        const hasPrevPage = requestedPage > 1;

        // 6. Map Data
        const orders = filteredResults.map(order => {
             // Use the status string directly from the API response
             const apiStatus = order.status || 'Unknown'; // Use API status, fallback to Unknown

             return {
                 id: order.receipt_id,
                 customer: order.name || `Buyer User ID: ${order.buyer_user_id}`,
                 items: order.transactions?.length || order.total_items || 0,
                 total: (order.grandtotal?.amount / (order.grandtotal?.divisor || 100)).toFixed(2),
                 currency: order.grandtotal?.currency_code || 'N/A',
                 // Use the status from the API for display
                 status: apiStatus.charAt(0).toUpperCase() + apiStatus.slice(1), // Capitalize first letter for display
                 date: new Date(order.created_timestamp * 1000).toLocaleDateString(),
                 // Pass the API status to getStatusClass
                 statusClass: getStatusClass(apiStatus) // Pass the original lowercase status string
             };
        });

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
    // ... (keep existing implementation)
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

// ===================================================
// Route to Toggle Auto-Renew for a Listing (Corrected Endpoint)
// ===================================================
app.patch('/listings/:listingId/renew', requireAuth, async (req, res) => {
    const { listingId } = req.params;
    const { newState } = req.body; // Ensure body parser middleware (express.json()) is added earlier
    const access_token = req.session.access_token;
    const user_id = req.session.user_id;

    console.log(`Request received: Toggle auto-renew for listing ${listingId} to ${newState}`); // Log entry

    // --- Basic Validation ---
    if (typeof newState !== 'boolean') {
        return res.status(400).json({ success: false, message: 'Invalid state provided. Expecting true or false.' });
    }
    if (!listingId || isNaN(parseInt(listingId))) {
         return res.status(400).json({ success: false, message: 'Invalid Listing ID.' });
    }
    if (!user_id) {
        return res.status(401).json({ success: false, message: 'User session not found.' });
    }
    if (!access_token) {
         return res.status(401).json({ success: false, message: 'Access token not found in session.' });
    }


    // --- Define etsyGetter ---
    const etsyGetter = async (urlPath) => {
        const fullUrl = `https://api.etsy.com/v3/application${urlPath}`;
        console.log(`  (Renew Getter) Fetching: ${fullUrl}`);
        const response = await fetch(fullUrl, {
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'x-api-key': clientID, // Use clientID from outer scope
                'Accept': 'application/json'
            }
        });
         if (!response.ok) {
             let errorDetails = { messageFromStatus: `API GET Error: Status ${response.status} ${response.statusText}` };
             try { errorDetails = { ...errorDetails, ...(await response.json()) }; } catch (e) {}
             console.error(`  (Renew Getter) Etsy API GET Error (${response.status}) calling ${fullUrl}:`, errorDetails);
             const err = new Error(errorDetails.error || `API GET failed for ${urlPath}`);
             err.status = response.status; err.data = errorDetails; throw err;
         }
         console.log(`  (Renew Getter) Fetch successful for: ${fullUrl}`);
         return response.json();
    };

    // --- Define etsyPatcher ---
    const etsyPatcher = async (urlPath, patchData) => {
        const fullUrl = `https://api.etsy.com/v3/application${urlPath}`;
        console.log(`  (Renew Patcher) Sending PATCH to: ${fullUrl}`); // Log patch URL
        const response = await fetch(fullUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'x-api-key': clientID,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(patchData)
        });

        if (!response.ok) {
            let errorDetails = { messageFromStatus: `API PATCH Error: Status ${response.status} ${response.statusText}` };
            try { errorDetails = { ...errorDetails, ...(await response.json()) }; } catch (e) {}
            console.error(`  (Renew Patcher) Etsy API PATCH Error (${response.status}) calling ${fullUrl}:`, errorDetails);
            const err = new Error(errorDetails.error || `API PATCH failed for ${urlPath}`);
            err.status = response.status; err.data = errorDetails; throw err;
        }
        console.log(`  (Renew Patcher) PATCH successful for: ${fullUrl}, Status: ${response.status}`);
        return response.status === 204 ? { success: true, listing_id: parseInt(listingId) } : await response.json();
    };

    // --- Main Try Block ---
    try {
        // --- Get Shop ID ---
        console.log("Fetching shop ID for user:", user_id);
        const shopsData = await etsyGetter(`/users/${user_id}/shops`);
        if (!shopsData || !shopsData.shop_id) {
            console.error("Failed to get valid shop data:", shopsData);
            throw new Error('Could not determine Shop ID for the user.');
        }
        const shop_id = shopsData.shop_id;
        console.log("Obtained Shop ID:", shop_id);

        // --- Prepare Payload ---
        const updatePayload = {
            should_auto_renew: newState
        };

        // --- Construct Endpoint and Call API ---
        const patchUrlPath = `/shops/${shop_id}/listings/${listingId}`; // CORRECT Endpoint
        console.log(`Sending PATCH to update auto-renew at ${patchUrlPath} with payload:`, updatePayload);
        const updatedListingData = await etsyPatcher(patchUrlPath, updatePayload);

        console.log(`Successfully updated auto-renew for listing ${listingId}. API Response:`, updatedListingData);
        res.json({ success: true, message: 'Auto-renew updated successfully.', updatedListing: updatedListingData });

    } catch (error) {
        console.error(`Failed to update auto-renew for listing ${listingId}:`, error);
        res.status(error.status || 500).json({
             success: false,
             message: `Failed to update auto-renew: ${error.message || 'Unknown error'}`,
             errorData: error.data
         });
    }
});



// ===================================================
// Route to Update Tags OR Materials for a Listing (Corrected Content-Type)
// ===================================================
// ===================================================
// Route to Update Tags OR Materials for a Listing (Corrected Version)
// ===================================================
app.patch('/listings/:listingId/tags-materials', requireAuth, async (req, res) => {
    const { listingId } = req.params;
    const { tags, materials } = req.body; // Expecting { tags: [...] } OR { materials: [...] }
    const access_token = req.session.access_token; // Token for the API call
    const shop_id = req.session.shop_id; // <<<< GET shop_id FROM SESSION
    const user_id = req.session.user_id; // For logging if needed

    // --- Log Entry ---
    console.log(`--- PATCH /tags-materials --- Token from session: ${access_token ? access_token.substring(0, 15) + '...' : 'MISSING!'}`);
    console.log(`Request to update listing ${listingId}. Received:`, req.body);

    // --- Basic Validation ---
    if (!listingId || isNaN(parseInt(listingId))) {
        return res.status(400).json({ success: false, message: 'Invalid Listing ID.' });
    }
    if ((typeof tags === 'undefined' && typeof materials === 'undefined') ||
        (tags && !Array.isArray(tags)) ||
        (materials && !Array.isArray(materials))) {
        return res.status(400).json({ success: false, message: 'Invalid payload. Expecting { tags: [...] } or { materials: [...] }.' });
    }
    if (!user_id) { // User ID check
        return res.status(401).json({ success: false, message: 'User session invalid.' });
    }
    if (!shop_id) { // Check if shop_id exists in session
        console.error("Shop ID missing from session. User might need to re-login.");
        return res.status(400).json({ success: false, message: 'Shop ID not found in session. Please re-login.' });
    }
    if (!access_token) { // Check for access token
         return res.status(401).json({ success: false, message: 'Access token not found in session.' });
    }
    // --- End Validation ---


    // --- Define etsyPatcher (Corrected Content-Type & Body) ---
    // (Helper function defined within the route scope)
    const etsyPatcher = async (urlPath, patchData) => {
        const fullUrl = `https://api.etsy.com/v3/application${urlPath}`;
        console.log(`  (Patcher) Sending PATCH to: ${fullUrl}`);

        const formBody = new URLSearchParams();
        for (const key in patchData) {
            if (Object.hasOwnProperty.call(patchData, key)) {
                const value = patchData[key];
                if (Array.isArray(value)) {
                    formBody.append(key, value.join(',')); // Join arrays with comma
                } else if (value !== undefined && value !== null) {
                    formBody.append(key, String(value));
                }
            }
        }
        console.log(`  (Patcher) Formatted Body: ${formBody.toString()}`);

        const response = await fetch(fullUrl, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${access_token}`, // Use token from route scope
                'x-api-key': clientID,           // Use clientID from outer scope
                'Content-Type': 'application/x-www-form-urlencoded', // CORRECT TYPE
                'Accept': 'application/json'
            },
            body: formBody // Send formatted body
        });

        if (!response.ok) {
            let errorDetails = { messageFromStatus: `API PATCH Error: Status ${response.status} ${response.statusText}` };
            try { errorDetails = { ...errorDetails, ...(await response.json()) }; } catch (e) {}
            console.error(`  (Patcher) Etsy API PATCH Error (${response.status}) calling ${fullUrl}:`, errorDetails);
            const err = new Error(errorDetails.error || `API PATCH failed for ${urlPath}`);
            err.status = response.status; err.data = errorDetails; throw err;
        }

        console.log(`  (Patcher) PATCH successful for: ${fullUrl}, Status: ${response.status}`);

        if (response.status === 204) {
            console.log("  (Patcher) Received 204 No Content.");
            return null; // Success, no body
        } else {
             try {
                const updatedListing = await response.json();
                console.log("  (Patcher) Received updated listing data (Status 200 OK).");
                return updatedListing;
            } catch (jsonError) {
                 console.error(`  (Patcher) Error parsing successful JSON response (Status ${response.status}) for ${fullUrl}:`, jsonError);
                 return { success: true, message: "Update succeeded but response body parsing failed." };
            }
        }
    };
    // --- End etsyPatcher ---


    // --- Main Try Block for the route ---
    try {
        // --- Shop ID is already available from session ---
        console.log("Using Shop ID from session:", shop_id);

        // --- Prepare Actual Update Payload ---
        const updatePayload = {};
        if (tags !== undefined) {
            // Optional: Add server-side validation for tags
            if (tags.length > 13) {
                 throw new Error('Validation failed: Cannot have more than 13 tags.');
            }
             // Basic check for invalid characters (using a simple regex - adjust if needed)
             const invalidTagCharRegex = /[^a-zA-Z0-9\s\-'\u2122\u00A9\u00AE]/u; // Allow letters, numbers, space, hyphen, apostrophe, TM, C, R
             if (tags.some(tag => invalidTagCharRegex.test(tag))) {
                  throw new Error('Validation failed: Tags contain invalid characters.');
             }
            updatePayload.tags = tags;
            console.log(`Preparing to update tags for listing ${listingId}`);
        }
        if (materials !== undefined) {
             // Basic check for invalid characters (letters, numbers, space only)
             const invalidMaterialCharRegex = /[^a-zA-Z0-9\s]/u;
             if (materials.some(mat => invalidMaterialCharRegex.test(mat))) {
                  throw new Error('Validation failed: Materials contain invalid characters.');
             }
            updatePayload.materials = materials;
            console.log(`Preparing to update materials for listing ${listingId}`);
        }

        // Ensure something is actually being updated
        if (Object.keys(updatePayload).length === 0) {
             throw new Error('No valid tags or materials field provided to update.');
        }
        // --- End Prepare Payload ---

        // --- Construct Endpoint Path and Call API ---
        const patchUrlPath = `/shops/${shop_id}/listings/${listingId}`;
        console.log(`Sending final PATCH to ${patchUrlPath} with payload:`, updatePayload);
        const updateResult = await etsyPatcher(patchUrlPath, updatePayload);

        console.log(`Update processed for listing ${listingId}. API Response Status:`, updateResult ? '200 OK with body' : '204 No Content');

        // Send success response back to client
        // Including the result from API (which might contain Etsy's own error like 'pattern')
        return res.json({
            success: true,
            message: 'Listing update processed by server.',
            updateResult: updateResult || { listing_id: parseInt(listingId), status: 'Updated (204 No Content)' } // Provide minimal info if 204
        });

    } catch (error) {
        // --- Error Handling ---
        console.error(`Failed to update listing ${listingId} (Caught Error):`, error);
        // Check if headers already sent (should not happen with 'return' above)
        if (res.headersSent) {
            console.error('Headers already sent, cannot send error response.');
        } else {
            // Send specific validation errors back if possible
            const errorMessage = (error.message.startsWith('Validation failed:'))
                 ? error.message
                 : `Failed to update listing: ${error.message || 'Unknown server error'}`;

            res.status(error.status || (error.message.startsWith('Validation failed:') ? 400 : 500) ).json({
                 success: false,
                 message: errorMessage,
                 errorData: error.data // Include specific API error if available
             });
        }
    }
}); // End of PATCH /listings/:listingId/tags-materials route handler



// --- Server Start ---
app.listen(port, () => {
    console.log(`Etsy App Server running in ${nodeEnv} mode.`);
    console.log(`Listening at http://localhost:${port}`);
    console.log(`Ensure Etsy Redirect URI is set to: ${redirectUri}`); // Show calculated redirect URI
});