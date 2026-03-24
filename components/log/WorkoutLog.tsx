'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Exercise, WorkoutLog as WorkoutLogType, WorkoutSetRow } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Pencil, Plus, Trash2, X } from 'lucide-react';

interface WorkoutLogProps {
  date: string;
}

interface ExerciseWeightRule {
  increment: number;
}

const DEFAULT_WEIGHT_RULE: ExerciseWeightRule = { increment: 2.5 };
const DEFAULT_REP_OPTIONS = [5, 8, 10, 12, 15];
const WEIGHT_SUGGESTION_COUNT = 80;
const MAX_INLINE_REP_SUGGESTIONS = 7;

const MUSCLE_GROUP_WEIGHT_RULES: Record<string, ExerciseWeightRule> = {
  chest: { increment: 2.5 },
  legs: { increment: 5 },
  back: { increment: 5 },
  shoulders: { increment: 2.5 },
  arms: { increment: 2.5 },
  glutes: { increment: 5 },
};

const EXERCISE_WEIGHT_RULES: Record<string, ExerciseWeightRule> = {
  'Bench Press': { increment: 5 },
  Squat: { increment: 5 },
  Deadlift: { increment: 5 },
  'Overhead Press': { increment: 2.5 },
  'Barbell Row': { increment: 5 },
  'Pull-Up': { increment: 2.5 },
  'Dumbbell Curl': { increment: 2.5 },
  'Triceps Pushdown': { increment: 5 },
  'Leg Press': { increment: 10 },
  'Hip Thrust': { increment: 10 },
};

function getExerciseWeightRule(exercise?: Exercise): ExerciseWeightRule {
  if (!exercise) return DEFAULT_WEIGHT_RULE;
  const exactRule = EXERCISE_WEIGHT_RULES[exercise.name];
  if (exactRule) return exactRule;
  return MUSCLE_GROUP_WEIGHT_RULES[exercise.muscle_group.toLowerCase()] || DEFAULT_WEIGHT_RULE;
}

function clampWeight(weight: number): number {
  return Math.max(weight, 0);
}

function formatWeight(weight: number): string {
  return weight.toFixed(2).replace(/\.?0+$/, '');
}

function parseSetRows(raw: unknown): WorkoutSetRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (typeof row !== 'object' || row === null) return null;
      const reps = Number((row as Record<string, unknown>).reps);
      const weight = Number((row as Record<string, unknown>).weight_kg);
      if (Number.isNaN(reps) || Number.isNaN(weight) || reps <= 0 || weight < 0) return null;
      return { reps, weight_kg: weight };
    })
    .filter((row): row is WorkoutSetRow => row !== null);
}

