type JsonRecord = Record<string, unknown>;

type Intent =
  | 'workout_plan'
  | 'calorie_estimate'
  | 'macro_guidance'
  | 'supplement_guidance'
  | 'recovery_guidance'
  | 'injury_guidance'
  | 'goal_strategy'
  | 'exercise_guidance'
  | 'general_fitness';

type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
type Equipment = 'full_gym' | 'dumbbells' | 'bodyweight' | 'machines' | 'home_gym' | 'unknown';
type WorkoutTarget =
  | 'back'
  | 'chest'
  | 'shoulders'
  | 'legs'
  | 'arms'
  | 'glutes'
  | 'abs'
  | 'full_body'
  | 'upper_body'
  | 'lower_body';

type WorkoutExercise = {
  name: string;
  sets: string;
  reps: string;
  rest: string;
  intensity?: string;
  note?: string;
};

type WorkoutPlan = {
  title: string;
  goal: string;
  target: WorkoutTarget;
  level: ExperienceLevel;
  sessionNotes?: string[];
  exercises: WorkoutExercise[];
  progression: string[];
  substitutions: string[];
};

const MAX_QUESTION_LENGTH = 2500;

const FITNESS_KEYWORDS = [
  'fitness', 'gym', 'workout', 'training', 'exercise', 'program', 'routine', 'split', 'session',
  'nutrition', 'diet', 'meal', 'calorie', 'calories', 'macro', 'macros', 'protein', 'carb', 'carbs', 'fat', 'fats',
  'supplement', 'supplements', 'creatine', 'whey', 'casein', 'caffeine', 'beta alanine', 'citrulline', 'vitamin d',
  'recovery', 'sleep', 'soreness', 'doms', 'deload', 'progressive overload', 'hypertrophy', 'strength', 'muscle',
  'bench', 'squat', 'deadlift', 'pull up', 'pull-up', 'row', 'lat', 'lats', 'cardio', 'zone 2', 'steps', 'hiit',
  'cut', 'bulk', 'recomp', 'maintenance', 'body fat', 'waist', 'warmup', 'mobility', 'injury', 'pain'
];

const BODY_PART_KEYWORDS: Record<WorkoutTarget, string[]> = {
  back: ['back', 'lats', 'lat', 'upper back', 'mid back', 'rear delts', 'rear delt', 'pull day'],
  chest: ['chest', 'pec', 'pecs'],
  shoulders: ['shoulder', 'shoulders', 'delts', 'delt'],
  legs: ['legs', 'leg day', 'quads', 'hamstrings', 'hams', 'calves'],
  arms: ['arms', 'biceps', 'triceps', 'arm day'],
  glutes: ['glutes', 'glute', 'butt'],
  abs: ['abs', 'abdominals', 'core'],
  full_body: ['full body', 'fullbody'],
  upper_body: ['upper body', 'upper'],
  lower_body: ['lower body', 'lower']
};

const EXERCISE_KEYWORDS = ['bench', 'squat', 'deadlift', 'overhead press', 'pull-up', 'pull up', 'row', 'lat pulldown', 'curl', 'tricep', 'lateral raise'];
const CALORIE_KEYWORDS = ['calorie', 'calories', 'kcal', 'how many calories', 'calories in'];
const MACRO_KEYWORDS = ['macro', 'macros', 'protein', 'carb', 'carbs', 'fat', 'fats', 'fiber'];
const SUPPLEMENT_KEYWORDS = ['supplement', 'supplements', 'creatine', 'whey', 'casein', 'caffeine', 'beta alanine', 'citrulline', 'omega 3', 'omega-3', 'vitamin d'];
const RECOVERY_KEYWORDS = ['recovery', 'sleep', 'soreness', 'doms', 'rest day', 'deload', 'fatigue', 'hydration'];
const INJURY_KEYWORDS = ['injury', 'pain', 'hurt', 'hurts', 'strain', 'tendinitis', 'tendon', 'sharp pain', 'joint pain'];
const GOAL_KEYWORDS = ['cut', 'bulk', 'recomp', 'maintenance', 'lose fat', 'gain muscle', 'lean bulk', 'fat loss'];
const WORKOUT_REQUEST_KEYWORDS = ['workout', 'routine', 'program', 'plan', 'session', 'split'];
const WORKOUT_VERBS = ['give', 'build', 'create', 'make', 'write', 'design'];

