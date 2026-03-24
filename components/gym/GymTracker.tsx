'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, parseISO, subDays, isAfter } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { Exercise, WorkoutLog, WorkoutSetRow } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Dumbbell, Plus, Trash2, TrendingUp, LineChart as LineChartIcon, BarChart3 } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend
} from 'recharts';

type ExerciseScope = 'all' | 'mine' | 'public';
type ChartType = 'line' | 'bar';
type TimelineMetric = 'maxWeight' | 'totalVolume' | 'totalReps' | 'sets';
const MIN_MOVING_AVERAGE_WINDOW = 2;
const MAX_MOVING_AVERAGE_WINDOW = 10;

const RANGE_PRESETS = [
  { label: '7 Days', days: 7 },
  { label: '14 Days', days: 14 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
];

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

function timelineFormatter(metric: TimelineMetric, value: number): string {
  if (metric === 'maxWeight') return `Max ${value} kg`;
  if (metric === 'totalVolume') return `Volume ${value} kg`;
  if (metric === 'totalReps') return `${value} reps`;
  return `${value} sets`;
}

export default function GymTracker() {
  const [currentUserId, setCurrentUserId] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSet, setSavingSet] = useState(false);
  const [savingExercise, setSavingExercise] = useState(false);

  const [exerciseScope, setExerciseScope] = useState<ExerciseScope>('all');
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [setRows, setSetRows] = useState<{ reps: string; weight_kg: string }[]>([{ reps: '', weight_kg: '' }]);
  const [notes, setNotes] = useState('');

  const [showExerciseForm, setShowExerciseForm] = useState(false);
  const [exerciseForm, setExerciseForm] = useState(DEFAULT_EXERCISE_FORM);

  const [range, setRange] = useState(30);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [timelineMetric, setTimelineMetric] = useState<TimelineMetric>('maxWeight');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [showMovingAverage, setShowMovingAverage] = useState(true);
  const [movingAverageWindow, setMovingAverageWindow] = useState(3);
  const [selectedTimelineExercise, setSelectedTimelineExercise] = useState('');

  async function loadGymData() {
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
      .order('date', { ascending: true });

    setAllExercises((exercises || []) as Exercise[]);
    setWorkoutLogs(
      ((logs || []) as (WorkoutLog & { set_rows: unknown })[]).map((log) => ({
        ...log,
        set_rows: parseSetRows(log.set_rows),
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    loadGymData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const timelineData = useMemo(() => {
    const grouped = new Map<string, WorkoutLog[]>();
    let startDate: string;
    let endDate: string;
    if (useCustomRange && customStart && customEnd) {
      startDate = customStart;
      endDate = customEnd;
      if (isAfter(parseISO(startDate), parseISO(endDate))) {
        [startDate, endDate] = [endDate, startDate];
      }
    } else {
      startDate = format(subDays(new Date(), range - 1), 'yyyy-MM-dd');
      endDate = format(new Date(), 'yyyy-MM-dd');
    }

    const inRange = workoutLogs.filter((log) => log.date >= startDate && log.date <= endDate);
    for (const log of inRange) {
      const key = log.exercise?.name || 'Unknown';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(log);
    }

    const dataByExercise: Record<string, {
      date: string;
      metric: number;
      movingAverage: number | null;
      label: string;
    }[]> = {};

    grouped.forEach((logs, exerciseName) => {
      const byDate = new Map<string, number>();
      for (const log of logs) {
        const sets = log.set_rows || [];
        const totalReps = sets.reduce((sum, setRow) => sum + setRow.reps, 0);
        const totalVolume = sets.reduce((sum, setRow) => sum + (setRow.reps * setRow.weight_kg), 0);
        const maxWeight = sets.reduce((max, setRow) => Math.max(max, setRow.weight_kg), 0);
        const value = timelineMetric === 'maxWeight'
          ? maxWeight
          : timelineMetric === 'totalVolume'
            ? totalVolume
            : timelineMetric === 'totalReps'
              ? totalReps
              : sets.length;
        byDate.set(log.date, (byDate.get(log.date) || 0) + value);
      }

      const points: { date: string; metric: number; movingAverage: number | null; label: string }[] = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, metric]) => ({ date, metric, movingAverage: null, label: exerciseName }));

      if (showMovingAverage && movingAverageWindow > 1) {
        points.forEach((point, i) => {
          const start = Math.max(0, i - movingAverageWindow + 1);
          const window = points.slice(start, i + 1);
          const average = window.reduce((sum, item) => sum + item.metric, 0) / window.length;
          point.movingAverage = Math.round(average * 10) / 10;
        });
      }

      dataByExercise[exerciseName] = points;
    });

    return dataByExercise;
  }, [
    workoutLogs,
    range,
    useCustomRange,
    customStart,
    customEnd,
    timelineMetric,
    showMovingAverage,
    movingAverageWindow,
  ]);

  const timelineExercises = Object.keys(timelineData);
  const activeTimelineExercise = timelineExercises.includes(selectedTimelineExercise)
    ? selectedTimelineExercise
    : timelineExercises[0] || '';
  const timelinePoints = activeTimelineExercise ? timelineData[activeTimelineExercise] : [];

  useEffect(() => {
    if (!timelineExercises.length) {
      setSelectedTimelineExercise('');
      return;
    }
    if (!timelineExercises.includes(selectedTimelineExercise)) {
      setSelectedTimelineExercise(timelineExercises[0]);
    }
  }, [timelineExercises, selectedTimelineExercise]);

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
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-red-100 bg-gradient-to-r from-red-50 to-rose-50 p-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-red-600 flex items-center justify-center">
            <Dumbbell className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GymTracker</h1>
            <p className="text-sm text-red-700">Track sets, reps, weight, and progress in your gym world.</p>
          </div>
        </div>
      </div>

      <Card title="Workout Day">
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

      <Card title="Progress Dashboard">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 font-medium mb-1">Range presets</p>
              <div className="flex gap-2 flex-wrap">
                {RANGE_PRESETS.map(({ label, days }) => (
                  <button
                    key={days}
                    onClick={() => { setRange(days); setUseCustomRange(false); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      !useCustomRange && range === days
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => {
                    if (!useCustomRange) {
                      setCustomEnd(format(new Date(), 'yyyy-MM-dd'));
                      setCustomStart(format(subDays(new Date(), range - 1), 'yyyy-MM-dd'));
                    }
                    setUseCustomRange((prev) => !prev);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    useCustomRange
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                  }`}
                >
                  Custom
                </button>
              </div>
            </div>

            {useCustomRange && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Start"
                  type="date"
                  value={customStart}
                  max={customEnd || undefined}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
                <Input
                  label="End"
                  type="date"
                  value={customEnd}
                  min={customStart}
                  max={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium">Metric</label>
              <select
                value={timelineMetric}
                onChange={(e) => setTimelineMetric(e.target.value as TimelineMetric)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 border-gray-300 focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none"
              >
                <option value="maxWeight">Max Weight</option>
                <option value="totalVolume">Total Volume</option>
                <option value="totalReps">Total Reps</option>
                <option value="sets">Sets</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Chart type</label>
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => setChartType('line')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border inline-flex items-center gap-1 ${
                    chartType === 'line'
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                  }`}
                >
                  <LineChartIcon className="w-3.5 h-3.5" />
                  Line
                </button>
                <button
                  onClick={() => setChartType('bar')}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border inline-flex items-center gap-1 ${
                    chartType === 'bar'
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Bar
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Moving average</label>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showMovingAverage}
                  onChange={(e) => setShowMovingAverage(e.target.checked)}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                <span className="text-sm text-gray-700">Enabled</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium">Average window (sessions)</label>
              <input
                type="number"
                min={MIN_MOVING_AVERAGE_WINDOW}
                max={MAX_MOVING_AVERAGE_WINDOW}
                step="1"
                value={movingAverageWindow}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  if (Number.isNaN(parsed)) {
                    setMovingAverageWindow(MIN_MOVING_AVERAGE_WINDOW);
                    return;
                  }
                  setMovingAverageWindow(
                    Math.max(MIN_MOVING_AVERAGE_WINDOW, Math.min(MAX_MOVING_AVERAGE_WINDOW, parsed))
                  );
                }}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm text-gray-900 border-gray-300 focus:border-red-500 focus:ring-2 focus:ring-red-200 outline-none"
              />
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 font-medium mb-2">Exercise timeline</p>
            {timelineExercises.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {timelineExercises.map((name) => (
                  <button
                    key={name}
                    onClick={() => setSelectedTimelineExercise(name)}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      name === activeTimelineExercise ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No timeline data yet. Start logging workouts above.</p>
            )}
          </div>

          <div className="h-64">
            {loading ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-500">Loading workout data...</div>
            ) : timelinePoints.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-500">
                No timeline points available for current filters.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'line' ? (
                  <LineChart data={timelinePoints} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#fee2e2" />
                    <XAxis dataKey="date" tickFormatter={(v) => format(parseISO(v), 'MMM d')} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      labelFormatter={(l) => format(parseISO(l as string), 'MMM d, yyyy')}
                      formatter={(v, name) =>
                        name === 'movingAverage'
                          ? [`${v}`, 'Moving Avg']
                          : [timelineFormatter(timelineMetric, Number(v)), 'Value']
                      }
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="metric"
                      stroke="#dc2626"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#dc2626' }}
                      activeDot={{ r: 5 }}
                      name="Progress"
                    />
                    {showMovingAverage && (
                      <Line
                        type="monotone"
                        dataKey="movingAverage"
                        stroke="#fb7185"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        dot={false}
                        name="Moving Avg"
                      />
                    )}
                  </LineChart>
                ) : (
                  <BarChart data={timelinePoints} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#fee2e2" />
                    <XAxis dataKey="date" tickFormatter={(v) => format(parseISO(v), 'MMM d')} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      labelFormatter={(l) => format(parseISO(l as string), 'MMM d, yyyy')}
                      formatter={(v) => [timelineFormatter(timelineMetric, Number(v)), 'Value']}
                    />
                    <Bar dataKey="metric" fill="#dc2626" radius={[4, 4, 0, 0]} name="Progress" />
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-xl border border-red-100 bg-red-50 p-3">
            <div className="flex items-center gap-2 text-red-700">
              <TrendingUp className="w-4 h-4" />
              <p className="text-sm font-medium">Live chart customization active</p>
            </div>
            <p className="text-xs text-red-700/90 mt-1">
              Adjust metric, chart type, and moving average controls to customize diagrams in real time.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