export default function WorkoutLog({ date }: WorkoutLogProps) {
  const [currentUserId, setCurrentUserId] = useState('');
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSet, setSavingSet] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [exerciseSearch, setExerciseSearch] = useState('');
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [setRows, setSetRows] = useState<{ reps: string; weight_kg: string }[]>([{ reps: '', weight_kg: '' }]);
  const [notes, setNotes] = useState('');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);

  useEffect(() => {
    async function loadWorkoutData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setCurrentUserId(user.id);

      const { data: exercises } = await supabase
        .from('exercises')
        .select('*')
        .or(`user_id.eq.${user.id},is_public.eq.true`)
        .order('name');

      const { data: logs } = await supabase
        .from('workout_logs')
        .select('*, exercise:exercises(*)')
        .eq('user_id', user.id)
        .eq('date', date)
        .order('created_at', { ascending: true });

      setAllExercises((exercises || []) as Exercise[]);
      setWorkoutLogs(
        ((logs || []) as (WorkoutLogType & { set_rows: unknown })[]).map((log) => ({
          ...log,
          set_rows: parseSetRows(log.set_rows),
        }))
      );
      setLoading(false);
    }

    loadWorkoutData();
  }, [date]);

  const filteredExercises = useMemo(() => {
    const trimmed = exerciseSearch.trim().toLowerCase();
    const visible = allExercises.filter((exercise) => exercise.user_id === currentUserId || exercise.is_public);
    const getScore = (exercise: Exercise) => {
      if (!trimmed) return 0;
      const name = exercise.name.toLowerCase();
      if (name === trimmed) return 0;
      if (name.startsWith(trimmed)) return 1;
      if (name.split(/\s+/).some((part) => part.startsWith(trimmed))) return 2;
      if (name.includes(trimmed)) return 3;
      return 4;
    };

    return visible
      .filter((exercise) => !trimmed || exercise.name.toLowerCase().includes(trimmed))
      .sort((a, b) => {
        const scoreDiff = getScore(a) - getScore(b);
        if (scoreDiff !== 0) return scoreDiff;
        return a.name.localeCompare(b.name);
      });
  }, [allExercises, exerciseSearch, currentUserId]);
  const recommendedExercises = useMemo(
    () => filteredExercises.slice(0, 8),
    [filteredExercises]
  );

  const selectedExercise = useMemo(
    () => allExercises.find((exercise) => exercise.id === selectedExerciseId),
    [allExercises, selectedExerciseId]
  );
  const selectedExerciseWeightRule = useMemo(
    () => getExerciseWeightRule(selectedExercise),
    [selectedExercise]
  );
  const repsOptions = useMemo(() => {
    const historicalReps = workoutLogs
      .filter((log) => !selectedExerciseId || log.exercise_id === selectedExerciseId)
      .flatMap((log) => log.set_rows.map((setRow) => setRow.reps));
    return Array.from(new Set([...DEFAULT_REP_OPTIONS, ...historicalReps]))
      .filter((reps) => Number.isFinite(reps) && reps > 0)
      .sort((a, b) => a - b);
  }, [workoutLogs, selectedExerciseId]);
  const repsSuggestionSummary = useMemo(() => {
    const shown = repsOptions.slice(0, MAX_INLINE_REP_SUGGESTIONS);
    if (shown.length === repsOptions.length) return shown.join(', ');
    return `${shown.join(', ')}, ...`;
  }, [repsOptions]);
  const weightOptions = useMemo(() => {
    return Array.from({ length: WEIGHT_SUGGESTION_COUNT }, (_, index) =>
      Number(((index + 1) * selectedExerciseWeightRule.increment).toFixed(2))
    );
  }, [selectedExerciseWeightRule]);

  function addSetRow() {
    setSetRows((prev) => [...prev, { reps: '', weight_kg: '' }]);
  }

  function removeSetRow(index: number) {
    setSetRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function updateSetRow(index: number, field: 'reps' | 'weight_kg', value: string) {
    setSetRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        if (field !== 'weight_kg') return { ...row, [field]: value };
        if (value === '') return { ...row, weight_kg: '' };

        const numericValue = Number(value);
        if (Number.isNaN(numericValue)) return { ...row, weight_kg: value };
        const clamped = clampWeight(numericValue);
        return { ...row, weight_kg: formatWeight(clamped) };
      })
    );
  }

  async function saveWorkoutEntry() {
    const supabase = createClient();
    setSaveError('');
    if (!selectedExerciseId) return;
    const parsedRows = setRows
      .map((row) => ({ reps: Number(row.reps), weight_kg: Number(row.weight_kg) }))
      .filter((row) => !Number.isNaN(row.reps) && row.reps > 0 && !Number.isNaN(row.weight_kg) && row.weight_kg >= 0)
      .map((row) => ({
        reps: row.reps,
        weight_kg: clampWeight(row.weight_kg),
      }));
    if (parsedRows.length === 0) return;

    setSavingSet(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSavingSet(false);
      return;
    }

    const payload = {
      exercise_id: selectedExerciseId,
      set_rows: parsedRows,
      notes: notes.trim(),
    };

    const query = editingLogId
      ? supabase
        .from('workout_logs')
        .update(payload)
        .eq('id', editingLogId)
        .eq('user_id', user.id)
      : supabase
        .from('workout_logs')
        .insert({ ...payload, user_id: user.id, date });

    const { data, error } = await query
      .select('*, exercise:exercises(*)')
      .single();

    if (!error && data) {
      const mapped = {
        ...(data as WorkoutLogType & { set_rows: unknown }),
        set_rows: parseSetRows((data as WorkoutLogType & { set_rows: unknown }).set_rows),
      } as WorkoutLogType;
      setWorkoutLogs((prev) => (
        editingLogId
          ? prev.map((log) => (log.id === editingLogId ? mapped : log))
          : [...prev, mapped]
      ));
      resetWorkoutForm();
    } else if (editingLogId) {
      setSaveError('Unable to update this workout log. Please try again.');
    } else {
      setSaveError('Unable to save this workout log. Please try again.');
    }

    setSavingSet(false);
  }

  async function deleteWorkoutEntry(id: string) {
    const supabase = createClient();
    await supabase.from('workout_logs').delete().eq('id', id);
    setWorkoutLogs((prev) => prev.filter((log) => log.id !== id));
  }

  function editWorkoutEntry(log: WorkoutLogType) {
    setEditingLogId(log.id);
    setSelectedExerciseId(log.exercise_id);
    setExerciseSearch(log.exercise?.name || '');
    setSetRows(
      log.set_rows.length > 0
        ? log.set_rows.map((setRow) => ({ reps: String(setRow.reps), weight_kg: formatWeight(setRow.weight_kg) }))
        : [{ reps: '', weight_kg: '' }]
    );
    setNotes(log.notes || '');
  }

  function resetWorkoutForm() {
    setEditingLogId(null);
    setSelectedExerciseId('');
    setExerciseSearch('');
    setSetRows([{ reps: '', weight_kg: '' }]);
    setNotes('');
  }

  function cancelEditingWorkoutEntry() {
    resetWorkoutForm();
  }

  const totalSetsToday = workoutLogs.reduce((sum, log) => sum + log.set_rows.length, 0);
  const totalRepsToday = workoutLogs.reduce((sum, log) => sum + log.set_rows.reduce((s, setRow) => s + setRow.reps, 0), 0);
  const totalVolumeToday = workoutLogs.reduce(
    (sum, log) => sum + log.set_rows.reduce((s, setRow) => s + (setRow.reps * setRow.weight_kg), 0),
    0
  );

  return (
    <Card title={`Workout Log — ${date}`}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl bg-red-50 border border-red-100 p-3">
            <p className="text-xs text-red-700 font-medium">Total Sets</p>
            <p className="text-2xl font-bold text-red-600">{totalSetsToday}</p>
          </div>
          <div className="rounded-xl bg-red-50 border border-red-100 p-3">
            <p className="text-xs text-red-700 font-medium">Total Reps</p>
            <p className="text-2xl font-bold text-red-600">{totalRepsToday}</p>
          </div>
          <div className="rounded-xl bg-red-50 border border-red-100 p-3">
            <p className="text-xs text-red-700 font-medium">Total Volume</p>
            <p className="text-2xl font-bold text-red-600">{Math.round(totalVolumeToday)} kg</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Choose exercise</label>
          <Input
            placeholder="Find by name..."
            value={exerciseSearch}
            onChange={(e) => setExerciseSearch(e.target.value)}
            aria-label="Search exercises"
          />
          <div className="flex flex-wrap gap-2">
            {recommendedExercises.length === 0 ? (
              <p className="text-xs text-gray-500">No exercise recommendations match your search.</p>
            ) : (
              recommendedExercises.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  onClick={() => {
                    setSelectedExerciseId(exercise.id);
                    setExerciseSearch(exercise.name);
                  }}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    selectedExerciseId === exercise.id
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {exercise.name}
                </button>
              ))
            )}
          </div>
          <select
            value={selectedExerciseId}
            onChange={(e) => setSelectedExerciseId(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm text-gray-900 border-gray-300 focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none"
          >
            <option value="">Select an exercise...</option>
            {filteredExercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
                {exercise.is_preset ? ' (Preset)' : exercise.is_public ? ' (Public)' : ''}
              </option>
            ))}
          </select>
          {selectedExercise && (
            <p className="text-xs text-gray-500">
              Suggestions: reps {repsSuggestionSummary} • weight +{formatWeight(selectedExerciseWeightRule.increment)}kg recommended steps
            </p>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Set Logger</h3>
            <Button
              variant="secondary"
              size="sm"
              className="border-red-200 text-red-700 hover:bg-red-50"
              onClick={addSetRow}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Set
            </Button>
          </div>
          <div className="space-y-2">
            {setRows.map((row, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                <input
                  type="number"
                  min="1"
                  step="1"
                  list="reps-suggestions"
                  placeholder="Reps"
                  value={row.reps}
                  onChange={(e) => updateSetRow(index, 'reps', e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="any"
                  list="weight-suggestions-kg"
                  placeholder="Weight (kg)"
                  value={row.weight_kg}
                  onChange={(e) => updateSetRow(index, 'weight_kg', e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none"
                />
                <button
                  onClick={() => removeSetRow(index)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Remove set"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <datalist id="reps-suggestions">
            {repsOptions.map((reps) => (
              <option key={reps} value={String(reps)} />
            ))}
          </datalist>
          <datalist id="weight-suggestions-kg">
            {weightOptions.map((weight) => (
              <option key={weight} value={formatWeight(weight)} />
            ))}
          </datalist>
          <div className="mt-3">
            <Input
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did this workout feel?"
            />
          </div>
          <div className="mt-3">
            <div className="flex items-center gap-2">
              <Button
                onClick={saveWorkoutEntry}
                className="bg-red-600 hover:bg-red-700"
                loading={savingSet}
              >
                {editingLogId ? 'Update Workout Log' : 'Save Workout Log'}
              </Button>
              {editingLogId && (
                <Button
                  variant="secondary"
                  onClick={cancelEditingWorkoutEntry}
                  disabled={savingSet}
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </Button>
              )}
            </div>
            {saveError && <p className="mt-2 text-xs text-red-600">{saveError}</p>}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Loading workout data...</p>
        ) : workoutLogs.length === 0 ? (
          <p className="text-sm text-gray-500">No logs yet for this day.</p>
        ) : (
          <div className="space-y-2">
            {workoutLogs.map((log) => (
              <div key={log.id} className="rounded-xl border border-gray-200 p-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">{log.exercise?.name || 'Exercise'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {log.set_rows.map((setRow, i) => `Set ${i + 1}: ${setRow.reps} reps × ${setRow.weight_kg}kg`).join(' • ')}
                  </p>
                  {log.notes && <p className="text-xs text-gray-600 mt-1">{log.notes}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => editWorkoutEntry(log)}
                    className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Edit log"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteWorkoutEntry(log.id)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete log"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
