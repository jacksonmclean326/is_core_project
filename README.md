# App Summary:
College students often struggle to budget effectively due to limited time, income, and motivation. To address this, we created a mobile-friendly budgeting app that automatically imports banking, credit card, and other financial transactions to make the budgeting process simpler. Additionally, we’ve implemented requested features such as investment account tracking, streaks, leaderboards, and AI assisted chatbot functionality. Our app is organized into five distinct domains: settings, home, summary, chat, and leaderboard. Under settings and home, the user can change basic configurations and quickly see their finances. Under summary, the user can view their spending and savings rates broken down by category with customizable data visualizations. Under chat, the user can interact with an AI chatbot to obtain personalized insights about their spending habits and goals. Finally, the leaderboard allows the user to compete with their friends to save the highest percentage of their income, building community and fun accountability into the app.

## ERD:

<img width="468" height="273" alt="image" src="https://github.com/user-attachments/assets/0adb3b78-6da4-47f0-9ca7-5c87a40518d9" />

 
## Tech Stack:
For our front end, we decided to go with a standard HTML/CSS/JS stack. This allows us to stick with what we know, keeps things easy to understand, gives us the ability to make edits quickly, and makes team development easier. We didn’t want to waste time learning a new framework, so we believe this stack best meets our goals.

On the back end, we’re using Supabase. It gives us a solid place that will handle a lot of the backend work that is usually complex, allowing us to do solid backend work. It allows us to build the system fast and focus on the actual features of our product without getting slowed down by excessive configuration.

This combination of HTML/CSS/JS and Supabase allows for a smooth, easy-to-use stack for our app. It uses systems that we are already familiar with and allows us to focus on what really matters when trying to build new features for our product.


## How to Get It Running:
On the repo select ‘Settings’ > ‘Pages’ > ‘Deploy page.’
Once the page is running, any user with the link can access the page.
Also on Settings, go to Environments to set up the env file with the database (supabase). Simply paste in the credentials from the main page of the supabase account.

## Verifying the Vertical Slice:
Once the site is live, attempt to create an account/sign in using the button on the top right and see if your session is saved after a refresh or if the sign in was successful.
