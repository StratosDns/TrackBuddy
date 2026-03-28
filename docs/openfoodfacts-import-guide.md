# Open Food Facts → Supabase (TrackBuddy) Complete Beginner Guide

This guide shows you exactly how to:

1. expand your food database using **Open Food Facts** data,
2. update your **Supabase schema** safely,
3. automate imports with **GitHub Actions**, and
4. keep only the fields your app actually needs.

---

## What you are building

You will add a new global table (`food_catalog`) that stores curated public foods from Open Food Facts.

- Your existing `foods` table stays for user-created foods.
- New `food_catalog` table will hold imported foods everyone can search.
- A GitHub Action will run on schedule (for example every night), pull data from Open Food Facts, transform/filter it, and upsert into Supabase.

This keeps your app fast, cheap, and easy to control.

---

## Before you start (required)

1. You need:
   - a Supabase project,
   - access to this GitHub repo,
   - ability to add GitHub Actions secrets.
2. In Supabase, go to **Settings → API** and copy:
   - `Project URL`
   - `service_role` key (**never expose this key in frontend code**).
3. In GitHub repo settings, open **Settings → Secrets and variables → Actions** and create:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 1 — Add the new Supabase table

Open **Supabase → SQL Editor → New query** and run this SQL:

```sql
-- 1) Global catalog table (imported from Open Food Facts)
create table if not exists public.food_catalog (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'openfoodfacts',
  source_product_id text not null, -- Open Food Facts product code
  name text not null,
  brand text,
  quantity text,
  serving_size text,
  image_url text,

  calories_per_100g numeric(8,2) not null default 0,
  protein_per_100g numeric(8,2) not null default 0,
  carbs_per_100g numeric(8,2) not null default 0,
  fats_per_100g numeric(8,2) not null default 0,
  fiber_per_100g numeric(8,2),
  sodium_mg_per_100g numeric(10,2),

  ingredients_text text,
  categories text[],
  countries text[],
  raw_off jsonb, -- optional: keeps original source payload for debugging

  source_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (source, source_product_id)
);

create index if not exists food_catalog_name_idx on public.food_catalog (name);
create index if not exists food_catalog_source_idx on public.food_catalog (source, source_product_id);

-- Keep updated_at fresh
create or replace function public.touch_food_catalog_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists food_catalog_set_updated_at on public.food_catalog;
create trigger food_catalog_set_updated_at
before update on public.food_catalog
for each row execute function public.touch_food_catalog_updated_at();

-- 2) Enable RLS
alter table public.food_catalog enable row level security;

-- 3) Read-only access for signed-in users
create policy "Authenticated users can read food catalog"
  on public.food_catalog
  for select
  using (auth.uid() is not null);
```

### Why a separate table?

Your existing `foods` table requires `user_id` and is designed for personal foods.  
Open Food Facts is a shared/global dataset, so it should live in a dedicated shared table.

---

## Step 2 — Choose which fields to keep (data shaping)

Open Food Facts contains many fields. Keep only what TrackBuddy needs.

Recommended mapping:

| Open Food Facts field | Store in `food_catalog` | Notes |
|---|---|---|
| `code` | `source_product_id` | Product identifier |
| `product_name` | `name` | Required for display/search |
| `brands` | `brand` | Optional |
| `quantity` | `quantity` | Optional |
| `serving_size` | `serving_size` | Optional |
| `image_front_url` | `image_url` | Optional |
| `nutriments.energy-kcal_100g` | `calories_per_100g` | fallback to 0 |
| `nutriments.proteins_100g` | `protein_per_100g` | fallback to 0 |
| `nutriments.carbohydrates_100g` | `carbs_per_100g` | fallback to 0 |
| `nutriments.fat_100g` | `fats_per_100g` | fallback to 0 |
| `nutriments.fiber_100g` | `fiber_per_100g` | optional |
| `nutriments.sodium_100g` | `sodium_mg_per_100g` | convert g → mg (`* 1000`) |
| `ingredients_text` | `ingredients_text` | optional |
| `categories_tags` | `categories` | optional text[] |
| `countries_tags` | `countries` | optional text[] |
| `last_modified_t` | `source_updated_at` | unix seconds → timestamptz |
| full product object | `raw_off` | optional troubleshooting |

