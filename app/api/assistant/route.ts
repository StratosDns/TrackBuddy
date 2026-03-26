import { WORKOUT_KNOWLEDGE_SECTIONS } from '../../../lib/assistantKnowledgeBase';

const BASE_RELEVANT_TOPICS = [
  'nutrition', 'macro', 'macros', 'calorie', 'calories', 'protein', 'carb', 'carbs', 'fat', 'fats', 'fiber',
  'meal', 'diet', 'cut', 'bulk', 'recomp', 'maintenance', 'hydrate', 'hydration', 'water', 'electrolyte', 'sodium',
  'supplement', 'supplements', 'creatine', 'whey', 'casein', 'caffeine', 'beta alanine', 'citrulline', 'omega-3', 'vitamin d',
  'gym', 'workout', 'exercise', 'train', 'training', 'split', 'program', 'periodization', 'progressive overload',
  'plateau', 'deload', 'volume', 'intensity', 'frequency', 'failure', 'rir', 'rpe',
  'lift', 'strength', 'muscle', 'hypertrophy', 'bench', 'squat', 'deadlift', 'overhead press', 'row', 'pull-up',
  'cardio', 'zone 2', 'hiit', 'liss', 'endurance', 'vo2', 'steps',
  'warmup', 'warm-up', 'mobility', 'flexibility', 'recovery', 'rest day', 'sleep', 'soreness', 'doms', 'injury',
  'sets', 'reps', 'tempo', 'rest period', 'technique', 'form',
  'body fat', 'waist', 'bmi', 'metabolism',
  'sports nutrition', 'pre workout', 'post workout', 'meal timing',
];

const RELEVANT_TOPICS = Array.from(
  new Set([
    ...BASE_RELEVANT_TOPICS,
    ...WORKOUT_KNOWLEDGE_SECTIONS.flatMap((section) => section.keywords),
  ]),
);

function escapeRegexSpecialChars(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasTopic(text: string, topic: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegexSpecialChars(topic)}\\b`, 'i');
  return pattern.test(text);
}

function hasAnyTopic(text: string, topics: string[]): boolean {
  return topics.some((topic) => hasTopic(text, topic));
}

function isRelevantQuestion(question: string): boolean {
  return hasAnyTopic(question, RELEVANT_TOPICS);
}

function getSummaryLine(content: string): string {
  const summaryLine = content
    .split('\n')
    .find((line) => line.startsWith('Summary:'))
    ?.replace('Summary:', '')
    .trim();
  return summaryLine ?? '';
}

function getKnowledgeExcerpt(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 450) return normalized;
  return `${normalized.slice(0, 447)}...`;
}

function buildKnowledgeBaseReply(question: string): string | null {
  const rankedMatches = WORKOUT_KNOWLEDGE_SECTIONS.map((section) => ({
    section,
    score: section.keywords.reduce((count, keyword) => (
      hasTopic(question, keyword) ? count + 1 : count
    ), 0),
  }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (rankedMatches.length === 0) return null;

  const topMatches = rankedMatches.slice(0, 2);
  const responseSections = topMatches.map(({ section }) => {
    const summary = getSummaryLine(section.content);
    const excerpt = getKnowledgeExcerpt(section.content.replace(/^Summary:\s*/m, ''));
    const details = summary ? `${summary} ${excerpt}` : excerpt;
    return `${section.title}: ${details}`;
  });

  return `Based on the TrackBuddy workout knowledge base, here's the most relevant guidance:\n\n${responseSections.join('\n\n')}\n\nIf you share your goal, schedule, equipment, and current level, I can turn this into a week-by-week plan.`;
}

