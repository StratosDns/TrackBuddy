-- TrackBuddy Database Schema
-- Run this SQL in your Supabase project → SQL Editor

-- =========================================================
-- PROFILES TABLE
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null default '',
  created_at timestamptz default now() not null
);

-- Row Level Security for profiles
alter table public.profiles enable row level security;

-- All authenticated users can read any profile (needed for friend search)
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  using (auth.uid() is not null);

-- Users can insert and update their own profile
create policy "Users can manage their own profile"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    split_part(new.email, '@', 1) || '_' || substring(md5(random()::text), 1, 8),
    split_part(new.email, '@', 1)
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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
  is_public boolean not null default false,
  created_at timestamptz default now() not null
);

-- Row Level Security for foods
alter table public.foods enable row level security;

-- Users can fully manage their own foods
create policy "Users can manage their own foods"
  on public.foods for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- All authenticated users can view public foods
create policy "Public foods are viewable by all authenticated users"
  on public.foods for select
  using (is_public = true);

-- Friends can view each other's foods
create policy "Friends can view each others foods"
  on public.foods for select
  using (
    exists (
      select 1 from public.friendships
      where status = 'accepted'
        and (
          (requester_id = auth.uid() and addressee_id = user_id)
          or (requester_id = user_id and addressee_id = auth.uid())
        )
    )
  );

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

-- Users can fully manage their own logs
create policy "Users can manage their own food logs"
  on public.food_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Friends can view each other's food logs
create policy "Friends can view each others food logs"
  on public.food_logs for select
  using (
    exists (
      select 1 from public.friendships
      where status = 'accepted'
        and (
          (requester_id = auth.uid() and addressee_id = user_id)
          or (requester_id = user_id and addressee_id = auth.uid())
        )
    )
  );

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

-- Users can fully manage their own weight logs
create policy "Users can manage their own weight logs"
  on public.weight_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Friends can view each other's weight logs
create policy "Friends can view each others weight logs"
  on public.weight_logs for select
  using (
    exists (
      select 1 from public.friendships
      where status = 'accepted'
        and (
          (requester_id = auth.uid() and addressee_id = user_id)
          or (requester_id = user_id and addressee_id = auth.uid())
        )
    )
  );

-- Index for date-based queries
create index if not exists weight_logs_user_date_idx on public.weight_logs (user_id, date);

-- =========================================================
-- FRIENDSHIPS TABLE
-- =========================================================
create table if not exists public.friendships (
  id uuid default gen_random_uuid() primary key,
  requester_id uuid references auth.users(id) on delete cascade not null,
  addressee_id uuid references auth.users(id) on delete cascade not null,
  status text not null check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz default now() not null,
  unique(requester_id, addressee_id)
);

-- Extra FK links to profiles for reliable profile joins in Supabase queries
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'friendships_requester_profile_fkey'
      and conrelid = 'public.friendships'::regclass
  ) then
    alter table public.friendships
      add constraint friendships_requester_profile_fkey
      foreign key (requester_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'friendships_addressee_profile_fkey'
      and conrelid = 'public.friendships'::regclass
  ) then
    alter table public.friendships
      add constraint friendships_addressee_profile_fkey
      foreign key (addressee_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- Row Level Security for friendships
alter table public.friendships enable row level security;

-- Users can see all friendships they are part of
create policy "Users can view their own friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Users can send friend requests (insert as requester)
create policy "Users can send friend requests"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

-- Addressee can accept or reject; either party can update status
create policy "Parties can update friendship status"
  on public.friendships for update
  using (auth.uid() = addressee_id or auth.uid() = requester_id)
  with check (auth.uid() = addressee_id or auth.uid() = requester_id);

-- Either party can delete a friendship
create policy "Parties can delete friendships"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Index for fast lookups
create index if not exists friendships_requester_idx on public.friendships (requester_id);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);
