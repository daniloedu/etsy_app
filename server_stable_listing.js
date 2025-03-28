// Import the express and fetch libraries
const express = require('express');
const fetch = require("node-fetch");
const hbs = require("hbs");

// Create a new express application
const app = express();
app.set("view engine", "hbs");
app.set("views", `${process.cwd()}/views`);

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

// This renders our `index.hbs` file.
app.get('/', async (req, res) => {
    res.render("index");
});

/**
These variables contain your API Key, the state sent
in the initial authorization request, and the client verifier compliment
to the code_challenge sent with the initial authorization request
*/
const clientID = 'ozohjuyhb60cgi2j6h5pp3tx';
const clientVerifier = 'rDGqKP2XSHrmF-UgLh57V8b2G4J2eI9Wdb4mA--Tt5Q';
const redirectUri = 'http://localhost:3003/oauth/redirect';

app.get("/oauth/redirect", async (req, res) => {
    // The req.query object has the query params that Etsy authentication sends
    // to this route. The authorization code is in the `code` param
    const authCode = req.query.code;
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
            'Content-Type': 'application/json'
        }
    };

    const response = await fetch(tokenUrl, requestOptions);

    // Extract the access token from the response access_token data field
    if (response.ok) {
        const tokenData = await response.json();
        const access_token = tokenData.access_token;
        const user_id = access_token.split('.')[0];
        
        // First, get the user's shops using numeric user_id
        const shopsResponse = await fetch(
            `https://api.etsy.com/v3/application/users/${user_id}/shops`,
            {
                headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'x-api-key': clientID
                }
            }
        );

        if (shopsResponse.ok) {
            const shopsData = await shopsResponse.json();
            console.log('Shops data:', shopsData);

            // The API returns a single shop object, not an array
            if (shopsData.shop_id) {  // Changed this condition
                const shop_id = shopsData.shop_id;
                console.log('Shop ID:', shop_id);
                
                // Now fetch the shop's listings
                const listingsResponse = await fetch(
                    `https://api.etsy.com/v3/application/shops/${shop_id}/listings/active`,
                    {
                        headers: {
                            'Authorization': `Bearer ${access_token}`,
                            'x-api-key': clientID
                        }
                    }
                );

                let listings = [];
                if (listingsResponse.ok) {
                    const listingsData = await listingsResponse.json();
                    console.log('Listings data:', listingsData);
                    listings = listingsData.results;
                } else {
                    const errorData = await listingsResponse.json();
                    console.error('Listings error:', errorData);
                }

                res.render('welcome', {
                    shop_id: shop_id,
                    shop_name: shopsData.shop_name,
                    listings: listings
                });
            } else {
                res.send("No shops found for this user");
            }
        } else {
            const errorData = await shopsResponse.json();
            console.error('Shops error:', errorData);
            res.send(`Error fetching shop information: ${JSON.stringify(errorData)}`);
        }
    } else {
        const errorData = await response.json();
        res.send({
            status: response.status,
            statusText: response.statusText,
            error: errorData
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