const FOOD_CALORIE_DB: Record<string, { calories: string; protein?: string; note?: string }> = {
  egg: { calories: '~70 kcal each', protein: '~6 g protein', note: 'Large egg estimate.' },
  eggs: { calories: '~70 kcal each', protein: '~6 g protein', note: 'Large egg estimate.' },
  chicken: { calories: '~165–250 kcal per 100 g depending on cut and oil', protein: '~20–31 g protein' },
  'chicken breast': { calories: '~165 kcal per 100 g cooked', protein: '~31 g protein' },
  rice: { calories: '~130 kcal per 100 g cooked', note: 'Cooked white rice.' },
  oats: { calories: '~380–390 kcal per 100 g dry', protein: '~13–17 g protein' },
  banana: { calories: '~90–120 kcal each', note: 'Depends on size.' },
  bread: { calories: '~70–120 kcal per slice', note: 'Varies by loaf type and thickness.' },
  salmon: { calories: '~200–230 kcal per 100 g', protein: '~20–25 g protein' },
  beef: { calories: '~170–250 kcal per 100 g cooked', protein: '~26–30 g protein', note: 'Depends on fat level.' },
  yogurt: { calories: '~90–180 kcal per serving', protein: '~8–18 g protein', note: 'Depends on type and sweeteners.' },
  pizza: { calories: '~250–400 kcal per slice', note: 'Crust, cheese, and toppings change this a lot.' },
  pasta: { calories: '~150–160 kcal per 100 g cooked', note: 'Sauce and oil can raise this a lot.' },
  potato: { calories: '~140–170 kcal per medium potato', note: 'Without added butter or oil.' },
  potatoes: { calories: '~140–170 kcal per medium potato', note: 'Without added butter or oil.' },
  'peanut butter': { calories: '~90–100 kcal per tablespoon', protein: '~3–4 g protein' },
  'olive oil': { calories: '~120 kcal per tablespoon' },
  milk: { calories: '~80–160 kcal per 250 ml', protein: '~8–9 g protein', note: 'Depends on fat level.' },
  tuna: { calories: '~110–140 kcal per can in water', protein: '~25–30 g protein' },
  cheese: { calories: '~90–130 kcal per 30 g', protein: '~6–8 g protein' },
  avocado: { calories: '~120–160 kcal per half', note: 'Depends on size.' }
};

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
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

function sanitizeQuestion(value: string): string {
  return compactWhitespace(value).slice(0, MAX_QUESTION_LENGTH);
}

function includesPhrase(text: string, phrase: string): boolean {
  const normalizedText = ` ${normalizeText(text)} `;
  const normalizedPhrase = ` ${normalizeText(phrase)} `;
  return normalizedText.includes(normalizedPhrase);
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => includesPhrase(text, phrase));
}

function detectIntent(question: string): Intent {
  const normalized = normalizeText(question);

  const wantsWorkout =
    includesAny(normalized, WORKOUT_REQUEST_KEYWORDS) ||
    WORKOUT_VERBS.some((verb) => includesPhrase(normalized, verb)) && includesAny(normalized, [...Object.values(BODY_PART_KEYWORDS).flat(), ...WORKOUT_REQUEST_KEYWORDS]);

  if (wantsWorkout) return 'workout_plan';
  if (includesAny(normalized, CALORIE_KEYWORDS)) return 'calorie_estimate';
  if (includesAny(normalized, INJURY_KEYWORDS)) return 'injury_guidance';
  if (includesAny(normalized, SUPPLEMENT_KEYWORDS)) return 'supplement_guidance';
  if (includesAny(normalized, RECOVERY_KEYWORDS)) return 'recovery_guidance';
  if (includesAny(normalized, GOAL_KEYWORDS)) return 'goal_strategy';
  if (includesAny(normalized, MACRO_KEYWORDS)) return 'macro_guidance';
  if (includesAny(normalized, EXERCISE_KEYWORDS)) return 'exercise_guidance';
  return 'general_fitness';
}

function detectLevel(question: string): ExperienceLevel {
  const normalized = normalizeText(question);
  if (includesAny(normalized, ['advanced', 'elite', 'hardcore'])) return 'advanced';
  if (includesAny(normalized, ['intermediate'])) return 'intermediate';
  return 'beginner';
}

