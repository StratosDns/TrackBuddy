'use client';

import { useEffect, useMemo, useState } from 'react';
import { format, parseISO, subDays, isAfter } from 'date-fns';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Legend
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { WorkoutLog, WorkoutSetRow } from '@/lib/types';
import Card from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { TrendingUp, LineChart as LineChartIcon, BarChart3 } from 'lucide-react';

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

export default function GymDashboard({ viewerId }: { viewerId?: string }) {
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [range, setRange] = useState(30);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [timelineMetric, setTimelineMetric] = useState<TimelineMetric>('maxWeight');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [showMovingAverage, setShowMovingAverage] = useState(true);
  const [movingAverageWindow, setMovingAverageWindow] = useState(3);
  const [selectedTimelineExercise, setSelectedTimelineExercise] = useState('');

  useEffect(() => {
    async function loadGymData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const targetUserId = viewerId || user.id;
      const { data: logs } = await supabase
        .from('workout_logs')
        .select('*, exercise:exercises(*)')
        .eq('user_id', targetUserId)
        .order('date', { ascending: true });

      setWorkoutLogs(
        ((logs || []) as (WorkoutLog & { set_rows: unknown })[]).map((log) => ({
          ...log,
          set_rows: parseSetRows(log.set_rows),
        }))
      );
      setLoading(false);
    }

    loadGymData();
  }, [viewerId]);

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

      const points: { date: string; metric: number; movingAverage: number | null }[] = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, metric]) => ({ date, metric, movingAverage: null }));

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

  const today = format(new Date(), 'yyyy-MM-dd');
  const dayLogs = workoutLogs.filter((log) => log.date === today);
  const totalSetsToday = dayLogs.reduce((sum, log) => sum + log.set_rows.length, 0);
  const totalRepsToday = dayLogs.reduce((sum, log) => sum + log.set_rows.reduce((s, setRow) => s + setRow.reps, 0), 0);
  const totalVolumeToday = dayLogs.reduce(
    (sum, log) => sum + log.set_rows.reduce((s, setRow) => s + (setRow.reps * setRow.weight_kg), 0),
    0
  );

  return (
    <Card title="Gym Dashboard">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-xl bg-red-50 border border-red-100 p-3">
            <p className="text-xs text-red-700 font-medium">Today Sets</p>
            <p className="text-2xl font-bold text-red-600">{totalSetsToday}</p>
          </div>
          <div className="rounded-xl bg-red-50 border border-red-100 p-3">
            <p className="text-xs text-red-700 font-medium">Today Reps</p>
            <p className="text-2xl font-bold text-red-600">{totalRepsToday}</p>
          </div>
          <div className="rounded-xl bg-red-50 border border-red-100 p-3">
            <p className="text-xs text-red-700 font-medium">Today Volume</p>
            <p className="text-2xl font-bold text-red-600">{Math.round(totalVolumeToday)} kg</p>
          </div>
        </div>

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
                  onClick={() => setSelectedTimelineExercise(name === selectedTimelineExercise ? '' : name)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    name === activeTimelineExercise ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No timeline data yet. Start logging workouts on the Today tab.</p>
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
            <p className="text-sm font-medium">Gym dashboard is now profile-only</p>
          </div>
          <p className="text-xs text-red-700/90 mt-1">
            This graphical dashboard is visible only in Profile while in gym mode.
          </p>
        </div>
      </div>
    </Card>
  );
}
