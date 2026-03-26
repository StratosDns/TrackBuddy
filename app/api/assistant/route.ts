const RELEVANT_TOPICS = [
  'nutrition', 'macro', 'macros', 'calorie', 'calories', 'protein', 'carb', 'carbs', 'fat', 'fats', 'fiber',
  'meal', 'diet', 'cut', 'bulk', 'recomp', 'maintenance', 'hydrate', 'hydration', 'water', 'electrolyte', 'sodium',
  'supplement', 'creatine', 'whey', 'casein', 'caffeine', 'beta alanine', 'citrulline', 'omega-3', 'vitamin d',
  'gym', 'workout', 'exercise', 'train', 'training', 'split', 'program', 'periodization', 'progressive overload',
  'plateau', 'deload', 'volume', 'intensity', 'frequency', 'failure', 'rir', 'rpe',
  'lift', 'strength', 'muscle', 'hypertrophy', 'bench', 'squat', 'deadlift', 'overhead press', 'row', 'pull-up',
  'cardio', 'zone 2', 'hiit', 'liss', 'endurance', 'vo2', 'steps',
  'warmup', 'warm-up', 'mobility', 'flexibility', 'recovery', 'rest day', 'sleep', 'soreness', 'doms', 'injury',
  'sets', 'reps', 'tempo', 'rest period', 'technique', 'form',
  'body fat', 'waist', 'bmi', 'metabolism',
  'sports nutrition', 'pre workout', 'post workout', 'meal timing',
];

function isRelevantQuestion(question: string): boolean {
  const text = question.toLowerCase();
  return RELEVANT_TOPICS.some((topic) => text.includes(topic));
}

