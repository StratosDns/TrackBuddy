-- TrackBuddy Database Schema
-- Run this SQL in your Supabase project → SQL Editor

-- =========================================================
-- PROFILES TABLE
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null default '',
  target_calories integer not null default 2000 check (target_calories > 0),
  created_at timestamptz default now() not null
);

alter table public.profiles
  add column if not exists target_calories integer not null default 2000 check (target_calories > 0);

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

alter table public.foods
  add column if not exists created_from_ingredients boolean not null default false;
alter table public.foods
  add column if not exists ingredient_rows jsonb;
alter table public.foods
  add column if not exists input_basis text check (input_basis in ('per_100g', 'per_100ml', 'per_piece'));
alter table public.foods
  add column if not exists piece_weight_g numeric(7,2);

update public.foods
set input_basis = 'per_100g'
where input_basis is null;

alter table public.foods
  alter column input_basis set default 'per_100g';

alter table public.foods
  alter column input_basis set not null;

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
-- WATER_LOGS TABLE
-- =========================================================
create table if not exists public.water_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  water_ml numeric(7,2) not null,
  created_at timestamptz default now() not null,
  unique(user_id, date)
);

-- Row Level Security for water_logs
alter table public.water_logs enable row level security;

-- Users can fully manage their own water logs
create policy "Users can manage their own water logs"
  on public.water_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Friends can view each other's water logs
create policy "Friends can view each other's water logs"
  on public.water_logs for select
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
create index if not exists water_logs_user_date_idx on public.water_logs (user_id, date);

-- =========================================================
-- DIAGRAM_CONFIGS TABLE
-- =========================================================
create table if not exists public.diagram_configs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  metrics text[] not null default '{}'::text[],
  style text not null check (style in ('bar', 'line', 'area', 'stackedBar', 'stepLine')),
  metric_units jsonb not null default '{}'::jsonb,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

alter table public.diagram_configs
  add column if not exists metric_units jsonb not null default '{}'::jsonb;

alter table public.diagram_configs enable row level security;

create policy "Users can manage their own diagram configs"
  on public.diagram_configs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists diagram_configs_user_created_idx on public.diagram_configs (user_id, created_at);

create or replace function public.touch_diagram_configs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists diagram_configs_set_updated_at on public.diagram_configs;
create trigger diagram_configs_set_updated_at
before update on public.diagram_configs
for each row execute function public.touch_diagram_configs_updated_at();

-- =========================================================
-- EXERCISES TABLE
-- =========================================================
create table if not exists public.exercises (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  muscle_group text not null default '',
  description text not null default '',
  is_public boolean not null default false,
  is_preset boolean not null default false,
  created_at timestamptz default now() not null,
  constraint exercises_preset_requires_public check (not is_preset or is_public),
  unique (user_id, name)
);

-- Row Level Security for exercises
alter table public.exercises enable row level security;

-- Users can fully manage their own exercises
create policy "Users can manage their own exercises"
  on public.exercises for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Public exercises are viewable by authenticated users
create policy "Public exercises are viewable by authenticated users"
  on public.exercises for select
  using (is_public = true);

-- Friends can view each other's exercises
create policy "Friends can view each others exercises"
  on public.exercises for select
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

-- Preset exercises can be inserted by service role (null owner rows)
create policy "Service role can insert preset exercises"
  on public.exercises for insert
  with check (auth.role() = 'service_role' and user_id is null and is_preset = true and is_public = true);

-- Authenticated users can view preset exercises
create policy "Preset exercises are viewable by authenticated users"
  on public.exercises for select
  using (is_preset = true and user_id is null and auth.uid() is not null);

-- Indexes for lookup
create index if not exists exercises_user_name_idx on public.exercises (user_id, name);
create index if not exists exercises_public_name_idx on public.exercises (is_public, name);
create unique index if not exists exercises_preset_name_unique
  on public.exercises (name)
  where user_id is null;

-- Seed a small preset exercise catalog
insert into public.exercises (user_id, name, muscle_group, description, is_public, is_preset)
values
  (null, 'Bench Press', 'Chest', 'Barbell press performed on a flat bench.', true, true),
  (null, 'Squat', 'Legs', 'Compound lower-body lift targeting quads and glutes.', true, true),
  (null, 'Deadlift', 'Back', 'Hip hinge movement emphasizing posterior chain strength.', true, true),
  (null, 'Overhead Press', 'Shoulders', 'Vertical pressing movement for shoulder strength.', true, true),
  (null, 'Barbell Row', 'Back', 'Horizontal pull for back and biceps development.', true, true),
  (null, 'Pull-Up', 'Back', 'Bodyweight vertical pull exercise.', true, true),
  (null, 'Dumbbell Curl', 'Arms', 'Isolation movement targeting the biceps.', true, true),
  (null, 'Triceps Pushdown', 'Arms', 'Cable isolation movement for triceps.', true, true),
  (null, 'Leg Press', 'Legs', 'Machine-based compound lower-body movement.', true, true),
  (null, 'Hip Thrust', 'Glutes', 'Hip extension movement emphasizing glute strength.', true, true)
on conflict do nothing;

-- =========================================================
-- WORKOUT_LOGS TABLE
-- =========================================================
create table if not exists public.workout_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  exercise_id uuid references public.exercises(id) on delete cascade not null,
  set_rows jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz default now() not null
);

-- Row Level Security for workout_logs
alter table public.workout_logs enable row level security;

-- Users can fully manage their own workout logs
create policy "Users can manage their own workout logs"
  on public.workout_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Friends can view each other's workout logs
create policy "Friends can view each others workout logs"
  on public.workout_logs for select
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

-- Index for timeline queries
create index if not exists workout_logs_user_date_idx on public.workout_logs (user_id, date);

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