function detectEquipment(question: string): Equipment {
  const normalized = normalizeText(question);
  if (includesAny(normalized, ['full gym', 'gym'])) return 'full_gym';
  if (includesAny(normalized, ['dumbbell', 'dumbbells'])) return 'dumbbells';
  if (includesAny(normalized, ['bodyweight', 'no equipment'])) return 'bodyweight';
  if (includesAny(normalized, ['machine', 'machines'])) return 'machines';
  if (includesAny(normalized, ['home gym', 'garage gym', 'barbell and dumbbells'])) return 'home_gym';
  return 'unknown';
}

function detectWorkoutTarget(question: string): WorkoutTarget {
  const normalized = normalizeText(question);

  for (const [target, keywords] of Object.entries(BODY_PART_KEYWORDS) as [WorkoutTarget, string[]][]) {
    if (includesAny(normalized, keywords)) {
      return target;
    }
  }

  return 'full_body';
}

function isRelevantQuestion(question: string): boolean {
  const normalized = normalizeText(question);
  return FITNESS_KEYWORDS.some((keyword) => includesPhrase(normalized, keyword));
}

function formatWorkoutPlan(plan: WorkoutPlan): string {
  const lines: string[] = [
    `${plan.title}`,
    `Goal: ${plan.goal}`,
    `Level: ${capitalize(plan.level)}`
  ];

  if (plan.sessionNotes?.length) {
    lines.push('', 'Session notes:');
    for (const note of plan.sessionNotes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push('', 'Workout:');

  plan.exercises.forEach((exercise, index) => {
    const detailParts = [
      `${exercise.sets} sets`,
      `${exercise.reps} reps`,
      `rest ${exercise.rest}`,
      exercise.intensity ? exercise.intensity : null
    ].filter(Boolean);

    lines.push(`${index + 1}. ${exercise.name} — ${detailParts.join(', ')}`);

    if (exercise.note) {
      lines.push(`   Note: ${exercise.note}`);
    }
  });

  lines.push('', 'Progression:');
  for (const item of plan.progression) {
    lines.push(`- ${item}`);
  }

  lines.push('', 'Substitutions:');
  for (const item of plan.substitutions) {
    lines.push(`- ${item}`);
  }

  return lines.join('\n');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildBackWorkout(level: ExperienceLevel): WorkoutPlan {
  if (level === 'advanced') {
    return {
      title: 'Advanced Back Workout — Width + Thickness Focus',
      goal: 'Maximize lat stimulus, upper-back density, and progression quality without turning the whole session into junk volume.',
      target: 'back',
      level,
      sessionNotes: [
        'Use straps if grip fails before your lats or upper back.',
        'Keep at least one vertical pull and one stable row pattern measurable week to week.',
        'Drive elbows intentionally rather than yanking with biceps and lower back.'
      ],
      exercises: [
        { name: 'Weighted Pull-Up', sets: '4', reps: '5–8', rest: '2–3 min', intensity: 'RIR 1–2', note: 'Full hang if shoulders tolerate it, then drive elbows down.' },
        { name: 'Chest-Supported Row', sets: '4', reps: '6–10', rest: '2 min', intensity: 'RIR 1–2', note: 'Control the eccentric and avoid torso momentum.' },
        { name: 'Neutral-Grip Lat Pulldown', sets: '3', reps: '10–12', rest: '90 sec', intensity: 'RIR 1', note: 'Think elbows to hips to bias lats.' },
        { name: 'One-Arm Cable Lat Row', sets: '3', reps: '12–15', rest: '60–90 sec', intensity: 'RIR 0–1', note: 'Stretch fully and keep shoulder packed.' },
        { name: 'Reverse Pec Deck', sets: '3', reps: '15–20', rest: '60 sec', intensity: 'RIR 0–1', note: 'Rear delts and upper back; don’t shrug everything.' },
        { name: '45-Degree Back Extension', sets: '3', reps: '10–15', rest: '90 sec', intensity: 'RIR 1–2', note: 'Bias erectors or glutes depending on torso angle and setup.' }
      ],
      progression: [
        'Use double progression: hit the top of the rep range on all sets, then add a small amount of load next week.',
        'Keep the first two lifts highly trackable and avoid changing them too often.',
        'If performance falls across the whole session for 2–3 weeks, reduce one accessory movement or deload.'
      ],
      substitutions: [
        'No pull-up station: swap weighted pull-ups for a heavy pulldown.',
        'Lower-back fatigue high: keep rows chest-supported and drop back extensions for a machine row.',
        'Limited equipment: use one-arm dumbbell rows and band or cable pulldowns.'
      ]
    };
  }

  if (level === 'intermediate') {
    return {
      title: 'Intermediate Back Workout',
      goal: 'Build back size and pulling strength with a mix of vertical and horizontal work.',
      target: 'back',
      level,
      sessionNotes: ['Focus on clean reps, full range of motion, and repeatable execution.'],
      exercises: [
        { name: 'Pull-Up or Lat Pulldown', sets: '4', reps: '6–10', rest: '2 min', intensity: 'RIR 1–2' },
        { name: 'Chest-Supported Row', sets: '3', reps: '8–10', rest: '2 min', intensity: 'RIR 1–2' },
        { name: 'Seated Cable Row', sets: '3', reps: '10–12', rest: '90 sec', intensity: 'RIR 1–2' },
        { name: 'Straight-Arm Pulldown', sets: '3', reps: '12–15', rest: '60–90 sec', intensity: 'RIR 0–1' },
        { name: 'Rear-Delt Fly', sets: '2–3', reps: '15–20', rest: '60 sec', intensity: 'RIR 0–1' }
      ],
      progression: [
        'Add reps before load whenever possible.',
        'Keep 1–2 reps in reserve on most working sets and push only the last accessory set very close to failure.'
      ],
      substitutions: [
        'Use one-arm dumbbell rows if cables are unavailable.',
        'Use assisted pull-ups if bodyweight pull-ups are not yet strong enough.'
      ]
    };
  }

  return {
    title: 'Beginner Back Workout',
    goal: 'Learn stable pulling mechanics and build a base of back strength and muscle.',
    target: 'back',
    level,
    sessionNotes: ['Prioritize control and repeatable setup over chasing heavy loads too early.'],
    exercises: [
      { name: 'Lat Pulldown', sets: '3', reps: '8–12', rest: '90 sec', intensity: 'RIR 2' },
      { name: 'Chest-Supported Row', sets: '3', reps: '8–12', rest: '90 sec', intensity: 'RIR 2' },
      { name: 'One-Arm Dumbbell Row', sets: '2–3', reps: '10–12', rest: '60–90 sec', intensity: 'RIR 1–2' },
      { name: 'Rear-Delt Fly', sets: '2', reps: '12–20', rest: '60 sec', intensity: 'RIR 1–2' }
    ],
    progression: [
      'When all sets reach the top of the range with good form, add a small amount of load next session.'
    ],
    substitutions: [
      'Band rows and band pulldowns are fine if you train at home.',
      'Use a machine row if dumbbell setup feels unstable.'
    ]
  };
}

function buildChestWorkout(level: ExperienceLevel): WorkoutPlan {
  return {
    title: `${capitalize(level)} Chest Workout`,
    goal: 'Build pressing strength and chest hypertrophy with stable execution.',
    target: 'chest',
    level,
    sessionNotes: ['Keep shoulder blades set and use a range of motion you can control.'],
    exercises: [
      { name: 'Bench Press or Dumbbell Bench Press', sets: level === 'advanced' ? '4' : '3', reps: '5–8', rest: '2–3 min', intensity: 'RIR 1–2' },
      { name: 'Incline Dumbbell Press', sets: '3', reps: '8–10', rest: '2 min', intensity: 'RIR 1–2' },
      { name: 'Machine Chest Press', sets: '3', reps: '10–12', rest: '90 sec', intensity: 'RIR 1' },
      { name: 'Cable Fly or Pec Deck', sets: '3', reps: '12–15', rest: '60–90 sec', intensity: 'RIR 0–1' },
      { name: 'Push-Up Finisher', sets: '1–2', reps: 'AMRAP with clean form', rest: '60 sec', intensity: 'Stop 1 rep before ugly failure' }
    ],
    progression: ['Progress load only after rep targets are owned with stable form.'],
    substitutions: ['No bench: use weighted push-ups or a machine chest press.']
  };
}

function buildLegWorkout(level: ExperienceLevel): WorkoutPlan {
  return {
    title: `${capitalize(level)} Leg Workout`,
    goal: 'Train quads, hamstrings, and glutes hard while keeping exercise order recoverable.',
    target: 'legs',
    level,
    sessionNotes: ['Place the highest-skill or heaviest movement first, then move into accessories.'],
    exercises: [
      { name: 'Back Squat or Hack Squat', sets: '4', reps: '5–8', rest: '2–3 min', intensity: 'RIR 1–2' },
      { name: 'Romanian Deadlift', sets: '3', reps: '6–10', rest: '2 min', intensity: 'RIR 1–2' },
      { name: 'Leg Press or Bulgarian Split Squat', sets: '3', reps: '10–12', rest: '90 sec', intensity: 'RIR 1' },
      { name: 'Seated or Lying Leg Curl', sets: '3', reps: '10–15', rest: '60–90 sec', intensity: 'RIR 0–1' },
      { name: 'Leg Extension', sets: '2–3', reps: '12–15', rest: '60 sec', intensity: 'RIR 0–1' },
      { name: 'Calf Raise', sets: '3', reps: '10–20', rest: '60 sec', intensity: 'RIR 0–1' }
    ],
    progression: ['Add reps first, then small load jumps once you own the top of the range.'],
    substitutions: ['No squat rack: use goblet squats, leg press, or hack squats.']
  };
}

function buildShoulderWorkout(level: ExperienceLevel): WorkoutPlan {
  return {
    title: `${capitalize(level)} Shoulder Workout`,
    goal: 'Prioritize lateral delt growth while keeping pressing volume productive.',
    target: 'shoulders',
    level,
    sessionNotes: ['Do not let front-delt pressing crowd out lateral and rear-delt work.'],
    exercises: [
      { name: 'Seated Dumbbell Overhead Press', sets: '4', reps: '6–8', rest: '2 min', intensity: 'RIR 1–2' },
      { name: 'Cable Lateral Raise', sets: '4', reps: '12–20', rest: '60 sec', intensity: 'RIR 0–1' },
      { name: 'Machine or Dumbbell Lateral Raise', sets: '3', reps: '12–20', rest: '60 sec', intensity: 'RIR 0–1' },
      { name: 'Reverse Pec Deck', sets: '3', reps: '15–20', rest: '60 sec', intensity: 'RIR 0–1' },
      { name: 'Face Pull', sets: '2–3', reps: '12–20', rest: '60 sec', intensity: 'RIR 1' }
    ],
    progression: ['Increase reps before load on most delt isolation work.'],
    substitutions: ['Use dumbbells if cables are unavailable.']
  };
}

function buildArmsWorkout(level: ExperienceLevel): WorkoutPlan {
  return {
    title: `${capitalize(level)} Arms Workout`,
    goal: 'Drive direct biceps and triceps volume with stable technique and enough proximity to failure.',
    target: 'arms',
    level,
    sessionNotes: ['Keep elbow position deliberate and avoid turning every rep into body English.'],
    exercises: [
      { name: 'EZ-Bar Curl', sets: '3', reps: '8–10', rest: '90 sec', intensity: 'RIR 1' },
      { name: 'Incline Dumbbell Curl', sets: '3', reps: '10–12', rest: '60–90 sec', intensity: 'RIR 0–1' },
      { name: 'Cable Pressdown', sets: '3', reps: '8–12', rest: '60–90 sec', intensity: 'RIR 1' },
      { name: 'Overhead Triceps Extension', sets: '3', reps: '10–15', rest: '60–90 sec', intensity: 'RIR 0–1' },
      { name: 'Hammer Curl', sets: '2–3', reps: '10–15', rest: '60 sec', intensity: 'RIR 0–1' }
    ],
    progression: ['Keep reps clean and progress gradually rather than chasing sloppy overload.'],
    substitutions: ['Machines and cables are fine if elbows prefer them.']
  };
}

function buildGenericWorkout(target: WorkoutTarget, level: ExperienceLevel): WorkoutPlan {
  switch (target) {
    case 'back':
      return buildBackWorkout(level);
    case 'chest':
      return buildChestWorkout(level);
    case 'shoulders':
      return buildShoulderWorkout(level);
    case 'legs':
    case 'lower_body':
    case 'glutes':
      return buildLegWorkout(level);
    case 'arms':
      return buildArmsWorkout(level);
    default:
      return {
        title: `${capitalize(level)} Full-Body Workout`,
        goal: 'Cover the main movement patterns with enough volume to progress without making recovery collapse.',
        target: 'full_body',
        level,
        sessionNotes: ['Use compounds first, then finish with a small amount of accessories.'],
        exercises: [
          { name: 'Squat Pattern', sets: '3', reps: '5–8', rest: '2 min', intensity: 'RIR 1–2' },
          { name: 'Horizontal Press', sets: '3', reps: '6–10', rest: '2 min', intensity: 'RIR 1–2' },
          { name: 'Row or Pull-Down', sets: '3', reps: '8–12', rest: '90 sec', intensity: 'RIR 1–2' },
          { name: 'Hip Hinge', sets: '2–3', reps: '6–10', rest: '2 min', intensity: 'RIR 1–2' },
          { name: 'Lateral Raise or Curl/Pressdown Superset', sets: '2–3', reps: '10–20', rest: '60 sec', intensity: 'RIR 0–1' }
        ],
        progression: ['Add reps first, then load once technique stays stable.'],
        substitutions: ['Use bodyweight or dumbbell versions based on equipment access.']
      };
  }
}

function buildCalorieEstimate(question: string): string {
  const normalized = normalizeText(question);
  const foods = Object.keys(FOOD_CALORIE_DB).filter((food) => includesPhrase(normalized, food));

  if (foods.length === 0) {
    return 'Give me the food name plus portion size if possible, because oil, sauces, cooking method, and serving size can change calories a lot. As a rough rule, lean proteins are usually lower calorie per gram of protein, cooked starches like rice and pasta are moderate-calorie carb sources, and oils or nut butters are very calorie dense.';
  }

  const food = foods[0];
  const entry = FOOD_CALORIE_DB[food];
  const lines = [
    `Estimated calories for ${food}: ${entry.calories}.`,
    entry.protein ? `${entry.protein}.` : '',
    entry.note ?? '',
    'This is still a rough estimate because brand, preparation method, added oil, sauces, and portion size matter.'
  ].filter(Boolean);

  return lines.join(' ');
}

function buildMacroGuidance(question: string): string {
  const normalized = normalizeText(question);
  const isCut = includesAny(normalized, ['cut', 'fat loss', 'lose fat', 'lose weight']);
  const isBulk = includesAny(normalized, ['bulk', 'lean bulk', 'gain muscle', 'muscle gain']);

  if (isCut) {
    return 'For a cut, keep protein high at roughly 1.6–2.4 g/kg/day, keep fats sufficient rather than extremely low, and put the rest of calories into carbs based on training demands. A practical starting point is a moderate calorie deficit with 3–5 protein feedings across the day and enough carbs around training to keep performance from falling off a cliff.';
  }

  if (isBulk) {
    return 'For a lean bulk, a strong default is roughly 1.6–2.2 g/kg/day protein, adequate fats, and enough carbs to support performance and recovery. Keep the calorie surplus small so strength rises steadily without your waistline exploding faster than your lifts improve.';
  }

  return 'For most active people, protein around 1.6–2.2 g/kg/day is a strong default, fats should stay adequate rather than chronically very low, and carbs can fill the remaining calories based on training volume and preference. Total calories matter most for bodyweight change, while protein is the main macro to lock in first.';
}

function buildSupplementGuidance(): string {
  return 'The highest-value supplements for most people are creatine monohydrate at 3–5 g daily, caffeine pre-workout if tolerated, and protein powder only as a convenience tool when whole-food intake falls short. Omega-3 and vitamin D can be useful depending on diet and sun exposure, while beta-alanine and citrulline are more situational and should never replace training, sleep, and nutrition fundamentals.';
}

function buildRecoveryGuidance(): string {
  return 'Recovery basics are sleep, enough calories and protein, hydration, and training load that matches your actual ability to recover. Soreness is not the goal, and if fatigue stays high while performance stalls, reduce volume, take a deload, or simplify the week instead of stacking more hard work onto a system that is already behind.';
}

function buildInjuryGuidance(): string {
  return 'Train around pain rather than through it by reducing load, shortening range temporarily, slowing the tempo, or swapping to a less irritating variation. Sharp pain, worsening pain, numbness, weakness, instability, or repeated reinjury patterns are all signs to stop guessing and get evaluated by a qualified clinician or physical therapist.';
}

function buildGoalStrategy(question: string): string {
  const normalized = normalizeText(question);

  if (includesAny(normalized, ['cut', 'fat loss', 'lose fat', 'lose weight'])) {
    return 'For fat loss, use a moderate calorie deficit, keep protein high, maintain resistance training, and keep daily movement high enough that the diet does not have to do all the work. Aim for sustainable weekly loss rather than a crash approach that trashes training quality and adherence.';
  }

  if (includesAny(normalized, ['bulk', 'lean bulk', 'gain muscle'])) {
    return 'For muscle gain, use a small calorie surplus, keep training performance moving up, and monitor bodyweight together with waist change so you do not confuse rapid fat gain with productive bulking. A slow, controlled surplus is usually easier to sustain and clean up later.';
  }

  return 'For recomposition or maintenance, stay near maintenance calories, keep protein high, and train hard enough to drive progress. Judge success with bodyweight trends, measurements, progress photos, and performance together instead of chasing one isolated metric.';
}

function buildExerciseGuidance(): string {
  return 'For compound lifts, prioritize setup, bracing, controlled tempo, and a repeatable bar path before chasing load aggressively. A reliable progression model is to add reps inside a target range first, then increase load by the smallest practical jump once the range is owned with clean technique.';
}

function buildGeneralFitnessAnswer(): string {
  return 'I can help with workout plans, calorie estimates, macro guidance, supplements, recovery, fat loss, lean bulking, exercise technique, and general training strategy. If you want the strongest answer, include your goal, training level, available equipment, and any time or injury constraints.';
}

function buildReply(question: string): { answer: string; intent: Intent; target?: string; level?: ExperienceLevel; equipment?: Equipment } {
  const intent = detectIntent(question);
  const level = detectLevel(question);
  const equipment = detectEquipment(question);

  switch (intent) {
    case 'workout_plan': {
      const target = detectWorkoutTarget(question);
      const plan = buildGenericWorkout(target, level);
      return {
        answer: formatWorkoutPlan(plan),
        intent,
        target,
        level,
        equipment
      };
    }
    case 'calorie_estimate':
      return { answer: buildCalorieEstimate(question), intent, level, equipment };
    case 'macro_guidance':
      return { answer: buildMacroGuidance(question), intent, level, equipment };
    case 'supplement_guidance':
      return { answer: buildSupplementGuidance(), intent, level, equipment };
    case 'recovery_guidance':
      return { answer: buildRecoveryGuidance(), intent, level, equipment };
    case 'injury_guidance':
      return { answer: buildInjuryGuidance(), intent, level, equipment };
    case 'goal_strategy':
      return { answer: buildGoalStrategy(question), intent, level, equipment };
    case 'exercise_guidance':
      return { answer: buildExerciseGuidance(), intent, level, equipment };
    default:
      return { answer: buildGeneralFitnessAnswer(), intent, level, equipment };
  }
}

function badRequest(message: string, details?: JsonRecord): Response {
  return Response.json({ ok: false, error: message, ...(details ?? {}) }, { status: 400 });
}

function success(data: JsonRecord): Response {
  return Response.json({ ok: true, ...data }, { status: 200 });
}

export async function GET() {
  return success({
    name: 'fitness-qa-route-v2',
    status: 'ready',
    accepts: {
      method: 'POST',
      body: { question: 'string' }
    },
    notes: [
      'Uses intent-first routing rather than generic topic blurbs.',
      'Generates structured workout plans for direct workout requests.',
      'Returns calorie, macro, supplement, recovery, and goal guidance for relevant prompts.'
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
    return badRequest('Please ask a fitness, nutrition, recovery, or workout question.');
  }

  if (!isRelevantQuestion(question)) {
    return success({
      answer: 'I only answer fitness, nutrition, training, recovery, supplement, and workout-related questions.',
      relevant: false,
      intent: null
    });
  }

  const reply = buildReply(question);

  return success({
    answer: reply.answer,
    relevant: true,
    intent: reply.intent,
    target: reply.target ?? null,
    level: reply.level ?? null,
    equipment: reply.equipment ?? null
  });
}
