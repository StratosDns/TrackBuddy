# TrackBuddy
Calories and Macro Tracking App

A full-stack food tracking application built with Next.js 16, Supabase, and Tailwind CSS.

## Features
- 🔐 User authentication (sign up / sign in) via Supabase
- 🍽️ Custom food library with macros per 100g (unlimited foods)
- 📅 Calendar-based daily tracking
- 🥗 Meal logging by category: Breakfast / Lunch / Snack / Dinner
- ⚖️ Daily body weight logging
- 📊 Charts for weight progress, calories, protein, carbs, and fats
- 📱 Fully responsive — works on mobile and desktop

## Quick Start

See [README_MANUAL_INSTRUCTIONS.md](README_MANUAL_INSTRUCTIONS.md) for complete setup instructions including Supabase and Vercel deployment.

```bash
# 1. Copy environment variables
cp .env.local.example .env.local
# (fill in your Supabase URL and anon key)

# 2. Install dependencies
npm install

# 3. Run database schema in Supabase SQL Editor
# (see supabase/schema.sql)

# 4. Start development server
npm run dev
```