function buildReply(question: string): string {
  const text = question;
  const knowledgeBaseReply = buildKnowledgeBaseReply(text);
  if (knowledgeBaseReply) return knowledgeBaseReply;

  if (hasAnyTopic(text, ['injury', 'pain'])) {
    return 'Train around pain by reducing load, range, or exercise variation temporarily, and avoid pushing through sharp or worsening symptoms. Use controlled tempo and stable technique while symptoms settle, then rebuild gradually. For persistent pain, neurological symptoms, or re-injury patterns, consult a qualified clinician or physical therapist.';
  }
  if (hasAnyTopic(text, ['protein', 'whey', 'casein'])) {
    return 'For most active people, target about 1.6–2.2 g protein per kg bodyweight per day. Split it across 3–5 meals, each with around 25–45 g high-quality protein, and include one serving after training if that helps adherence. Whey is convenient when whole food is difficult; casein is useful later in the day because it digests more slowly.';
  }
  if (hasAnyTopic(text, ['water', 'hydration', 'electrolyte', 'sodium'])) {
    return 'A practical hydration target is roughly 30–40 ml/kg/day, plus additional fluid based on sweat loss during training. If sessions are long, hot, or very sweaty, include sodium/electrolytes to maintain performance and reduce cramping risk. A simple check is pale-yellow urine and stable bodyweight trends across training days.';
  }
  if (hasAnyTopic(text, ['calorie', 'calories', 'cut', 'bulk', 'maintenance', 'recomp'])) {
    return 'For fat loss, start with a 300–500 kcal/day deficit and keep protein high to preserve muscle. For lean gain, use a small 150–300 kcal/day surplus and progress strength in key lifts. For recomposition, stay near maintenance with hard resistance training, 1.6–2.2 g/kg protein, and patience over 8–12+ weeks.';
  }
  if (hasAnyTopic(text, ['creatine', 'caffeine', 'beta alanine', 'citrulline', 'omega-3', 'vitamin d', 'supplement', 'supplements'])) {
    return 'Evidence-based supplements to prioritize are creatine monohydrate (3–5 g daily), caffeine (about 2–3 mg/kg pre-workout if tolerated), and protein powder only when daily intake is low. Omega-3 and vitamin D can be useful depending on diet/sun exposure, while beta-alanine and citrulline may help specific performance contexts. Avoid replacing training, sleep, and nutrition fundamentals with supplement stacks.';
  }
  if (hasAnyTopic(text, ['cardio', 'zone 2', 'hiit', 'liss', 'endurance', 'vo2', 'steps'])) {
    return 'Use cardio based on your goal: Zone 2/LISS builds aerobic base and recovery capacity, while HIIT is time-efficient but harder to recover from. A balanced weekly setup for many people is 2–4 cardio sessions plus resistance training, and a daily step target that fits lifestyle (often 7k–12k). Keep strength work in the plan to preserve muscle while improving conditioning.';
  }
  if (hasAnyTopic(text, ['warmup', 'warm-up', 'mobility', 'flexibility'])) {
    return 'A useful warm-up is 5–10 minutes of light cardio, then dynamic mobility for joints used in the session, followed by 2–4 ramp-up sets on the first main lift. Keep static stretching mostly for after training or separate sessions if flexibility is your goal. Prioritize movement quality and pain-free ranges over long, exhausting warm-up routines.';
  }
  if (hasAnyTopic(text, ['recovery', 'rest day', 'sleep', 'soreness', 'doms'])) {
    return 'Recovery basics are sleep (7–9 hours), enough calories/protein, and smart training load progression. Soreness is common but not required for progress, so don’t chase DOMS as a success metric. Use rest days, lighter sessions, or a deload week when fatigue accumulates and performance stalls.';
  }
  if (hasAnyTopic(text, ['back', 'row', 'pull-up'])) {
    return 'A balanced back session can include one vertical pull (pull-up/lat pulldown), one horizontal row, and one hip-hinge or back-extension pattern. Use 2–4 sets per movement with mostly 6–15 reps, controlling the eccentric and using full range of motion you can own. Progress by adding reps first, then load, while keeping technique stable.';
  }
  if (hasAnyTopic(text, ['bench', 'squat', 'deadlift', 'overhead press', 'lift', 'form', 'technique'])) {
    return 'For compound lifts, prioritize stable setup, controlled tempo, and a repeatable bar path before adding weight aggressively. Use a progression model like “add reps within a range, then increase load by the smallest jump” to build consistency. Filming sets and using objective cues (depth, lockout, bar speed) helps improve technique faster.';
  }
  if (hasAnyTopic(text, ['program', 'split', 'periodization', 'progressive overload', 'volume', 'intensity', 'frequency', 'sets', 'reps', 'rir', 'rpe', 'plateau', 'deload'])) {
    return 'A solid training program balances volume, intensity, and frequency over time rather than maxing out every session. A practical hypertrophy target is roughly 10–20 hard sets per muscle per week, usually trained 2x weekly, with most sets around RIR 1–3. If you plateau, first improve sleep/nutrition/adherence, then adjust one variable at a time (volume, intensity, exercise selection), and use a deload when fatigue is high.';
  }
  if (hasAnyTopic(text, ['workout', 'training', 'gym', 'strength', 'muscle', 'hypertrophy'])) {
    return 'For most people, 3–5 resistance sessions per week with progressive overload is the most reliable path to strength and muscle gain. Center sessions around compound lifts, add targeted accessories, and keep 1–2 reps in reserve on most working sets. Track lifts, bodyweight, and recovery so you can make small weekly adjustments instead of random program changes.';
  }
  if (hasAnyTopic(text, ['meal', 'diet', 'macro', 'macros', 'carb', 'carbs', 'fat', 'fats', 'fiber', 'pre workout', 'post workout', 'meal timing', 'sports nutrition'])) {
    return 'Build meals around lean protein, mostly minimally processed carbs, healthy fats, and enough fiber (commonly ~25–40 g/day). Place carbs around training sessions if performance is a priority, and include protein in both pre- and post-workout meals to support recovery. Daily totals matter most, but meal timing can add a small performance and consistency advantage.';
  }
  if (hasAnyTopic(text, ['body fat', 'waist', 'bmi', 'metabolism'])) {
    return 'Use trend-based metrics instead of single data points: weekly average bodyweight, waist measurements, training performance, and progress photos. BMI can be a broad population tool but often misses context for muscular individuals, so combine it with other markers. “Slow metabolism” is often an energy balance and activity issue, which can be improved by tracking intake, increasing steps, and lifting consistently.';
  }
  return 'I can help with almost any fitness topic, including fat loss, muscle gain, strength training, cardio conditioning, mobility, recovery, and practical nutrition. If you share your goal, training age, schedule, equipment access, and any constraints, I can build a clear step-by-step plan with sets/reps, progression, calories/macros, and weekly checkpoints. I cannot diagnose or treat medical conditions, but I can provide safe, evidence-informed training and nutrition guidance.';
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

  const answer = buildReply(question);
  return Response.json({ answer });
}
