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

// We'll use the verifier to generate the challenge.
// The verifier needs to be saved for a future step in the OAuth flow.
const codeVerifier = base64URLEncode(crypto.randomBytes(32));

// With these functions, we can generate
// the values needed for our OAuth authorization grant.
const codeChallenge = base64URLEncode(sha256(codeVerifier));
const state = Math.random().toString(36).substring(7);

// Generate the full URL with all required scopes
const fullUrl = `https://www.etsy.com/oauth/connect?response_type=code&redirect_uri=http://localhost:3003/oauth/redirect&scope=email_r%20shops_r%20listings_r&client_id=ozohjuyhb60cgi2j6h5pp3tx&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

console.log(`State: ${state}`);
console.log(`Code challenge: ${codeChallenge}`);
console.log(`Code verifier: ${codeVerifier}`);
console.log(`Full URL: ${fullUrl}`);

// Update index.hbs
const indexHbsPath = path.join(__dirname, 'views', 'index.hbs');
let indexHbsContent = fs.readFileSync(indexHbsPath, 'utf8');
indexHbsContent = indexHbsContent.replace(/href="[^"]*"/, `href="${fullUrl}"`);
fs.writeFileSync(indexHbsPath, indexHbsContent);

// Update server.js
const serverJsPath = path.join(__dirname, 'server.js');
let serverJsContent = fs.readFileSync(serverJsPath, 'utf8');
serverJsContent = serverJsContent.replace(/const clientVerifier = '[^']*'/, `const clientVerifier = '${codeVerifier}'`);
fs.writeFileSync(serverJsPath, serverJsContent);

console.log('\nFiles updated successfully!');
console.log('1. index.hbs has been updated with the new authorization URL');
console.log('2. server.js has been updated with the new code verifier');