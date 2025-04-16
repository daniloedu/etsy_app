# Etsy Manager App (Node.js)

A simple Node.js application using Express and Handlebars to interact with the Etsy API v3 via OAuth 2.0. Allows users to view listings and update listing details like tags, materials, and auto-renew status.

## Features

*   OAuth 2.0 Authentication with Etsy V3 API (PKCE Flow)
*   View Active Etsy Listings with pagination and basic details.
*   Filter listings by Shop Section.
*   Search listings by keywords.
*   View listing tags and materials.
*   Inline editing for listing tags and materials.
*   Toggle listing `should_auto_renew` status.
*   Basic session management using persistent file storage.
*   View Orders (Basic implementation with status filtering).
*   View basic Shop Statistics with the orders to be shipped, and the most and less viewed items.

## Technology Stack

*   **Backend:** Node.js, Express.js
*   **Templating:** Handlebars (hbs)
*   **Session Management:** express-session, connect-session-file-store
*   **API Client:** node-fetch
*   **Environment Variables:** dotenv
*   **Frontend Styling:** Tailwind CSS (via CDN), Font Awesome (via CDN)

## Prerequisites

*   Node.js (Check `package.json` engines field for version, e.g., >=12 <15 or adjust as needed)
*   npm (or yarn)
*   An Etsy Developer Account and an API App created ([developer.etsy.com](https://developer.etsy.com/))

## Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/daniloedu/etsy_app.git
    cd etsy_app
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Create Etsy App:**
    *   Go to the Etsy Developer Portal.
    *   Create a new application.
    *   Note down your **Client ID** (also called Keystring).
    *   Under OAuth Redirect URIs, add your development redirect URI (e.g., `http://localhost:3003/oauth/redirect`). You will add your production URI later.

4.  **Configure Environment Variables:**
    *   Create a file named `.env` in the root directory of the project.
    *   Add the following variables:
        ```dotenv
        # Required
        ETSY_CLIENT_ID=YOUR_ETSY_APP_CLIENT_ID
        SESSION_SECRET=YOUR_VERY_STRONG_RANDOM_SESSION_SECRET

        # Optional - For Deployment / Port Configuration
        PORT=3003
        NODE_ENV=development # Change to 'production' for deployment

        # Needed if using export scripts (Ensure these are set if running them)
        # ETSY_EXPORT_ACCESS_TOKEN=YOUR_MANUALLY_OBTAINED_TOKEN
        # ETSY_SHOP_ID=YOUR_SHOP_ID
        ```
    *   Replace placeholders with your actual values. Generate a strong random string for `SESSION_SECRET`.

5.  **Create Session Directory:**
    *   Ensure the directory configured for `connect-session-file-store` exists. By default (in the current `server.js`), it's `./sessions`.
    *   Create it if it doesn't exist:
        ```bash
        mkdir sessions
        ```
    *   Ensure your `.gitignore` file includes `sessions/` and `.env` to avoid committing sensitive data and session files.

6.  **Run the application:**
    *   For development (uses settings from `.env`):
        ```bash
        npm start
        ```
        or
        ```bash
        node server.js
        ```
    *   Open your browser and navigate to `http://localhost:3003` (or the configured PORT).

## Deployment

This application can be deployed to various platforms. Key considerations:

1.  **Redirect URI:** Update your Etsy App configuration with the production Redirect URI (e.g., `https:/localhost:3003/oauth/redirect`).
2.  **Environment Variables:** Set `ETSY_CLIENT_ID`, `SESSION_SECRET`, `PORT`, and `NODE_ENV=production` on your hosting platform.
3.  **Session Storage:** `connect-session-file-store` works well for single-instance deployments where the filesystem is persistent (like traditional VMs or some PaaS providers). For serverless or horizontally scaled environments (multiple instances), a different session store (like Redis or a database-backed store) is required.
4.  **HTTPS:** Production deployments **must** run over HTTPS for OAuth 2.0 security. Ensure your hosting provides SSL termination. Set `cookie.secure=true` in `server.js` when `NODE_ENV` is `production`.

See specific platform documentation for deployment steps (e.g., Vercel, Render, DigitalOcean App Platform, AWS EC2/ECS/Lambda).

## Future Enhancements / TODO

*   Implement Refresh Token logic for persistent sessions beyond 1 hour.
*   Implecment Bulk Editing for tags/materials (requires areful handling of API calls and rate limits).
*   Improve error handling and user feedback (e.g., use toast notifications instead of alerts).
*   Add more robust validation for user input.
*   Refactor API helpers into separate modules.
*   Consider a more robust session store for scalable deployments (Redis, DB).
*   Add unit/integration tests.
*   Enhance Order/Statistics views.

## Contributing

Contributions are welcome! Please fork the repository and submit a pull request.

## License

[MIT](LICENSE) // Or choose another license if preferred