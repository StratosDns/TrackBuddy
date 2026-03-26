type JsonRecord = Record<string, unknown>;

type TopicId =
  | 'injury'
  | 'protein'
  | 'hydration'
  | 'calories'
  | 'supplements'
  | 'cardio'
  | 'warmup'
  | 'recovery'
  | 'back'
  | 'compound_lifts'
  | 'programming'
  | 'training'
  | 'nutrition'
  | 'body_comp'
  | 'meal_timing'
  | 'fat_loss'
  | 'muscle_gain'
  | 'food_calories';

type TopicDefinition = {
  id: TopicId;
  label: string;
  keywords: string[];
  priority: number;
  response: (question: string) => string;
};

const MAX_QUESTION_LENGTH = 2500;
const MAX_TOPICS_IN_REPLY = 4;

const RELEVANT_TOPICS = [
  'nutrition', 'macro', 'macros', 'calorie', 'calories', 'protein', 'carb', 'carbs', 'fat', 'fats', 'fiber',
  'meal', 'diet', 'cut', 'bulk', 'recomp', 'maintenance', 'hydrate', 'hydration', 'water', 'electrolyte', 'sodium',
  'supplement', 'supplements', 'creatine', 'whey', 'casein', 'caffeine', 'beta alanine', 'beta-alanine', 'citrulline', 'omega-3', 'omega 3', 'vitamin d',
  'gym', 'workout', 'exercise', 'train', 'training', 'split', 'program', 'periodization', 'progressive overload',
  'plateau', 'deload', 'volume', 'intensity', 'frequency', 'failure', 'rir', 'rpe',
  'lift', 'strength', 'muscle', 'hypertrophy', 'bench', 'squat', 'deadlift', 'overhead press', 'ohp', 'row', 'pull-up', 'pull up',
  'cardio', 'zone 2', 'zone2', 'hiit', 'liss', 'endurance', 'vo2', 'steps',
  'warmup', 'warm-up', 'mobility', 'flexibility', 'recovery', 'rest day', 'sleep', 'soreness', 'doms', 'injury', 'pain',
  'sets', 'reps', 'tempo', 'rest period', 'technique', 'form',
  'body fat', 'waist', 'bmi', 'metabolism',
  'sports nutrition', 'pre workout', 'pre-workout', 'post workout', 'post-workout', 'meal timing',
  'food', 'rice', 'chicken', 'egg', 'banana', 'oats', 'bread', 'salmon', 'beef', 'yogurt', 'pizza'
];

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'to', 'for', 'of', 'in', 'on', 'at', 'is', 'it', 'this', 'that', 'with', 'my',
  'your', 'our', 'be', 'am', 'are', 'was', 'were', 'do', 'does', 'did', 'can', 'could', 'should', 'would', 'about'
]);

const FOOD_CALORIE_DB: Record<string, { calories: string; protein?: string; note?: string }> = {
  'egg': { calories: '~70 kcal each', protein: '~6 g protein', note: 'Large egg estimate.' },
  'eggs': { calories: '~70 kcal each', protein: '~6 g protein', note: 'Large egg estimate.' },
  'chicken breast': { calories: '~165 kcal per 100 g cooked', protein: '~31 g protein', note: 'Lean cooked breast.' },
  'chicken': { calories: '~165–250 kcal per 100 g depending on cut and oil', protein: '~20–31 g protein' },
  'rice': { calories: '~130 kcal per 100 g cooked', protein: '~2–3 g protein', note: 'Cooked white rice.' },
  'oats': { calories: '~380–390 kcal per 100 g dry', protein: '~13–17 g protein' },
  'banana': { calories: '~90–120 kcal each', note: 'Depends on size.' },
  'apple': { calories: '~80–110 kcal each', note: 'Depends on size.' },
  'bread': { calories: '~70–120 kcal per slice', note: 'Varies by loaf type and thickness.' },
  'salmon': { calories: '~200–230 kcal per 100 g', protein: '~20–25 g protein' },
  'beef': { calories: '~170–250 kcal per 100 g cooked', protein: '~26–30 g protein', note: 'Depends on fat level.' },
  'greek yogurt': { calories: '~90–150 kcal per 170 g serving', protein: '~16–18 g protein', note: 'Depends on fat level and sweeteners.' },
  'yogurt': { calories: '~90–180 kcal per serving', protein: '~8–18 g protein', note: 'Plain Greek yogurt is usually higher in protein.' },
  'potato': { calories: '~140–170 kcal per medium potato', note: 'Without added butter/oil.' },
  'potatoes': { calories: '~140–170 kcal per medium potato', note: 'Without added butter/oil.' },
  'pizza': { calories: '~250–400 kcal per slice', note: 'Highly variable by crust, cheese, and toppings.' },
  'whey': { calories: '~110–140 kcal per scoop', protein: '~20–25 g protein' },
  'milk': { calories: '~80–160 kcal per 250 ml', protein: '~8–9 g protein', note: 'Depends on fat level.' },
  'peanut butter': { calories: '~90–100 kcal per tablespoon', protein: '~3–4 g protein' },
  'olive oil': { calories: '~120 kcal per tablespoon' },
  'tuna': { calories: '~110–140 kcal per can in water', protein: '~25–30 g protein' },
  'pasta': { calories: '~150–160 kcal per 100 g cooked', note: 'Sauce and oil can raise this a lot.' },
  'cheese': { calories: '~90–130 kcal per 30 g', protein: '~6–8 g protein' },
  'avocado': { calories: '~120–160 kcal per half', note: 'Depends on size.' }
};