### Suggested product filters

Apply these before inserting:

- must have `product_name`
- must have at least one of: kcal/protein/carbs/fat
- skip products where all macros are 0
- optionally keep only English/non-empty names to improve UX

---

## Step 3 — Add the importer script

Create file: `scripts/sync-openfoodfacts.mjs`

> This script downloads data from Open Food Facts, transforms it, then upserts into Supabase in batches.

```js
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { createWriteStream, createReadStream, promises as fs } from 'node:fs';
import { createInterface } from 'node:readline';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENFOODFACTS_DUMP_URL =
  process.env.OPENFOODFACTS_DUMP_URL ||
  'https://world.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz';
const MAX_PRODUCTS = Number(process.env.MAX_PRODUCTS || '50000');
const BATCH_SIZE = Number(process.env.BATCH_SIZE || '500');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toRow(product) {
  const nutriments = product.nutriments ?? {};
  const kcal = num(nutriments['energy-kcal_100g']) ?? 0;
  const protein = num(nutriments.proteins_100g) ?? 0;
  const carbs = num(nutriments.carbohydrates_100g) ?? 0;
  const fats = num(nutriments.fat_100g) ?? 0;
  const fiber = num(nutriments.fiber_100g);
  const sodiumG = num(nutriments.sodium_100g);
  const sodiumMg = sodiumG == null ? null : sodiumG * 1000;

  const hasName = typeof product.product_name === 'string' && product.product_name.trim().length > 0;
  const hasAnyMacro = kcal > 0 || protein > 0 || carbs > 0 || fats > 0;
  if (!hasName || !hasAnyMacro) return null;

  return {
    source: 'openfoodfacts',
    source_product_id: String(product.code ?? ''),
    name: product.product_name.trim(),
    brand: product.brands ?? null,
    quantity: product.quantity ?? null,
    serving_size: product.serving_size ?? null,
    image_url: product.image_front_url ?? null,
    calories_per_100g: kcal,
    protein_per_100g: protein,
    carbs_per_100g: carbs,
    fats_per_100g: fats,
    fiber_per_100g: fiber,
    sodium_mg_per_100g: sodiumMg,
    ingredients_text: product.ingredients_text ?? null,
    categories: Array.isArray(product.categories_tags) ? product.categories_tags : null,
    countries: Array.isArray(product.countries_tags) ? product.countries_tags : null,
    raw_off: product,
    source_updated_at: product.last_modified_t
      ? new Date(Number(product.last_modified_t) * 1000).toISOString()
      : null,
    imported_at: new Date().toISOString(),
  };
}

async function upsertBatch(rows) {
  if (!rows.length) return;
  const { error } = await supabase
    .from('food_catalog')
    .upsert(rows, { onConflict: 'source,source_product_id' });
  if (error) throw error;
}

async function main() {
  const gzPath = join(tmpdir(), 'openfoodfacts-products.jsonl.gz');
  const jsonlPath = join(tmpdir(), 'openfoodfacts-products.jsonl');

  console.log('Downloading dump...');
  const response = await fetch(OPENFOODFACTS_DUMP_URL);
  if (!response.ok || !response.body) throw new Error(`Download failed: ${response.status}`);

  await pipeline(response.body, createWriteStream(gzPath));
  console.log('Download complete.');

  console.log('Decompressing...');
  await pipeline(createReadStream(gzPath), createGunzip(), createWriteStream(jsonlPath));
  console.log('Decompression complete.');

  const rl = createInterface({ input: createReadStream(jsonlPath), crlfDelay: Infinity });

  let processed = 0;
  let kept = 0;
  let buffer = [];

  for await (const line of rl) {
    if (!line) continue;
    processed += 1;
    if (processed > MAX_PRODUCTS) break;

    let product;
    try {
      product = JSON.parse(line);
    } catch {
      continue;
    }

    const row = toRow(product);
    if (!row || !row.source_product_id) continue;

    buffer.push(row);
    kept += 1;
    if (buffer.length >= BATCH_SIZE) {
      await upsertBatch(buffer);
      buffer = [];
    }
  }

  await upsertBatch(buffer);
  await fs.rm(gzPath, { force: true });
  await fs.rm(jsonlPath, { force: true });
  console.log(`Done. processed=${processed} kept=${kept}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

