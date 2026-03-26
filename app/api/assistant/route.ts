const ASSISTANT_SYSTEM_PROMPT = `
You are TrackBuddy's in-app AI Coach.
Only answer nutrition and gym/fitness questions.
If a question is unrelated, refuse politely in one short sentence.
Keep responses short and precise (max 2 sentences).
Prefer practical, safe, beginner-friendly guidance.
Never provide diagnosis, treatment plans, or dangerous advice.
`;

const RELEVANT_TOPICS = [
  'nutrition', 'macro', 'macros', 'calorie', 'calories', 'protein', 'carb', 'carbs', 'fat', 'fats', 'fiber',
  'meal', 'diet', 'cut', 'bulk', 'hydrate', 'hydration', 'water', 'supplement', 'creatine', 'whey',
  'gym', 'workout', 'exercise', 'train', 'training', 'lift', 'strength', 'muscle', 'bench', 'squat', 'deadlift',
  'cardio', 'warmup', 'recovery', 'rest day', 'sets', 'reps', 'back', 'chest', 'shoulder', 'arm', 'leg',
];

function isRelevantQuestion(question: string): boolean {
  const text = question.toLowerCase();
  return RELEVANT_TOPICS.some((topic) => text.includes(topic));
}

function buildReply(question: string): string {
  const text = question.toLowerCase();

  if (text.includes('protein')) {
    return 'Aim for roughly 1.6–2.2 g protein per kg bodyweight daily, split across 3–5 meals for consistency.';
  }
  if (text.includes('water') || text.includes('hydration')) {
    return 'A practical target is about 30–40 ml water per kg bodyweight per day, and more if you sweat heavily.';
  }
  if (text.includes('calorie') || text.includes('cut') || text.includes('bulk')) {
    return 'For fat loss, use a small calorie deficit (about 300–500 kcal/day); for muscle gain, use a small surplus (about 150–300 kcal/day).';
  }
  if (text.includes('creatine')) {
    return 'Creatine monohydrate 3–5 g daily is usually enough; take it consistently and stay hydrated.';
  }
  if (text.includes('cardio')) {
    return 'For general health and fat loss support, do 2–4 cardio sessions weekly while keeping resistance training as your priority.';
  }
  if (text.includes('back')) {
    return 'For a beginner back day, start with lat pulldowns, seated cable rows, dumbbell rows, and back extensions. Do 2–3 sets of 8–12 reps each with controlled form and stop 1–2 reps before failure.';
  }
  if (text.includes('bench') || text.includes('squat') || text.includes('deadlift') || text.includes('lift')) {
    return 'Focus on controlled form first, then progress gradually by adding small amounts of weight or reps week to week.';
  }
  if (text.includes('workout') || text.includes('training') || text.includes('gym')) {
    return 'Train each major muscle group at least twice weekly, use progressive overload, and leave 1–2 reps in reserve on most sets.';
  }
  if (text.includes('meal') || text.includes('diet') || text.includes('macro')) {
    return 'Build meals around lean protein, fiber-rich carbs, healthy fats, and enough total calories for your goal.';
  }

  return 'For best progress, keep your plan simple: consistent calories/macros, progressive training, and 7–9 hours of sleep.';
}

function enforcePromptStyle(answer: string): string {
  const maxSentences = ASSISTANT_SYSTEM_PROMPT.includes('max 2 sentences') ? 2 : 2;
  const sentenceParts = answer.match(/[^.!?]+[.!?]?/g) || [answer];
  return sentenceParts.slice(0, maxSentences).join(' ').trim();
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { question?: unknown } | null;
  const question = typeof body?.question === 'string' ? body.question.trim() : '';

  if (!question) {
    return Response.json({ answer: 'Please ask a nutrition or gym question.' }, { status: 400 });
  }

  if (!isRelevantQuestion(question)) {
    return Response.json({ answer: 'I only answer nutrition and gym questions.' });
  }

  const answer = enforcePromptStyle(buildReply(question));
  return Response.json({ answer });
}