function escapeRegexSpecialChars(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function sanitizeQuestion(value: string): string {
  return compactWhitespace(value).slice(0, MAX_QUESTION_LENGTH);
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token));
}

function hasTopic(text: string, topic: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedTopic = normalizeText(topic);
  const pattern = new RegExp(`\\b${escapeRegexSpecialChars(normalizedTopic)}\\b`, 'i');
  return pattern.test(normalizedText);
}

function countTopicMatches(text: string, topic: string): number {
  const normalizedText = normalizeText(text);
  const normalizedTopic = normalizeText(topic);
  const pattern = new RegExp(`\\b${escapeRegexSpecialChars(normalizedTopic)}\\b`, 'gi');
  return normalizedText.match(pattern)?.length ?? 0;
}

function hasAnyTopic(text: string, topics: string[]): boolean {
  return topics.some((topic) => hasTopic(text, topic));
}

function isRelevantQuestion(question: string): boolean {
  if (hasAnyTopic(question, RELEVANT_TOPICS)) return true;

  const tokens = tokenize(question);
  const relevantHits = tokens.filter((token) => RELEVANT_TOPICS.some((topic) => hasTopic(topic, token)));
  return relevantHits.length >= 2;
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => hasTopic(text, phrase));
}

function scoreTopic(question: string, keywords: string[]): number {
  let score = 0;

  for (const keyword of keywords) {
    const matches = countTopicMatches(question, keyword);
    if (matches > 0) {
      score += matches * (keyword.includes(' ') ? 3 : 2);
    }
  }

  return score;
}

function dedupeSentences(text: string): string {
  const rawParts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => compactWhitespace(part))
    .filter(Boolean);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const part of rawParts) {
    const key = normalizeText(part);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(part);
    }
  }

  return result.join(' ');
}

function buildCalorieEstimate(question: string): string | null {
  const normalized = normalizeText(question);

  const hasCaloriesIntent =
    includesAny(normalized, ['calorie', 'calories', 'kcal']) ||
    /how many calories/.test(normalized) ||
    /calories in/.test(normalized);

  if (!hasCaloriesIntent) return null;

  const foods = Object.keys(FOOD_CALORIE_DB).filter((food) => hasTopic(normalized, food));

  if (foods.length === 0) {
    return 'For food calories, give the food name plus portion size if possible, because oil, sauces, cooking method, and serving size can change the estimate a lot. As a rough rule, lean proteins are often high protein for relatively fewer calories, cooked starches like rice and pasta are moderate-calorie carb sources, and fats like oils and nut butters are very calorie dense.';
  }

  const primary = foods[0];
  const entry = FOOD_CALORIE_DB[primary];

  const parts = [
    `Approximate calories for ${primary}: ${entry.calories}.`,
    entry.protein ? `${entry.protein}.` : '',
    entry.note ? `${entry.note}` : '',
    'This is still a rough estimate because brand, preparation method, added oil, sauces, and portion size matter.'
  ].filter(Boolean);

  return compactWhitespace(parts.join(' '));
}

function buildGoalHint(question: string): string {
  if (includesAny(question, ['cut', 'fat loss', 'lose fat', 'lose weight'])) {
    return 'Since this sounds fat-loss related, keep protein high, maintain resistance training, and use a moderate calorie deficit rather than an aggressive crash diet.';
  }

  if (includesAny(question, ['bulk', 'lean bulk', 'gain muscle', 'muscle gain'])) {
    return 'Since this sounds muscle-gain focused, use a small calorie surplus, train hard with progressive overload, and judge progress by strength, bodyweight trend, and waist change together.';
  }

  if (includesAny(question, ['recomp', 'recomposition'])) {
    return 'For recomposition, stay near maintenance or in a small deficit/surplus depending on body-fat level, keep protein high, and track changes over several weeks rather than day to day.';
  }

  return '';
}