function buildReply(question: string): string {
  const text = question.toLowerCase();

  if (text.includes('protein') || text.includes('whey') || text.includes('casein')) {
    return 'For most active people, target about 1.6–2.2 g protein per kg bodyweight per day. Split it across 3–5 meals, each with around 25–45 g high-quality protein, and include one serving after training if that helps adherence. Whey is convenient when whole food is difficult; casein is useful later in the day because it digests more slowly.';
  }
  if (text.includes('water') || text.includes('hydration') || text.includes('electrolyte') || text.includes('sodium')) {
    return 'A practical hydration target is roughly 30–40 ml/kg/day, plus additional fluid based on sweat loss during training. If sessions are long, hot, or very sweaty, include sodium/electrolytes to maintain performance and reduce cramping risk. A simple check is pale-yellow urine and stable bodyweight trends across training days.';
  }
  if (text.includes('calorie') || text.includes('cut') || text.includes('bulk') || text.includes('maintenance') || text.includes('recomp')) {
    return 'For fat loss, start with a 300–500 kcal/day deficit and keep protein high to preserve muscle. For lean gain, use a small 150–300 kcal/day surplus and progress strength in key lifts. For recomposition, stay near maintenance with hard resistance training, 1.6–2.2 g/kg protein, and patience over 8–12+ weeks.';
  }
  if (text.includes('creatine') || text.includes('caffeine') || text.includes('beta alanine') || text.includes('citrulline') || text.includes('omega-3') || text.includes('vitamin d') || text.includes('supplement')) {
    return 'Evidence-based supplements to prioritize are creatine monohydrate (3–5 g daily), caffeine (about 2–3 mg/kg pre-workout if tolerated), and protein powder only when daily intake is low. Omega-3 and vitamin D can be useful depending on diet/sun exposure, while beta-alanine and citrulline may help specific performance contexts. Avoid replacing training, sleep, and nutrition fundamentals with supplement stacks.';
  }
  if (text.includes('cardio') || text.includes('zone 2') || text.includes('hiit') || text.includes('liss') || text.includes('endurance') || text.includes('vo2') || text.includes('steps')) {
    return 'Use cardio based on your goal: Zone 2/LISS builds aerobic base and recovery capacity, while HIIT is time-efficient but harder to recover from. A balanced weekly setup for many people is 2–4 cardio sessions plus resistance training, and a daily step target that fits lifestyle (often 7k–12k). Keep strength work in the plan to preserve muscle while improving conditioning.';
  }
  if (text.includes('warmup') || text.includes('warm-up') || text.includes('mobility') || text.includes('flexibility')) {
    return 'A useful warm-up is 5–10 minutes of light cardio, then dynamic mobility for joints used in the session, followed by 2–4 ramp-up sets on the first main lift. Keep static stretching mostly for after training or separate sessions if flexibility is your goal. Prioritize movement quality and pain-free ranges over long, exhausting warm-up routines.';
  }
  if (text.includes('recovery') || text.includes('rest day') || text.includes('sleep') || text.includes('soreness') || text.includes('doms')) {
    return 'Recovery basics are sleep (7–9 hours), enough calories/protein, and smart training load progression. Soreness is common but not required for progress, so don’t chase DOMS as a success metric. Use rest days, lighter sessions, or a deload week when fatigue accumulates and performance stalls.';
  }
  if (text.includes('back') || text.includes('row') || text.includes('pull-up')) {
    return 'A balanced back session can include one vertical pull (pull-up/lat pulldown), one horizontal row, and one hip-hinge or back-extension pattern. Use 2–4 sets per movement with mostly 6–15 reps, controlling the eccentric and using full range of motion you can own. Progress by adding reps first, then load, while keeping technique stable.';
  }
  if (text.includes('bench') || text.includes('squat') || text.includes('deadlift') || text.includes('overhead press') || text.includes('lift') || text.includes('form') || text.includes('technique')) {
    return 'For compound lifts, prioritize stable setup, controlled tempo, and a repeatable bar path before adding weight aggressively. Use a progression model like “add reps within a range, then increase load by the smallest jump” to build consistency. Filming sets and using objective cues (depth, lockout, bar speed) helps improve technique faster.';
  }
  if (text.includes('program') || text.includes('split') || text.includes('periodization') || text.includes('progressive overload') || text.includes('volume') || text.includes('intensity') || text.includes('frequency') || text.includes('sets') || text.includes('reps') || text.includes('rir') || text.includes('rpe') || text.includes('plateau') || text.includes('deload')) {
    return 'A solid training program balances volume, intensity, and frequency over time rather than maxing out every session. A practical hypertrophy target is roughly 10–20 hard sets per muscle per week, usually trained 2x weekly, with most sets around RIR 1–3. If you plateau, first improve sleep/nutrition/adherence, then adjust one variable at a time (volume, intensity, exercise selection), and use a deload when fatigue is high.';
  }
  if (text.includes('workout') || text.includes('training') || text.includes('gym') || text.includes('strength') || text.includes('muscle') || text.includes('hypertrophy')) {
    return 'For most people, 3–5 resistance sessions per week with progressive overload is the most reliable path to strength and muscle gain. Center sessions around compound lifts, add targeted accessories, and keep 1–2 reps in reserve on most working sets. Track lifts, bodyweight, and recovery so you can make small weekly adjustments instead of random program changes.';
  }
  if (text.includes('meal') || text.includes('diet') || text.includes('macro') || text.includes('carb') || text.includes('fat') || text.includes('fiber') || text.includes('pre workout') || text.includes('post workout') || text.includes('meal timing') || text.includes('sports nutrition')) {
    return 'Build meals around lean protein, mostly minimally processed carbs, healthy fats, and enough fiber (commonly ~25–40 g/day). Place carbs around training sessions if performance is a priority, and include protein in both pre- and post-workout meals to support recovery. Daily totals matter most, but meal timing can add a small performance and consistency advantage.';
  }
  if (text.includes('body fat') || text.includes('waist') || text.includes('bmi') || text.includes('metabolism')) {
    return 'Use trend-based metrics instead of single data points: weekly average bodyweight, waist measurements, training performance, and progress photos. BMI can be a broad population tool but often misses context for muscular individuals, so combine it with other markers. “Slow metabolism” is often an energy balance and activity issue, which can be improved by tracking intake, increasing steps, and lifting consistently.';
  }
  if (text.includes('injury') || text.includes('pain')) {
    return 'Train around pain by reducing load, range, or exercise variation temporarily, and avoid pushing through sharp or worsening symptoms. Use controlled tempo and stable technique while symptoms settle, then rebuild gradually. For persistent pain, neurological symptoms, or re-injury patterns, consult a qualified clinician or physical therapist.';
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
