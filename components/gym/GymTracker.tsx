'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { Exercise, WorkoutLog, WorkoutSetRow } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Plus, Trash2 } from 'lucide-react';

type ExerciseScope = 'all' | 'mine' | 'public';

const DEFAULT_EXERCISE_FORM = { name: '', muscle_group: '', description: '', is_public: false };

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

export default function GymTracker() {
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [savingSet, setSavingSet] = useState(false);
  const [savingExercise, setSavingExercise] = useState(false);

  const [exerciseScope, setExerciseScope] = useState<ExerciseScope>('all');
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [setRows, setSetRows] = useState<{ reps: string; weight_kg: string }[]>([{ reps: '', weight_kg: '' }]);
  const [notes, setNotes] = useState('');

  const [showExerciseForm, setShowExerciseForm] = useState(false);
  const [exerciseForm, setExerciseForm] = useState(DEFAULT_EXERCISE_FORM);

  async function loadGymData() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
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
      .order('date', { ascending: true });

    setAllExercises((exercises || []) as Exercise[]);
    setWorkoutLogs(
      ((logs || []) as (WorkoutLog & { set_rows: unknown })[]).map((log) => ({
        ...log,
        set_rows: parseSetRows(log.set_rows),
      }))
    );
  }

  useEffect(() => {
    loadGymData();
  }, []);

  const filteredExercises = useMemo(() => {
    const trimmed = exerciseSearch.trim().toLowerCase();
    return allExercises
      .filter((exercise) => {
        if (exerciseScope === 'mine') return exercise.user_id === currentUserId;
        if (exerciseScope === 'public') return exercise.is_public;
        return true;
      })
      .filter((exercise) => !trimmed || exercise.name.toLowerCase().includes(trimmed));
  }, [allExercises, exerciseScope, exerciseSearch, currentUserId]);

  const dayLogs = useMemo(
    () => workoutLogs.filter((log) => log.date === selectedDate),
    [workoutLogs, selectedDate]
  );

  async function createExercise() {
    const supabase = createClient();
    if (!exerciseForm.name.trim()) return;
    setSavingExercise(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSavingExercise(false);
      return;
    }

    const payload = {
      user_id: user.id,
      name: exerciseForm.name.trim(),
      muscle_group: exerciseForm.muscle_group.trim(),
      description: exerciseForm.description.trim(),
      is_public: exerciseForm.is_public,
      is_preset: false,
    };
    const { data, error } = await supabase.from('exercises').insert(payload).select().single();
    if (!error && data) {
      setAllExercises((prev) => [...prev, data as Exercise].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedExerciseId(data.id);
      setExerciseForm(DEFAULT_EXERCISE_FORM);
      setShowExerciseForm(false);
    }
    setSavingExercise(false);
  }

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
      date: selectedDate,
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
        ...(data as WorkoutLog & { set_rows: unknown }),
        set_rows: parseSetRows((data as WorkoutLog & { set_rows: unknown }).set_rows),
      } as WorkoutLog;
      setWorkoutLogs((prev) => [...prev, mapped].sort((a, b) => a.date.localeCompare(b.date)));
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

  const totalSetsToday = dayLogs.reduce((sum, log) => sum + log.set_rows.length, 0);
  const totalRepsToday = dayLogs.reduce((sum, log) => sum + log.set_rows.reduce((s, setRow) => s + setRow.reps, 0), 0);
  const totalVolumeToday = dayLogs.reduce(
    (sum, log) => sum + log.set_rows.reduce((s, setRow) => s + (setRow.reps * setRow.weight_kg), 0),
    0
  );

  return (
    <Card title="My Exercises">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Workout date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Exercise Library</label>
              <div className="flex gap-2 flex-wrap">
                {(['all', 'mine', 'public'] as const).map((scope) => (
                  <button
                    key={scope}
                    onClick={() => setExerciseScope(scope)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      exerciseScope === scope
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                    }`}
                  >
                    {scope === 'all' ? 'All' : scope === 'mine' ? 'Mine' : 'Public'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <Input
              label="Search exercise"
              placeholder="Find by name..."
              value={exerciseSearch}
              onChange={(e) => setExerciseSearch(e.target.value)}
            />
            <Button
              variant="secondary"
              className="md:mb-0 border-red-200 text-red-700 hover:bg-red-50"
              onClick={() => setShowExerciseForm((prev) => !prev)}
            >
              <Plus className="w-4 h-4" />
              New Exercise
            </Button>
          </div>

          {showExerciseForm && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Exercise name"
                value={exerciseForm.name}
                onChange={(e) => setExerciseForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Incline Dumbbell Press"
              />
              <Input
                label="Muscle group"
                value={exerciseForm.muscle_group}
                onChange={(e) => setExerciseForm((prev) => ({ ...prev, muscle_group: e.target.value }))}
                placeholder="Chest"
              />
              <Input
                label="Description"
                value={exerciseForm.description}
                onChange={(e) => setExerciseForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional notes"
                className="md:col-span-2"
              />
              <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={exerciseForm.is_public}
                  onChange={(e) => setExerciseForm((prev) => ({ ...prev, is_public: e.target.checked }))}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                Make this exercise public
              </label>
              <div className="md:col-span-2">
                <Button
                  onClick={createExercise}
                  className="bg-red-600 hover:bg-red-700"
                  loading={savingExercise}
                >
                  Save Exercise
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Choose exercise</label>
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

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Logs for {selectedDate}</h3>
            {dayLogs.length === 0 ? (
              <p className="text-sm text-gray-500">No logs yet for this day.</p>
            ) : (
              <div className="space-y-2">
                {dayLogs.map((log) => (
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
        </div>
    </Card>
  );
}
