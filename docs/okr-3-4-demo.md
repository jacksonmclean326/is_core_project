# Demonstrating OKR 3 and OKR 4

**Objective:** users are saving money using the app.

| Key Result | What it measures | What makes it change |
| --- | --- | --- |
| **OKR 3** | % of users who consistently meet their savings goals: every Savings and Spending goal met in at least 3 of their last 4 finished months | A user adds or deletes spending, or changes a goal or their income |
| **OKR 4** | % of users who reported savings after two months: "Yes" answers to a check-in shown 60 days after sign-up | A user answers the check-in |

Both numbers are on the team-only **Team OKRs** page, and both are worked out fresh from real data every time you press **Refresh**.

- Live site: <https://tinyurl.com/24pnvb34>
- Team OKRs page: **Settings → More → Team OKRs**, or add `/admin` to the site address
- How it works: see **Savings OKRs** in the README

> **Passwords are not in this file.** The repository is public, and the demo account can open the team page, which lists users' names and emails. Get the passwords from the team, and never commit them.

## Accounts

| Account | Use it for |
| --- | --- |
| `moneyman.demo@example.com` | **Admin.** Opens Team OKRs. Has a linked Plaid Sandbox bank. |
| `okr.sample.jordan@example.com` | OKR 3 demo. Met 3 of the last 4 months, so currently **consistent**. |
| `okr.sample.priya@example.com` | OKR 4 demo. Hasn't answered the check-in yet. |
| `okr.sample.maya`, `ethan`, `sofia`, `liam`, `noah`, `emma`, `ava` (all `@example.com`) | Background users with different savings habits, so the percentages are not all 0% or 100%. |

All `okr.sample.*` accounts share one password.

## Before you present (one-time setup)

1. **Make every presenter an admin.** Sign in as an admin (for example the demo account), open **Team OKRs**, and under **Team admins** type each presenter's login email and choose **Add admin**. It works right away. They need a Money Man account first.
2. **Make Priya old enough for the check-in.** It only appears 60 days after sign-up, and the sample accounts are new. In Supabase, open **SQL Editor** and run:

   ```sql
   update auth.users set created_at = now() - interval '75 days'
   where email = 'okr.sample.priya@example.com';
   ```

3. **Do a dry run** of both demos below, then reset (see the end of this file).

## Demo: OKR 3 (about 20 seconds)

Use two browser windows. The second one must be a **private/incognito** window, so two different accounts can be signed in at once.

1. **Window 1:** sign in as `moneyman.demo@example.com` and open **Team OKRs**. Say the **OKR 3** percentage out loud (it was 38% when this guide was written), then point out Jordan's row: *Met · Met · Missed · Met*, **Consistent: Yes (3 of 4 met)**.
2. **Window 2:** sign in as `okr.sample.jordan@example.com`. Open **Details → Add transaction** and enter:
   - Name: `Concert tickets`
   - Amount: `600`
   - Date: the **18th of last month**
   - Category: Personal

   Then save.
3. **Window 1:** press **Refresh**. Jordan's last month turns to **Missed**, Jordan is **no longer consistent: No (2 of 4 met)**, and **OKR 3 drops** (for example, 38% → 31%).

What to say: *"Jordan was on track, then overspent last month. Our Key Result picked that up right away. Only users who meet their goals in at least 3 of 4 months count as consistent."*

## Demo: OKR 4 (about 20 seconds)

1. **Window 1:** say the **OKR 4** percentage out loud.
2. **Window 2:** sign out, then sign in as `okr.sample.priya@example.com`. The check-in pops up right away: *"Have you saved money since you started using Money Man?"*
3. Choose **Yes, I have**, enter `250`, and press **Send answer**.
4. **Window 1:** press **Refresh**. **OKR 4 rises** by a few points, and Priya's row says **Yes, saved · $250**.

What to say: *"Two months after signing up, every user gets this one question. The Key Result is the share who say they've saved money."*

**Backup if Priya's popup doesn't show:** on Team OKRs, press **Show the check-in now** and answer it as the admin. It updates OKR 4 the same way, but it's the admin answering rather than a regular user, so use the Priya version for the video if you can.

## Recording the Key Results video

The class video must show all 4 Key Results in **90 seconds or less**. For OKR 3 and 4, record the two demos above back to back, about 40 seconds total, leaving about 50 seconds for OKR 1 and 2. Tips:

- Sign in to both windows **before** recording.
- Zoom the browser to 125% so the numbers are readable.
- Pause on the number for a second before and after each Refresh.

## Reset after a practice run or recording

1. **Jordan:** sign in as Jordan, open **Details**, tap the *Concert tickets* transaction, and choose **Delete**.
2. **Priya:** in the Supabase **SQL Editor**, run the query below. Priya's popup will then show again next time.

   ```sql
   delete from public."Savings Check-in"
   where user_id = (select id from auth.users where email = 'okr.sample.priya@example.com');
   ```

3. **Demo admin:** if you used **Show the check-in now**, press **Clear my check-in answer** on Team OKRs.

Press **Refresh** on Team OKRs. Both numbers should be back where they started. Write them down before practicing so you can compare.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| "This page is only for the Money Man team" | That login email isn't an admin yet. An admin can add it under **Team admins** (step 1 of setup). |
| No **Team OKRs** link in Settings | Same as above. Sign out and back in after adding the email. |
| Priya's check-in doesn't pop up | Run setup step 2 again, then sign out and back in. If she already answered, run reset step 2. |
| OKR 3 didn't change after adding the purchase | Check that the date is in **last month** (not this month; the current month isn't finished yet) and that you pressed **Refresh**. |
| Page is slow to load | It recalculates everyone's months on each load. A few seconds is normal. |
