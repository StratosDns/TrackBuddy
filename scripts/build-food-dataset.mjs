#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const args = parseArgs(process.argv.slice(2));

if (args.help || (!args.usdaFood && !args.openFoodFacts)) {
  printUsage();
  process.exit(args.help ? 0 : 1);
}

const outputPath = args.output || path.resolve(process.cwd(), 'supabase', 'seed_foods.csv');

const combined = new Map();

if (args.usdaFood) {
  if (!args.usdaFoodNutrient || !args.usdaNutrient) {
    console.error('USDA input requires --usda-food, --usda-food-nutrient, and --usda-nutrient together.');
    process.exit(1);
  }

  const usdaRows = await loadUsdaRows({
    foodPath: args.usdaFood,
    foodNutrientPath: args.usdaFoodNutrient,
    nutrientPath: args.usdaNutrient,
  });

  for (const row of usdaRows) {
    upsertBest(combined, row);
  }
  console.log(`Loaded USDA rows: ${usdaRows.length}`);
}

if (args.openFoodFacts) {
  const offRows = await loadOpenFoodFactsRows(args.openFoodFacts);
  for (const row of offRows) {
    upsertBest(combined, row);
  }
  console.log(`Loaded Open Food Facts rows: ${offRows.length}`);
}

const finalRows = [...combined.values()]
  .filter((r) => r.name.length >= 3)
  .sort((a, b) => a.name.localeCompare(b.name));

await writeTrackBuddyCsv(outputPath, finalRows);

console.log(`Wrote ${finalRows.length} rows to ${outputPath}`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--output') {
      out.output = next;
      i += 1;
    } else if (arg === '--usda-food') {
      out.usdaFood = next;
      i += 1;
    } else if (arg === '--usda-food-nutrient') {
      out.usdaFoodNutrient = next;
      i += 1;
    } else if (arg === '--usda-nutrient') {
      out.usdaNutrient = next;
      i += 1;
    } else if (arg === '--openfoodfacts') {
      out.openFoodFacts = next;
      i += 1;
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return out;
}

function printUsage() {
  console.log(`TrackBuddy food dataset builder

Usage:
  node scripts/build-food-dataset.mjs \\
    --usda-food /path/to/food.csv \\
    --usda-food-nutrient /path/to/food_nutrient.csv \\
    --usda-nutrient /path/to/nutrient.csv \\
    [--openfoodfacts /path/to/products.ndjson] \\
    [--output /absolute/path/to/seed_foods.csv]

Notes:
- USDA files are from FoodData Central full download.
- OpenFoodFacts input may be NDJSON (one JSON object per line) or a JSON array.
- Output CSV columns match TrackBuddy foods table macro fields per 100g.
`);
}

async function loadUsdaRows({ foodPath, foodNutrientPath, nutrientPath }) {
  const nutrientCodes = await loadUsdaTargetNutrients(nutrientPath);
  const foodDescriptions = await loadUsdaFoodDescriptions(foodPath);
  const aggregate = new Map();

  await forEachCsvRow(foodNutrientPath, (row) => {
    const foodId = row.fdc_id;
    const nutrientId = row.nutrient_id;
    const amount = toNumber(row.amount);

    if (!foodId || !nutrientId || amount == null) return;

    const macro = nutrientCodes.get(nutrientId);
    if (!macro) return;

    const bucket = aggregate.get(foodId) || { calories: null, protein: null, carbs: null, fats: null };
    bucket[macro] = amount;
    aggregate.set(foodId, bucket);
  });

  const rows = [];
  for (const [foodId, macros] of aggregate) {
    const name = normalizeFoodName(foodDescriptions.get(foodId) || '');
    if (!name) continue;

    rows.push({
      name,
      calories: clampMacro(macros.calories),
      protein: clampMacro(macros.protein),
      carbs: clampMacro(macros.carbs),
      fats: clampMacro(macros.fats),
      source: 'usda',
      sourcePriority: 2,
    });
  }

  return rows;
}

async function loadUsdaTargetNutrients(nutrientPath) {
  const map = new Map();

  await forEachCsvRow(nutrientPath, (row) => {
    const nutrientId = row.id;
    if (!nutrientId) return;

    const number = (row.number || '').trim();
    const name = (row.name || '').toLowerCase();

    if (number === '208' || (name.includes('energy') && name.includes('kcal'))) {
      map.set(nutrientId, 'calories');
    } else if (number === '203' || name === 'protein') {
      map.set(nutrientId, 'protein');
    } else if (number === '205' || name.includes('carbohydrate')) {
      map.set(nutrientId, 'carbs');
    } else if (number === '204' || name === 'total lipid (fat)' || name === 'fat') {
      map.set(nutrientId, 'fats');
    }
  });

  return map;
}

