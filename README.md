# App Summary:

College students often struggle to budget effectively due to limited time, income, and motivation. To address this, we created a mobile-friendly budgeting app that automatically imports banking, credit card, and other financial transactions to make the budgeting process simpler. Additionally, we’ve implemented requested features such as investment account tracking, streaks, leaderboards, and AI assisted chatbot functionality. Our app is organized into five distinct domains: settings, home, summary, chat, and leaderboard. Under settings and home, the user can change basic configurations and quickly see their finances. Under summary, the user can view their spending and savings rates broken down by category with customizable data visualizations. Under chat, the user can interact with an AI chatbot to obtain personalized insights about their spending habits and goals. Finally, the leaderboard allows the user to compete with their friends to save the highest percentage of their income, building community and fun accountability into the app.

## ERD:

<img width="754" height="458" alt="Screenshot 2026-10-09 at 9 21 23 AM" src="https://github.com/user-attachments/assets/e55333e1-a1df-4d0b-ab80-619b2c09e480" />

## Tech Stack:

For our front end, we use HTML, CSS, and TypeScript with Vite. TypeScript adds static checking while keeping the app framework-free and easy to work on as a team.

On the back end, we’re using Supabase. It gives us a solid place that will handle a lot of the backend work that is usually complex, allowing us to do solid backend work. It allows us to build the system fast and focus on the actual features of our product without getting slowed down by excessive configuration.

This combination of HTML, CSS, TypeScript, and Supabase allows us to focus on building the app without introducing an additional front-end framework.

## Development Setup

Follow these steps to run a fresh clone locally.

### Prerequisites

- Git, to clone the repository.
- Node.js **20.19 or newer** (or **22.12 or newer**) and npm. Install the current Node.js LTS release from [nodejs.org](https://nodejs.org/) if Node.js is not installed; npm is included with Node.js.
- A Supabase project, for sign-up and sign-in.

### Start the app

Check that Node.js and npm are available in a terminal:

```powershell
node --version
npm --version
```

If either command is not found, install Node.js LTS as described above, then reopen the terminal.

1. Clone the repository and enter its directory:

   ```powershell
   git clone https://github.com/jacksonmclean326/is_core_project.git
   cd is_core_project
   ```

2. Create a local `.env` file next to `.example.env` (copy `.example.env` if helpful).

3. Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env` using your Supabase project's API settings. For Plaid account connections, also set the server-only `SUPABASE_SECRET_KEY` from Supabase, `CLIENT_ID`, `PLAID_SECRET`, and `PLAID_MODE=sandbox`. Generate a 32-byte encryption key for `PLAID_TOKEN_ENCRYPTION_KEY` with:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Keep all secret keys in the backend environment only. `.env` is ignored by Git and should stay local. Back up the encryption key securely; changing it without first re-encrypting saved Plaid tokens will require users to reconnect their institutions.

4. Install the exact dependency versions from the lockfile:

   ```powershell
   npm ci
   ```

5. Start the server:

   ```powershell
   npm start
   ```

6. Open `http://localhost:3000` (or the port configured with `PORT`). `npm start` serves the built pages and API from the Node.js server. For frontend development with Vite, run `npm run server` and `npm run dev` in separate terminals, then open the URL Vite prints; it proxies `/api` requests to the backend on port `3000`.

In Supabase **Authentication** settings, enable email/password sign-in and add both `http://localhost:5173` (Vite development) and `http://localhost:3000` (`npm start`) to the allowed redirect URLs. Set the Site URL to the address you use locally. If email confirmation is enabled, confirm the address after signing up before signing in.

The Node.js server is the only part of the app that connects to Supabase. It handles account creation, sign-in, session checks, sign-out, account details, and friend-code lookups through HTTP endpoints. The browser sends same-origin `/api` requests and receives an HttpOnly session cookie; it does not include Supabase credentials. Normal Supabase requests use the signed-in user's session and Row Level Security. Plaid connection records and encrypted access tokens are managed server-side using the Supabase secret key. Keep direct table access to `Plaid Item` restricted to the server's service role; review its grants and row-level security policies before deployment.

The server serves the pages at `/auth`, `/home`, `/details`, `/chat`, `/leaderboard`, and `/settings`. These are regular GET routes with no hash fragments; signed-out visitors are redirected to `/auth`.

For the Friends page's dynamic friend code, the Supabase project must have a `public."User"` profile row whose `user_id` matches the Auth user ID and whose `friend_code` is a unique six-character code. The table's Row Level Security policy must allow authenticated users to select their own profile row (for example, `auth.uid() = user_id`). The sign-up form sends `first_name`, `last_name`, and `full_name` as Auth user metadata; configure the Auth-to-profile trigger to copy the names and generate the friend code in the database.

### Plaid bank connections

Plaid starts in Sandbox. The web client loads Plaid Link from Plaid's CDN; the server creates Link tokens, exchanges public tokens, encrypts access tokens with AES-256-GCM, and stores them only in the server-managed Plaid Item table. Account metadata and cached balances are synced with Plaid's `/accounts/get` endpoint when Settings opens. The Home page reads the saved linked-account count without triggering a sync. Cached balances are not guaranteed to be real-time.

Plaid requires at least one product for new Link sessions. This integration initializes Transactions to enable the selected institution/account coverage, but Money Man does not call Plaid's Transactions endpoints or import/store transaction data. Plaid's product access and any applicable pricing still apply, especially before changing `PLAID_MODE` to `production`; review your Plaid Dashboard access and pricing before production use.

### Build and run the production server

Use these commands when needed:

```powershell
npm start
```

`npm start` first runs the full build: it type-checks the frontend and backend TypeScript, builds the frontend, and compiles the backend into `dist/server/`. It then serves the frontend and backend together on port `3000` (or set `PORT`). For production HTTPS deployments, set `NODE_ENV=production` so the session cookie is marked `Secure`; deploy the Node.js server rather than the static `dist/` folder alone.

### Server-side code

`src/server/index.ts` starts the backend, and `src/server/router.ts` connects HTTP requests to the API and web handlers. API routes are grouped under `src/server/api/`; authentication, Plaid, HTTP helpers, and static/page serving each have their own modules. Browser code in `src/app/` calls the API. Development runs the TypeScript backend directly with `tsx` and requires the separate backend and Vite terminals described above. Production rebuilds and then runs the compiled server from `dist/server/` whenever you run `npm start`. Server-side sessions are held in memory, so restarting the backend signs users out; use a shared session store before running multiple backend instances.

Most budgeting data still lives in browser storage and is not yet stored per user in Supabase. Bank connection data is stored per user in Supabase as described above. Client-side route guards are for navigation only and are not data security.

Each app page lives in its own folder under `src/app/pages/` and keeps its HTML, CSS, and TypeScript together, named after the folder. Shared styles are in `src/app/global.css`; browser-persisted prototype state is in `src/app/core.ts`.

## Verifying the Vertical Slice:

Run `npm start`, create an account from the sign-in screen, and confirm the email if email confirmations are enabled in Supabase. Then sign in, refresh to verify the session persists, and use **Sign out** to return to the sign-in screen.
