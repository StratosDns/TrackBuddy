# TrackBuddy – Manual Setup Instructions

This file contains all the manual steps you need to complete after cloning this repository to get TrackBuddy fully operational.

---

## Overview

TrackBuddy is a food & macro tracking web app built with:
- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS v4** for styling
- **Supabase** for authentication and database
- **Recharts** for analytics charts
- **Vercel** for hosting

---

## Step 1 – Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **"New project"**.
3. Fill in:
   - **Organization**: select or create one
   - **Project name**: e.g. `trackbuddy`
   - **Database password**: choose a strong password and **save it somewhere safe**
   - **Region**: pick the one closest to your users
4. Click **"Create new project"** and wait ~2 minutes for provisioning.

---

## Step 2 – Run the Database Schema

1. In your Supabase dashboard, open the **SQL Editor** (left sidebar).
2. Click **"New query"**.
3. Open the file `supabase/schema.sql` from this repository.
4. Copy the entire contents and paste it into the SQL editor.
5. Click **"Run"** (or press `Ctrl+Enter`).
6. You should see a success message. The following tables will be created:
   - `foods` – stores user-defined custom foods and their macros
   - `food_logs` – stores daily meal entries
   - `weight_logs` – stores daily body weight entries
7. Row Level Security (RLS) is enabled on all tables so each user can only access their own data.

---

## Step 3 – Configure Authentication

### Enable Email Auth (already on by default)
1. In your Supabase dashboard, go to **Authentication → Providers**.
2. Ensure **Email** is enabled (it is by default).

### Set the Site URL (important for email confirmations)
1. Go to **Authentication → URL Configuration**.
2. Set **Site URL** to:
   - For local dev: `http://localhost:3000`
   - For production (after Vercel deploy): your Vercel URL, e.g. `https://trackbuddy.vercel.app`
3. Under **Redirect URLs**, add:
   - `http://localhost:3000/auth/callback`
   - `https://your-vercel-domain.vercel.app/auth/callback` (add this after deploying)
4. Click **Save**.

### (Optional) Disable email confirmation for faster testing
1. Go to **Authentication → Settings**.
2. Toggle off **"Enable email confirmations"** if you want users to be able to log in immediately without confirming their email.
3. Re-enable this for production.

---

## Step 4 – Get Your Supabase API Keys

1. In your Supabase dashboard, go to **Settings → API**.
2. Copy:
   - **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`)
   - **anon / public** key (starts with `eyJ...`)

---

## Step 5 – Configure Local Environment Variables

1. In the root of this repository, copy the example file:
   ```bash
   cp .env.local.example .env.local
   ```
2. Open `.env.local` and fill in your values:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```
3. **Never commit `.env.local` to Git.** It is already listed in `.gitignore`.

---

## Step 6 – Run the App Locally

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. You should see the login page.

---

## Step 7 – Deploy to Vercel

### Connect Repository to Vercel
1. Go to [https://vercel.com](https://vercel.com) and sign in.
2. Click **"Add New Project"**.
3. Import your GitHub repository (`StratosDns/TrackBuddy`).
4. Vercel will auto-detect it as a Next.js project.

### Add Environment Variables in Vercel
1. Before or after the first deploy, go to your project's **Settings → Environment Variables**.
2. Add the following:
   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project-ref.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `your-anon-key-here` |
3. Set them for **Production**, **Preview**, and **Development** environments.

### Deploy
1. Click **"Deploy"**.
2. Wait for the build to complete (~2 minutes).
3. Your app will be live at a URL like `https://track-buddy-xxxx.vercel.app`.

### Update Supabase Redirect URLs
After getting your Vercel URL:
1. Return to Supabase → **Authentication → URL Configuration**.
2. Update **Site URL** to your Vercel URL.
3. Add `https://your-vercel-domain.vercel.app/auth/callback` to **Redirect URLs**.

---

## Step 8 – (Optional) Custom Domain on Vercel

1. In Vercel project settings, go to **Domains**.
2. Add your custom domain and follow DNS configuration instructions.
3. Update the **Site URL** and **Redirect URLs** in Supabase accordingly.

---

## App Usage Guide

### Getting Started
1. Visit the app and click **"Sign up"** to create a new account.
2. Check your email for a confirmation link (if email confirmation is enabled).
3. After confirming, sign in to access the app.

### Adding Custom Foods
1. Navigate to **My Foods** in the sidebar.
2. Click **"Add Food"**.
3. Enter the food name and its nutritional values **per 100g** (calories, protein, carbs, fats).
4. Click **"Save Food"**.
5. You can add as many foods as you need.

### Logging Meals
1. Click any date on the **Dashboard calendar** (or use **Today** in the nav).
2. Under each meal section (Breakfast, Lunch, Snack, Dinner), click **"Add Food"**.
3. Select a food from your list and enter the amount in grams (or pieces for foods configured per piece).
4. The macros are automatically calculated and totaled.
5. Use the weight input at the top of the day view to log your body weight.

### Viewing Progress
1. Navigate to **Profile**.
2. Use the range selector (7/14/30/90 days) to adjust the chart time window.
3. Charts show:
   - **Weight Progress** – your body weight over time
   - **Daily Calories** – calorie intake per day
   - **Daily Macros** – protein, carbs, and fats per day

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Invalid API key" error | Double-check your `.env.local` or Vercel env vars |
| Email confirmation not arriving | Check spam folder, or disable email confirmation in Supabase for testing |
| Can't log in after sign up | Make sure email confirmation is disabled, or confirm via email link |
| Charts show no data | Add foods and log meals for multiple days first |
| Build fails on Vercel | Ensure both env vars are set in Vercel project settings |
| Database table not found | Re-run the SQL schema from `supabase/schema.sql` |

---

## Project Structure

```
TrackBuddy/
├── app/
│   ├── (app)/              # Protected app pages (require login)
│   │   ├── dashboard/      # Calendar view
│   │   ├── log/[date]/     # Daily meal log
│   │   ├── foods/          # Custom food management
│   │   └── profile/        # Charts and user profile
│   ├── auth/
│   │   ├── login/          # Login page
│   │   ├── signup/         # Signup page
│   │   └── callback/       # OAuth/email callback
│   ├── layout.tsx          # Root layout
│   └── page.tsx            # Redirects to dashboard or login
├── components/
│   ├── ui/                 # Reusable UI components
│   ├── dashboard/          # Calendar component
│   ├── log/                # Day log component
│   ├── profile/            # Chart components
│   └── Navigation.tsx      # Sidebar + mobile nav
├── lib/
│   ├── supabase/           # Supabase client/server/middleware
│   └── types.ts            # TypeScript types and helpers
├── supabase/
│   └── schema.sql          # Database schema (run in Supabase SQL editor)
├── middleware.ts            # Next.js auth middleware
├── .env.local.example      # Environment variables template
└── README_MANUAL_INSTRUCTIONS.md  # This file
```
