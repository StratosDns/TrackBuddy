# Food macro datasets for TrackBuddy (large + accurate)

If you want the **largest realistic coverage** with good macro accuracy, use a combined pipeline:

1. **USDA FoodData Central full download** (primary source for accuracy)
2. **Open Food Facts bulk data** (secondary source for long-tail branded/global products)

This repo now includes a normalizer script that merges these sources into a CSV matching TrackBuddy's `foods` macro columns.

## Why this combination

- **USDA FoodData Central** has high-quality nutrient data and is best as the default record for duplicate names.
- **Open Food Facts** has very broad product coverage, useful for branded and regional foods USDA may not cover.
- The builder prefers rows with more complete macros and uses USDA as tie-break priority.

## Download sources

### 1) USDA FoodData Central (bulk)

Download the latest **full data** CSV export from FoodData Central and extract:

- `food.csv`
- `food_nutrient.csv`
- `nutrient.csv`

### 2) Open Food Facts (bulk)

Download a bulk export in either:

- NDJSON (one JSON object per line), or
- JSON with a `products` array.

> Keep licensing and attribution requirements from each source when you redistribute or publish data.

## Build TrackBuddy seed CSV

Run from repository root:

```bash
node scripts/build-food-dataset.mjs \
  --usda-food /absolute/path/to/food.csv \
  --usda-food-nutrient /absolute/path/to/food_nutrient.csv \
  --usda-nutrient /absolute/path/to/nutrient.csv \
  --openfoodfacts /absolute/path/to/openfoodfacts-products.ndjson \
  --output /absolute/path/to/seed_foods.csv
```

Output columns:

- `name`
- `calories_per_100g`
- `protein_per_100g`
- `carbs_per_100g`
- `fats_per_100g`
- `is_public` (`true`)
- `input_basis` (`per_100g`)

## Import into your Supabase DB

TrackBuddy `foods` requires a `user_id`, so import via staging first.

Example SQL flow:

```sql
create temporary table tmp_food_seed (
  name text,
  calories_per_100g numeric,
  protein_per_100g numeric,
  carbs_per_100g numeric,
  fats_per_100g numeric,
  is_public boolean,
  input_basis text
);

-- Load seed_foods.csv into tmp_food_seed using your SQL client's CSV import.

insert into public.foods (
  user_id,
  name,
  calories_per_100g,
  protein_per_100g,
  carbs_per_100g,
  fats_per_100g,
  is_public,
  input_basis
)
select
  '<TARGET_USER_UUID>'::uuid,
  t.name,
  t.calories_per_100g,
  t.protein_per_100g,
  t.carbs_per_100g,
  t.fats_per_100g,
  coalesce(t.is_public, true),
  coalesce(t.input_basis, 'per_100g')
from tmp_food_seed t
where t.name is not null
  and btrim(t.name) <> '';
```

## Practical quality checks before import

- Remove obvious duplicates (same name with tiny macro differences)
- Remove rows with improbable macros (e.g., protein > 100g per 100g)
- Keep source-specific curation lists for foods you edit often

This gives you very high breadth while keeping USDA-backed macro quality as the baseline.