async function loadUsdaFoodDescriptions(foodPath) {
  const map = new Map();
  await forEachCsvRow(foodPath, (row) => {
    if (row.fdc_id && row.description) {
      map.set(row.fdc_id, row.description);
    }
  });
  return map;
}

async function loadOpenFoodFactsRows(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    const text = await fs.promises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(text);
    const products = Array.isArray(parsed) ? parsed : parsed.products;
    if (!Array.isArray(products)) return [];
    return products
      .map((item) => mapOpenFoodFactsProduct(item))
      .filter(Boolean);
  }

  const rows = [];
  const stream = fs.createReadStream(filePath, 'utf8');
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let malformedCount = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const product = JSON.parse(trimmed);
      const mapped = mapOpenFoodFactsProduct(product);
      if (mapped) rows.push(mapped);
    } catch {
      malformedCount += 1;
    }
  }

  if (malformedCount > 0) {
    console.warn(`Open Food Facts: skipped ${malformedCount} malformed JSON line(s).`);
  }

  return rows;
}

function mapOpenFoodFactsProduct(item) {
  const name = normalizeFoodName(item?.product_name || item?.product_name_en || '');
  if (!name) return null;

  const nutriments = item?.nutriments || {};
  const calories = firstNumber(nutriments['energy-kcal_100g'], nutriments.energy_kcal_100g);
  const protein = firstNumber(nutriments.proteins_100g, nutriments.protein_100g);
  const carbs = firstNumber(nutriments.carbohydrates_100g, nutriments.carbs_100g);
  const fats = firstNumber(nutriments.fat_100g, nutriments.fats_100g);

  if (calories == null && protein == null && carbs == null && fats == null) return null;

  return {
    name,
    calories: clampMacro(calories),
    protein: clampMacro(protein),
    carbs: clampMacro(carbs),
    fats: clampMacro(fats),
    source: 'openfoodfacts',
    sourcePriority: 1,
  };
}

function upsertBest(targetMap, row) {
  const key = row.name.toLowerCase();
  const current = targetMap.get(key);

  if (!current) {
    targetMap.set(key, row);
    return;
  }

  const currentScore = completenessScore(current) * 100 + current.sourcePriority;
  const nextScore = completenessScore(row) * 100 + row.sourcePriority;

  if (nextScore > currentScore) {
    targetMap.set(key, row);
  }
}

function completenessScore(row) {
  let score = 0;
  if (row.calories != null) score += 1;
  if (row.protein != null) score += 1;
  if (row.carbs != null) score += 1;
  if (row.fats != null) score += 1;
  return score;
}

async function forEachCsvRow(filePath, onRow) {
  const stream = fs.createReadStream(filePath, 'utf8');
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headers = null;

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (!headers) {
      headers = parseCsvLine(line).map((h) => h.trim().toLowerCase());
      continue;
    }

    const values = parseCsvLine(line);
    if (values.length === 0) continue;

    const row = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = values[i] ?? '';
    }
    onRow(row);
  }
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }

    current += ch;
  }

  out.push(current);
  return out;
}

function normalizeFoodName(name) {
  return String(name)
    .replace(/\s+/g, ' ')
    .trim();
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstNumber(...values) {
  for (const v of values) {
    const n = toNumber(v);
    if (n != null) return n;
  }
  return null;
}

function clampMacro(value) {
  if (value == null) return null;
  return Math.round(Math.max(0, value) * 100) / 100;
}

async function writeTrackBuddyCsv(filePath, rows) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  const header = [
    'name',
    'calories_per_100g',
    'protein_per_100g',
    'carbs_per_100g',
    'fats_per_100g',
    'is_public',
    'input_basis',
  ];

  const lines = [header.join(',')];

  for (const row of rows) {
    lines.push([
      csvCell(row.name),
      csvCell(numberOrZero(row.calories)),
      csvCell(numberOrZero(row.protein)),
      csvCell(numberOrZero(row.carbs)),
      csvCell(numberOrZero(row.fats)),
      'true',
      'per_100g',
    ].join(','));
  }

  await fs.promises.writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function numberOrZero(value) {
  if (value == null) return 0;
  return value;
}

function csvCell(value) {
  const str = String(value ?? '');
  if (!/[",\n]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}