function buildReplyHeader(question: string): string {
  if (includesAny(question, ['plan', 'program', 'routine', 'split'])) {
    return 'Here is the practical way to think about it:';
  }

  if (includesAny(question, ['calorie', 'calories', 'food'])) {
    return 'Here is a useful estimate:';
  }

  if (includesAny(question, ['pain', 'injury'])) {
    return 'Here is the safest general approach:';
  }

  return 'Here is a practical answer:';
}

const TOPIC_DEFINITIONS: TopicDefinition[] = [
  {
    id: 'injury',
    label: 'injury/pain',
    priority: 100,
    keywords: ['injury', 'pain', 'hurt', 'hurts', 'aching', 'ache', 'strain', 'tendon', 'tendinitis', 'shoulder pain', 'knee pain', 'back pain'],
    response: () =>
      'Train around pain rather than through it: reduce load, shorten range temporarily, slow the tempo, or swap to a less irritating variation. Sharp pain, worsening pain, numbness, weakness, joint instability, or repeated reinjury are signs to stop guessing and get assessed by a qualified clinician or physical therapist.'
  },
  {
    id: 'protein',
    label: 'protein',
    priority: 90,
    keywords: ['protein', 'whey', 'casein', 'amino acids', 'eaas', 'leucine'],
    response: () =>
      'For most active people, a strong protein target is about 1.6–2.2 g per kg of bodyweight per day, with the higher end often more useful during fat loss. Split it across 3–5 feedings, usually around 25–45 g high-quality protein each, and use whey or casein as convenience tools rather than necessities.'
  },
  {
    id: 'hydration',
    label: 'hydration',
    priority: 80,
    keywords: ['water', 'hydration', 'hydrate', 'electrolyte', 'electrolytes', 'sodium', 'potassium', 'sweat', 'cramp', 'cramps'],
    response: () =>
      'A practical hydration target is roughly 30–40 ml/kg/day, plus more based on heat, sweat rate, and training duration. If sessions are long, hot, or very sweaty, adding sodium or electrolytes can support performance and help maintain fluid balance better than water alone.'
  },
  {
    id: 'calories',
    label: 'calories/bodyweight goal',
    priority: 85,
    keywords: ['calorie', 'calories', 'maintenance', 'surplus', 'deficit', 'cut', 'bulk', 'recomp', 'recomposition'],
    response: (question) => {
      const goalHint = buildGoalHint(question);
      return dedupeSentences(
        `For fat loss, a practical starting point is often a 300–500 kcal/day deficit; for lean gain, a small 150–300 kcal/day surplus is usually easier to control than a big “dirty bulk.” For recomposition, staying near maintenance while lifting hard and keeping protein high is often the best approach. ${goalHint}`
      );
    }
  },
  {
    id: 'supplements',
    label: 'supplements',
    priority: 70,
    keywords: ['supplement', 'supplements', 'creatine', 'caffeine', 'beta alanine', 'beta-alanine', 'citrulline', 'omega 3', 'omega-3', 'vitamin d', 'fish oil', 'pre workout', 'pre-workout'],
    response: () =>
      'The highest-value supplements for most people are creatine monohydrate at 3–5 g daily, caffeine before training if tolerated, and protein powder only when whole-food intake falls short. Omega-3 and vitamin D can be useful depending on diet and sunlight exposure, while beta-alanine and citrulline may help specific performance contexts but are less important than sleep, calories, protein, and training quality.'
  },
  {
    id: 'cardio',
    label: 'cardio',
    priority: 60,
    keywords: ['cardio', 'zone 2', 'zone2', 'hiit', 'liss', 'endurance', 'vo2', 'steps', 'running', 'cycling'],
    response: () =>
      'Use cardio based on the goal: Zone 2 or LISS is efficient for aerobic base and recovery capacity, while HIIT is time-efficient but more fatiguing. For many lifters, 2–4 cardio sessions per week plus a consistent daily step target is enough to improve conditioning without interfering too much with strength and hypertrophy.'
  },
  {
    id: 'warmup',
    label: 'warm-up/mobility',
    priority: 55,
    keywords: ['warmup', 'warm-up', 'mobility', 'flexibility', 'activation', 'primer'],
    response: () =>
      'A good warm-up is short and specific: 5–10 minutes of light movement, a few dynamic drills for the joints you will actually use, then 2–4 ramp-up sets on the first main lift. Static stretching is better saved for after training or separate flexibility work unless a specific tight area is clearly limiting your setup.'
  },
  {
    id: 'recovery',
    label: 'recovery',
    priority: 65,
    keywords: ['recovery', 'rest day', 'sleep', 'soreness', 'doms', 'fatigue', 'overtraining', 'deload'],
    response: () =>
      'Recovery is built on sleep, adequate calories, enough protein, hydration, and not letting training fatigue outrun your ability to adapt. Soreness is common but not required for progress, and if performance is stalling while fatigue stays high, a deload or temporary reduction in volume is usually smarter than pushing harder.'
  },
  {
    id: 'back',
    label: 'back training',
    priority: 50,
    keywords: ['back', 'lats', 'lat', 'row', 'pull-up', 'pull up', 'pulldown', 'rear delt'],
    response: () =>
      'A balanced back session usually includes one vertical pull, one horizontal row, and optional rear-delt or spinal-erector work. Most people do well with 2–4 hard sets per exercise in the 6–15 rep range, using a controlled eccentric and full range of motion they can own rather than turning every set into a biceps-dominant yank.'
  },
  {
    id: 'compound_lifts',
    label: 'compound lifts/technique',
    priority: 58,
    keywords: ['bench', 'squat', 'deadlift', 'overhead press', 'ohp', 'lift', 'lifting', 'form', 'technique', 'bar path', 'brace'],
    response: () =>
      'For compound lifts, focus on repeatable setup, bracing, controlled descent, and consistent bar path before chasing weight too aggressively. A simple progression model like adding reps inside a target range before increasing load works well, and filming your working sets often makes technique errors much easier to fix.'
  },
  {
    id: 'programming',
    label: 'programming',
    priority: 75,
    keywords: ['program', 'split', 'periodization', 'progressive overload', 'volume', 'intensity', 'frequency', 'sets', 'reps', 'rir', 'rpe', 'plateau', 'deload'],
    response: () =>
      'A good program balances volume, intensity, and frequency over time instead of trying to max out every session. For hypertrophy, a useful starting point is roughly 10–20 hard sets per muscle per week, often spread across 2 sessions, with most work done around 1–3 reps in reserve and only selective sets pushed very close to failure.'
  },
  {
    id: 'training',
    label: 'general training',
    priority: 45,
    keywords: ['workout', 'training', 'gym', 'strength', 'muscle', 'hypertrophy', 'exercise'],
    response: () =>
      'For most people, 3–5 resistance sessions per week with progressive overload, stable technique, and decent exercise selection is the most reliable path to gaining strength and muscle. Anchor sessions around compounds, add targeted accessories, and track your lifts so your plan evolves from data instead of random changes.'
  },
  {
    id: 'nutrition',
    label: 'nutrition/macros',
    priority: 68,
    keywords: ['meal', 'diet', 'macro', 'macros', 'carb', 'carbs', 'fat', 'fats', 'fiber', 'sports nutrition'],
    response: () =>
      'Build meals around lean protein, mostly minimally processed carb sources, healthy fats, and enough fiber to support satiety and digestion. Daily calorie and protein intake matter most, but keeping carbs around training can help performance and overall training quality.'
  },
  {
    id: 'body_comp',
    label: 'body composition',
    priority: 52,
    keywords: ['body fat', 'waist', 'bmi', 'metabolism', 'skinny fat', 'body composition'],
    response: () =>
      'Judge progress with trend-based metrics like weekly average bodyweight, waist measurement, training performance, and progress photos rather than one-off scale readings. BMI is a broad population tool, not a complete physique metric, and what people call a “slow metabolism” is often better explained by low activity, undercounted intake, or adaptive changes during long dieting.'
  },
  {
    id: 'meal_timing',
    label: 'meal timing',
    priority: 57,
    keywords: ['pre workout', 'pre-workout', 'post workout', 'post-workout', 'meal timing', 'peri workout', 'intra workout'],
    response: () =>
      'Meal timing is secondary to total calories and protein, but it can still help performance and consistency. A practical setup is a pre-workout meal with carbs plus protein 1–3 hours before training, then another protein-rich meal afterward, with intra-workout nutrition usually unnecessary for normal lifting sessions.'
  },
  {
    id: 'fat_loss',
    label: 'fat loss',
    priority: 72,
    keywords: ['cut', 'fat loss', 'lose fat', 'lose weight', 'diet down'],
    response: () =>
      'To lose fat while keeping muscle, maintain resistance training, keep protein high, and use the smallest calorie deficit that still moves bodyweight down consistently. Daily steps, food choice quality, and adherence matter more long term than trying to suffer through an unsustainably aggressive cut.'
  },
  {
    id: 'muscle_gain',
    label: 'muscle gain',
    priority: 72,
    keywords: ['bulk', 'lean bulk', 'gain muscle', 'muscle gain', 'put on size'],
    response: () =>
      'For muscle gain, use a small surplus, train with enough hard volume to progress, and keep weight gain controlled rather than trying to gain as fast as possible. The best bulk is usually the one where strength rises steadily and waist gain stays relatively modest.'
  },
  {
    id: 'food_calories',
    label: 'food calories',
    priority: 95,
    keywords: ['food', 'rice', 'chicken', 'egg', 'eggs', 'banana', 'oats', 'bread', 'salmon', 'beef', 'yogurt', 'pizza', 'pasta', 'potato', 'potatoes', 'peanut butter', 'olive oil', 'milk', 'tuna', 'cheese', 'avocado'],
    response: (question) =>
      buildCalorieEstimate(question) ??
      'Food calorie estimates depend heavily on serving size, cooking method, oil, sauces, and brand. Give the food plus approximate portion size for the best estimate.'
  }
];

