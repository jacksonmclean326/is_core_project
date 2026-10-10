# App Summary:
College students often struggle to budget effectively due to limited time, income, and motivation. To address this, we created a mobile-friendly budgeting app that automatically imports banking, credit card, and other financial transactions to make the budgeting process simpler. Additionally, we’ve implemented requested features such as investment account tracking, streaks, leaderboards, and AI assisted chatbot functionality. Our app is organized into five distinct domains: settings, home, summary, chat, and leaderboard. Under settings and home, the user can change basic configurations and quickly see their finances. Under summary, the user can view their spending and savings rates broken down by category with customizable data visualizations. Under chat, the user can interact with an AI chatbot to obtain personalized insights about their spending habits and goals. Finally, the leaderboard allows the user to compete with their friends to save the highest percentage of their income, building community and fun accountability into the app.

## ERD:

<img width="754" height="458" alt="Screenshot 2026-10-09 at 9 21 23 AM" src="https://github.com/user-attachments/assets/e55333e1-a1df-4d0b-ab80-619b2c09e480" />

 
## Tech Stack:
For our front end, we decided to go with a standard HTML/CSS/JS stack. This allows us to stick with what we know, keeps things easy to understand, gives us the ability to make edits quickly, and makes team development easier. We didn’t want to waste time learning a new framework, so we believe this stack best meets our goals.

On the back end, we’re using Supabase. It gives us a solid place that will handle a lot of the backend work that is usually complex, allowing us to do solid backend work. It allows us to build the system fast and focus on the actual features of our product without getting slowed down by excessive configuration.

This combination of HTML/CSS/JS and Supabase allows for a smooth, easy-to-use stack for our app. It uses systems that we are already familiar with and allows us to focus on what really matters when trying to build new features for our product.


## How to Get It Running:
The site opens at `index.html` and uses hash routes such as `/#/home`, `/#/details`, `/#/chat`, `/#/leaderboard`, and `/#/settings`. The small client-side router in `app/router.js` loads each page into the app shell; page navigation supports browser back/forward and can be bookmarked. The underlying static page files remain accessible by their file paths, so routing only provides cleaner URLs and does not restrict access.

Each app page lives in its own folder under `app/pages/` and keeps its HTML, CSS, and JavaScript together, named after the folder. Shared styles are in `app/global.css`; browser-persisted app state is in `app/core.js`.

To publish with GitHub Pages, select **Settings** > **Pages** and deploy the repository from the desired branch. Once the page is running, any user with the link can access it.
Also on Settings, go to Environments to set up the env file with the database (supabase). Simply paste in the credentials from the main page of the supabase account.

## Verifying the Vertical Slice:
Once the site is live, attempt to create an account/sign in using the button on the top right and see if your session is saved after a refresh or if the sign in was successful.