---

## Step 4 — Add script command to `package.json`

Add this script:

```json
{
  "scripts": {
    "sync:openfoodfacts": "node scripts/sync-openfoodfacts.mjs"
  }
}
```

---

## Step 5 — Add the GitHub Actions workflow

Create file: `.github/workflows/sync-openfoodfacts.yml`

```yaml
name: Sync Open Food Facts

on:
  workflow_dispatch:
  schedule:
    - cron: "0 2 * * *" # daily at 02:00 UTC

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 60

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run sync
        run: npm run sync:openfoodfacts
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          OPENFOODFACTS_DUMP_URL: https://world.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz
          MAX_PRODUCTS: 50000
          BATCH_SIZE: 500
```

---

## Step 6 — Run once manually first

1. Push your branch.
2. In GitHub, open **Actions → Sync Open Food Facts**.
3. Click **Run workflow**.
4. Check logs for:
   - download success
   - upsert success
   - final counts (`processed` / `kept`)

In Supabase SQL Editor, verify data:

```sql
select count(*) from public.food_catalog;
select name, calories_per_100g, protein_per_100g, carbs_per_100g, fats_per_100g
from public.food_catalog
order by imported_at desc
limit 20;
```

---

## Step 7 — Keep costs/performance under control

Start with smaller imports:

- `MAX_PRODUCTS=10000` for first runs
- increase gradually
- keep `BATCH_SIZE` around 200–1000

Also:

- schedule nightly, not every hour
- keep only needed fields
- optionally remove `raw_off` if storage grows too much

---

## Step 8 — Optional cleanup strategy

If you want to hide stale products:

1. Add column:
   ```sql
   alter table public.food_catalog add column if not exists is_active boolean not null default true;
   ```
2. During each import, set touched rows to active.
3. Periodically mark non-touched rows inactive.

This avoids hard-deleting useful old products.

---

## Security checklist (important)

- ✅ Use **service role key only in GitHub Secrets**.
- ✅ Never expose service role key in browser/client code.
- ✅ Keep RLS enabled on `food_catalog`.
- ✅ Only allow `select` for authenticated users.
- ✅ Use HTTPS source URLs only.

---

## Troubleshooting

### “Workflow fails on download”
- Open Food Facts URL may have changed.
- Confirm latest file name at: `https://world.openfoodfacts.org/data`

### “Upsert conflict errors”
- Ensure unique constraint exists on `(source, source_product_id)`.
- Ensure `onConflict: 'source,source_product_id'` matches exactly.

### “Rows inserted but nutrition is empty”
- Source product may not have nutriments.
- Tighten filters (`hasAnyMacro`) or fallback defaults.

### “Too many rows / storage too big”
- Lower `MAX_PRODUCTS`
- Remove `raw_off`
- Keep only fields used in UI

---

## Recommended rollout plan

1. Add schema + workflow + script in a branch.
2. Import 5k–10k rows first.
3. Update food search UI to include `food_catalog`.
4. Monitor query speed and storage.
5. Increase catalog size gradually.

---

If you want, the next step is implementing the UI query changes so users can search both:
- personal foods (`foods`)
- global catalog (`food_catalog`)
in one combined search experience.
