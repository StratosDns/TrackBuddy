-- TrackBuddy Database Schema
-- Run this SQL in your Supabase project → SQL Editor

-- =========================================================
-- FOODS TABLE
-- =========================================================
create table if not exists public.foods (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  calories_per_100g numeric(7,2) not null default 0,
  protein_per_100g numeric(7,2) not null default 0,
  carbs_per_100g numeric(7,2) not null default 0,
  fats_per_100g numeric(7,2) not null default 0,
  created_at timestamptz default now() not null
);

-- Row Level Security for foods
alter table public.foods enable row level security;

create policy "Users can manage their own foods"
  on public.foods for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- =========================================================
-- FOOD_LOGS TABLE
-- =========================================================
create table if not exists public.food_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'snack', 'dinner')),
  food_id uuid references public.foods(id) on delete cascade not null,
  amount_g numeric(7,2) not null,
  created_at timestamptz default now() not null
);

-- Row Level Security for food_logs
alter table public.food_logs enable row level security;

create policy "Users can manage their own food logs"
  on public.food_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for date-based queries
create index if not exists food_logs_user_date_idx on public.food_logs (user_id, date);

-- =========================================================
-- WEIGHT_LOGS TABLE
-- =========================================================
create table if not exists public.weight_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  weight_kg numeric(5,2) not null,
  created_at timestamptz default now() not null,
  unique(user_id, date)
);

-- Row Level Security for weight_logs
alter table public.weight_logs enable row level security;

create policy "Users can manage their own weight logs"
  on public.weight_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for date-based queries
create index if not exists weight_logs_user_date_idx on public.weight_logs (user_id, date);
