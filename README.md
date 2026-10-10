# App Summary:
College students often struggle to budget effectively due to limited time, income, and motivation. To address this, we created a mobile-friendly budgeting app that automatically imports banking, credit card, and other financial transactions to make the budgeting process simpler. Additionally, we’ve implemented requested features such as investment account tracking, streaks, leaderboards, and AI assisted chatbot functionality. Our app is organized into five distinct domains: settings, home, summary, chat, and leaderboard. Under settings and home, the user can change basic configurations and quickly see their finances. Under summary, the user can view their spending and savings rates broken down by category with customizable data visualizations. Under chat, the user can interact with an AI chatbot to obtain personalized insights about their spending habits and goals. Finally, the leaderboard allows the user to compete with their friends to save the highest percentage of their income, building community and fun accountability into the app.

## ERD:

<img width="754" height="458" alt="Screenshot 2026-10-09 at 9 21 23 AM" src="https://github.com/user-attachments/assets/e55333e1-a1df-4d0b-ab80-619b2c09e480" />

 
## Tech Stack:
For our front end, we decided to go with a standard HTML/CSS/JS stack. This allows us to stick with what we know, keeps things easy to understand, gives us the ability to make edits quickly, and makes team development easier. We didn’t want to waste time learning a new framework, so we believe this stack best meets our goals.

On the back end, we’re using Supabase. It gives us a solid place that will handle a lot of the backend work that is usually complex, allowing us to do solid backend work. It allows us to build the system fast and focus on the actual features of our product without getting slowed down by excessive configuration.

This combination of HTML/CSS/JS and Supabase allows for a smooth, easy-to-use stack for our app. It uses systems that we are already familiar with and allows us to focus on what really matters when trying to build new features for our product.


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

2. Create the local environment file from the example:

   ```powershell
   Copy-Item .example.env .env
   ```

3. Open `.env` and set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` using the values from your Supabase project's API settings. These are the only environment values needed to run this frontend. Do not put a Supabase secret key or legacy `service_role` key in frontend code or expose it in the browser build. `.env` is ignored by Git and should stay local.

4. Install the exact dependency versions from the lockfile:

   ```powershell
   npm ci
   ```

5. Start Vite:

   ```powershell
   npm run dev
   ```

6. Open the local URL printed by Vite (normally `http://localhost:5173`).

In Supabase **Authentication** settings, enable email/password sign-in and add `http://localhost:5173` to the allowed site/redirect URLs. If email confirmation is enabled, confirm the address after signing up before signing in.

The app uses Supabase Auth as its hosted backend for account creation, sign-in, persisted sessions, and sign-out. The hash routes include `/#/auth`, `/#/home`, `/#/details`, `/#/chat`, `/#/leaderboard`, and `/#/settings`; signed-out visitors are routed to sign-in.

For the Friends page's dynamic friend code, the Supabase project must have a `public."User"` profile row whose `id` matches the Auth user ID and whose `friend_code` is a unique six-character code. The table's Row Level Security policy must allow authenticated users to select their own profile row. The sign-up form sends `first_name`, `last_name`, and `full_name` as Auth user metadata; configure the Auth-to-profile trigger to copy the names and generate the friend code in the database.

### Build and preview

Use these commands when needed:

```powershell
npm run build
npm run preview
```

Vite writes production files to `dist/`; `npm run preview` serves that build locally.

### Server-side code

There is no custom server-side application code in this repository; Supabase provides the hosted backend. The files in `app/` run in the browser. `vite.config.js` is Vite development/build tooling and must remain at the repository root; it is not application server code. No `src/` directory is needed unless custom server-side code is added later.

For hosting, deploy the `dist/` directory produced by `npm run build` to Netlify, Vercel, or another static host, and set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` as build environment variables there. Supabase Auth is the backend; this prototype's budgeting data still lives in browser storage and is not yet stored per user in Supabase. Before using it for real financial data, add database tables with Row Level Security policies and move that data to Supabase. Client-side route guards are for navigation only and are not data security.

Each app page lives in its own folder under `app/pages/` and keeps its HTML, CSS, and JavaScript together, named after the folder. Shared styles are in `app/global.css`; browser-persisted prototype state is in `app/core.js`.

## Verifying the Vertical Slice:
Run `npm run dev`, create an account from the sign-in screen, and confirm the email if email confirmations are enabled in Supabase. Then sign in, refresh to verify the session persists, and use **Sign out** to return to the sign-in screen.
