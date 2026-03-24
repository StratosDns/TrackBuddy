'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Exercise, WorkoutLog as WorkoutLogType, WorkoutSetRow } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Plus, Trash2 } from 'lucide-react';

interface WorkoutLogProps {
  date: string;
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

  const [exerciseSearch, setExerciseSearch] = useState('');
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [setRows, setSetRows] = useState<{ reps: string; weight_kg: string }[]>([{ reps: '', weight_kg: '' }]);
  const [notes, setNotes] = useState('');

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
    return allExercises
      .filter((exercise) => exercise.user_id === currentUserId || exercise.is_public)
      .filter((exercise) => !trimmed || exercise.name.toLowerCase().includes(trimmed));
  }, [allExercises, exerciseSearch, currentUserId]);

  function addSetRow() {
    setSetRows((prev) => [...prev, { reps: '', weight_kg: '' }]);
  }

  function removeSetRow(index: number) {
    setSetRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function updateSetRow(index: number, field: 'reps' | 'weight_kg', value: string) {
    setSetRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  async function saveWorkoutEntry() {
    const supabase = createClient();
    if (!selectedExerciseId) return;
    const parsedRows = setRows
      .map((row) => ({ reps: Number(row.reps), weight_kg: Number(row.weight_kg) }))
      .filter((row) => !Number.isNaN(row.reps) && row.reps > 0 && !Number.isNaN(row.weight_kg) && row.weight_kg >= 0);
    if (parsedRows.length === 0) return;

    setSavingSet(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSavingSet(false);
      return;
    }

    const payload = {
      user_id: user.id,
      date,
      exercise_id: selectedExerciseId,
      set_rows: parsedRows,
      notes: notes.trim(),
    };

    const { data, error } = await supabase
      .from('workout_logs')
      .insert(payload)
      .select('*, exercise:exercises(*)')
      .single();

    if (!error && data) {
      const mapped = {
        ...(data as WorkoutLogType & { set_rows: unknown }),
        set_rows: parseSetRows((data as WorkoutLogType & { set_rows: unknown }).set_rows),
      } as WorkoutLogType;
      setWorkoutLogs((prev) => [...prev, mapped]);
      setSetRows([{ reps: '', weight_kg: '' }]);
      setNotes('');
    }

    setSavingSet(false);
  }

  async function deleteWorkoutEntry(id: string) {
    const supabase = createClient();
    await supabase.from('workout_logs').delete().eq('id', id);
    setWorkoutLogs((prev) => prev.filter((log) => log.id !== id));
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
                  placeholder="Reps"
                  value={row.reps}
                  onChange={(e) => updateSetRow(index, 'reps', e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none"
                />
                <input
                  type="number"
                  min="0"
                  step="0.5"
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
          <div className="mt-3">
            <Input
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did this workout feel?"
            />
          </div>
          <div className="mt-3">
            <Button
              onClick={saveWorkoutEntry}
              className="bg-red-600 hover:bg-red-700"
              loading={savingSet}
            >
              Save Workout Log
            </Button>
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
                <button
                  onClick={() => deleteWorkoutEntry(log.id)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Delete log"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