function detectTopics(question: string): TopicDefinition[] {
  const scored = TOPIC_DEFINITIONS
    .map((topic) => ({
      topic,
      score: scoreTopic(question, topic.keywords) + topic.priority / 100
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.topic.priority - a.topic.priority)
    .map((item) => item.topic);

  const deduped: TopicDefinition[] = [];
  const seen = new Set<TopicId>();

  for (const topic of scored) {
    if (!seen.has(topic.id)) {
      seen.add(topic.id);
      deduped.push(topic);
    }
  }

  return deduped.slice(0, MAX_TOPICS_IN_REPLY);
}

function buildGenericFallback(question: string): string {
  const goalHint = buildGoalHint(question);

  return dedupeSentences(
    `I can help with fat loss, muscle gain, strength training, cardio conditioning, recovery, exercise technique, and practical nutrition. The most useful next inputs are your goal, training age, weekly schedule, available equipment, and any pain or constraints. ${goalHint} I cannot diagnose medical conditions, but I can give safe, evidence-aware training and nutrition guidance.`
  );
}

function buildReply(question: string): string {
  const header = buildReplyHeader(question);
  const calorieEstimate = buildCalorieEstimate(question);
  const topics = detectTopics(question);

  const sections: string[] = [header];

  if (calorieEstimate && !topics.some((t) => t.id === 'food_calories')) {
    sections.push(calorieEstimate);
  }

  if (topics.length > 0) {
    for (const topic of topics) {
      sections.push(topic.response(question));
    }
  } else {
    sections.push(buildGenericFallback(question));
  }

  if (!topics.some((t) => t.id === 'injury') && includesAny(question, ['pain', 'injury', 'hurt', 'hurts'])) {
    sections.push('If symptoms are sharp, worsening, or causing numbness, weakness, instability, or repeated reinjury, get evaluated by a qualified clinician rather than trying to self-program around it.');
  }

  const answer = dedupeSentences(sections.join(' '));
  return answer;
}

function badRequest(message: string, details?: JsonRecord): Response {
  return Response.json(
    {
      ok: false,
      error: message,
      ...(details ?? {})
    },
    { status: 400 }
  );
}

function success(data: JsonRecord): Response {
  return Response.json(
    {
      ok: true,
      ...data
    },
    { status: 200 }
  );
}

export async function GET() {
  return success({
    name: 'fitness-qa-route',
    status: 'ready',
    accepts: {
      method: 'POST',
      body: {
        question: 'string'
      }
    },
    notes: [
      'Answers fitness, nutrition, recovery, cardio, and training questions.',
      'Rejects empty prompts and non-fitness questions.',
      'Uses keyword scoring and multi-topic response generation.'
    ]
  });
}

export async function POST(request: Request) {
  let body: { question?: unknown } | null = null;

  try {
    body = (await request.json()) as { question?: unknown } | null;
  } catch {
    return badRequest('Invalid JSON body. Send { "question": "..." }.');
  }

  const rawQuestion = typeof body?.question === 'string' ? body.question : '';
  const question = sanitizeQuestion(rawQuestion);

  if (!question) {
    return badRequest('Please ask a nutrition or gym question.');
  }

  if (question.length < 2) {
    return badRequest('Your question is too short. Add a bit more detail.');
  }

  if (!isRelevantQuestion(question)) {
    return success({
      answer: 'I only answer fitness, nutrition, recovery, cardio, and gym-related questions.',
      relevant: false,
      topics: []
    });
  }

  const detectedTopics = detectTopics(question);
  const answer = buildReply(question);

  return success({
    answer,
    relevant: true,
    topics: detectedTopics.map((topic) => topic.label)
  });
}
