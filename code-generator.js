const crypto = require("crypto");
const fs = require('fs');
const path = require('path');

// The next two functions help us generate the code challenge
// required by Etsy's OAuth implementation.
const base64URLEncode = (str) =>
  str
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

const sha256 = (buffer) => crypto.createHash("sha256").update(buffer).digest();

// --- You don't need to generate these here for the live app anymore ---
// --- but you can run this script once to see example values ---

const codeVerifier = base64URLEncode(crypto.randomBytes(32));
const codeChallenge = base64URLEncode(sha256(codeVerifier));
const state = Math.random().toString(36).substring(7);
const clientID = 'ozohjuyhb60cgi2j6h5pp3tx'; // Keep your client ID
const redirectUri = 'http://localhost:3003/oauth/redirect';
// Define required scopes
const scopes = [
    'email_r', 'shops_r', 'listings_r', 'transactions_r' // Add others as needed
].join('%20'); // Use %20 for space encoding in URL

const fullUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&client_id=${clientID}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

console.log(`EXAMPLE VALUES (These will be generated dynamically in server.js):`);
console.log(`State: ${state}`);
console.log(`Code challenge: ${codeChallenge}`);
console.log(`Code verifier: ${codeVerifier}`);
console.log(`Full URL: ${fullUrl}`);

// --- REMOVE file writing logic ---
// const indexHbsPath = path.join(__dirname, 'views', 'index.hbs');
// ... fs.writeFileSync ...
// const serverJsPath = path.join(__dirname, 'server.js');
// ... fs.writeFileSync ...
// console.log('\nFiles updated successfully!'); // Remove this