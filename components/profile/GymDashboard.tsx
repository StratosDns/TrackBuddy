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
import { TrendingUp, LineChart as LineChartIcon, BarChart3, Pencil, X, Plus } from 'lucide-react';

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
const GYM_DIAGRAM_STORAGE_PREFIX = 'tb_gym_diagrams_';
const CHART_STYLE_LABELS: Record<ChartType, string> = {
  line: 'Line',
  bar: 'Bar',
};
const METRIC_LABELS: Record<TimelineMetric, string> = {
  maxWeight: 'Max Weight',
  totalVolume: 'Total Volume',
  totalReps: 'Total Reps',
  sets: 'Sets',
};
const VALID_METRICS = new Set<TimelineMetric>(Object.keys(METRIC_LABELS) as TimelineMetric[]);
const VALID_CHART_STYLES = new Set<ChartType>(Object.keys(CHART_STYLE_LABELS) as ChartType[]);
const SUMMARY_CARD_CLASS = 'rounded-2xl bg-gradient-to-br from-red-50 to-red-100/60 border border-red-100 p-3 shadow-sm';
const DEFAULT_TIMELINE_METRIC: TimelineMetric = 'maxWeight';
const DEFAULT_CHART_TYPE: ChartType = 'line';

interface GymDiagramConfig {
  id: string;
  exerciseName: string;
  metric: TimelineMetric;
  style: ChartType;
  axisDomain?: { min?: number; max?: number };
}

function normalizeAxisValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseAxisInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function generateDiagramId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `gym-diagram-${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}`;
}

function createUniqueDiagramId(existingIds: Set<string>): string {
  let id = generateDiagramId();
  let attempts = 0;
  while (existingIds.has(id) && attempts < 5) {
    id = generateDiagramId();
    attempts += 1;
  }
  if (existingIds.has(id)) {
    throw new Error('Unable to generate unique gym diagram ID');
  }
  return id;
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

function timelineFormatter(metric: TimelineMetric, value: number): string {
  if (metric === 'maxWeight') return `Max ${value} kg`;
  if (metric === 'totalVolume') return `Volume ${value} kg`;
  if (metric === 'totalReps') return `${value} reps`;
  return `${value} sets`;
}

export default function GymDashboard({ targetUserId }: { targetUserId?: string }) {
  const storageKey = `${GYM_DIAGRAM_STORAGE_PREFIX}${targetUserId || 'self'}`;
  const [workoutLogs, setWorkoutLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);

  const [range, setRange] = useState(30);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showMovingAverage, setShowMovingAverage] = useState(true);
  const [movingAverageWindow, setMovingAverageWindow] = useState(3);
  const [diagramConfigs, setDiagramConfigs] = useState<GymDiagramConfig[]>(() => {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as GymDiagramConfig[];
      return (parsed || []).filter((diagram) => (
        Boolean(diagram.id)
        && Boolean(diagram.exerciseName)
        && VALID_METRICS.has(diagram.metric)
        && VALID_CHART_STYLES.has(diagram.style)
      )).map((diagram) => ({
        ...diagram,
        axisDomain: {
          min: normalizeAxisValue(diagram.axisDomain?.min),
          max: normalizeAxisValue(diagram.axisDomain?.max),
        },
      }));
    } catch {
      return [];
    }
  });
  const [showDiagramPicker, setShowDiagramPicker] = useState(false);
  const [editingDiagramId, setEditingDiagramId] = useState<string | null>(null);
  const [pendingExercise, setPendingExercise] = useState('');
  const [pendingMetric, setPendingMetric] = useState<TimelineMetric>(DEFAULT_TIMELINE_METRIC);
  const [pendingStyle, setPendingStyle] = useState<ChartType>(DEFAULT_CHART_TYPE);
  const [pendingAxisMin, setPendingAxisMin] = useState('');
  const [pendingAxisMax, setPendingAxisMax] = useState('');

  useEffect(() => {
    async function loadGymData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const userId = targetUserId || user.id;
      const { data: logs } = await supabase
        .from('workout_logs')
        .select('*, exercise:exercises(*)')
        .eq('user_id', userId)
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
  }, [targetUserId]);

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
      maxWeight: number;
      totalVolume: number;
      totalReps: number;
      sets: number;
    }[]> = {};

    grouped.forEach((logs, exerciseName) => {
      const byDate = new Map<string, {
        maxWeight: number;
        totalVolume: number;
        totalReps: number;
        sets: number;
      }>();
      for (const log of logs) {
        const sets = log.set_rows || [];
        const totalReps = sets.reduce((sum, setRow) => sum + setRow.reps, 0);
        const totalVolume = sets.reduce((sum, setRow) => sum + (setRow.reps * setRow.weight_kg), 0);
        const maxWeight = sets.reduce((max, setRow) => Math.max(max, setRow.weight_kg), 0);
        const previous = byDate.get(log.date) || {
          maxWeight: 0,
          totalVolume: 0,
          totalReps: 0,
          sets: 0,
        };
        byDate.set(log.date, {
          maxWeight: Math.max(previous.maxWeight, maxWeight),
          totalVolume: previous.totalVolume + totalVolume,
          totalReps: previous.totalReps + totalReps,
          sets: previous.sets + sets.length,
        });
      }

      const points: {
        date: string;
        maxWeight: number;
        totalVolume: number;
        totalReps: number;
        sets: number;
      }[] = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, values]) => ({ date, ...values }));

      dataByExercise[exerciseName] = points;
    });

    return dataByExercise;
  }, [
    workoutLogs,
    range,
    useCustomRange,
    customStart,
    customEnd,
  ]);

  const timelineExercises = Object.keys(timelineData);
  const defaultExercise = timelineExercises[0] || '';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (diagramConfigs.length === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, JSON.stringify(diagramConfigs));
  }, [diagramConfigs, storageKey]);

  function resetDiagramPicker() {
    setEditingDiagramId(null);
    setPendingExercise(defaultExercise);
    setPendingMetric(DEFAULT_TIMELINE_METRIC);
    setPendingStyle(DEFAULT_CHART_TYPE);
    setPendingAxisMin('');
    setPendingAxisMax('');
    setShowDiagramPicker(false);
  }

  function openNewDiagramPicker() {
    setEditingDiagramId(null);
    setPendingExercise(defaultExercise);
    setPendingMetric(DEFAULT_TIMELINE_METRIC);
    setPendingStyle(DEFAULT_CHART_TYPE);
    setPendingAxisMin('');
    setPendingAxisMax('');
    setShowDiagramPicker(true);
  }

  function editDiagram(diagram: GymDiagramConfig) {
    setEditingDiagramId(diagram.id);
    setPendingExercise(diagram.exerciseName);
    setPendingMetric(diagram.metric);
    setPendingStyle(diagram.style);
    setPendingAxisMin(
      typeof diagram.axisDomain?.min === 'number' ? String(diagram.axisDomain.min) : ''
    );
    setPendingAxisMax(
      typeof diagram.axisDomain?.max === 'number' ? String(diagram.axisDomain.max) : ''
    );
    setShowDiagramPicker(true);
  }

  function saveDiagram() {
    if (!pendingExercise) return;
    let axisMin = parseAxisInput(pendingAxisMin);
    let axisMax = parseAxisInput(pendingAxisMax);
    if (axisMin !== null && axisMax !== null && axisMin > axisMax) {
      [axisMin, axisMax] = [axisMax, axisMin];
    }
    const axisDomain = {
      min: axisMin ?? undefined,
      max: axisMax ?? undefined,
    };
    if (editingDiagramId) {
      setDiagramConfigs((prev) => prev.map((diagram) => (
        diagram.id === editingDiagramId
          ? { ...diagram, exerciseName: pendingExercise, metric: pendingMetric, style: pendingStyle, axisDomain }
          : diagram
      )));
      resetDiagramPicker();
      return;
    }
    setDiagramConfigs((prev) => [...prev, {
      id: createUniqueDiagramId(new Set(prev.map((diagram) => diagram.id))),
      exerciseName: pendingExercise,
      metric: pendingMetric,
      style: pendingStyle,
      axisDomain,
    }]);
    resetDiagramPicker();
  }

  function removeDiagram(id: string) {
    setDiagramConfigs((prev) => prev.filter((diagram) => diagram.id !== id));
    if (editingDiagramId === id) {
      resetDiagramPicker();
    }
  }

  function getDiagramPoints(exerciseName: string, metric: TimelineMetric) {
    const basePoints = timelineData[exerciseName] || [];
    const points = basePoints.map((point) => ({
      date: point.date,
      metric: point[metric],
      movingAverage: null as number | null,
    }));
    if (showMovingAverage && movingAverageWindow > 1) {
      points.forEach((point, i) => {
        const start = Math.max(0, i - movingAverageWindow + 1);
        const window = points.slice(start, i + 1);
        const average = window.reduce((sum, item) => sum + item.metric, 0) / window.length;
        point.movingAverage = Math.round(average * 10) / 10;
      });
    }
    return points;
  }

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
          <div className={SUMMARY_CARD_CLASS}>
            <p className="text-xs text-red-700 font-medium">Today Sets</p>
            <p className="text-2xl font-bold text-red-600">{totalSetsToday}</p>
          </div>
          <div className={SUMMARY_CARD_CLASS}>
            <p className="text-xs text-red-700 font-medium">Today Reps</p>
            <p className="text-2xl font-bold text-red-600">{totalRepsToday}</p>
          </div>
          <div className={SUMMARY_CARD_CLASS}>
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border shadow-sm transition-all ${
                    !useCustomRange && range === days
                      ? 'bg-red-600 text-white border-red-600 shadow-red-200'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:-translate-y-0.5'
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
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border shadow-sm transition-all ${
                  useCustomRange
                    ? 'bg-red-600 text-white border-red-600 shadow-red-200'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:-translate-y-0.5'
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

        <Card title="Diagrams">
          <div className="flex flex-col gap-4">
            {loading ? (
              <div className="flex items-center justify-center h-40 text-sm text-gray-500">
                Loading workout data...
              </div>
            ) : timelineExercises.length === 0 ? (
              <p className="text-sm text-gray-500">No timeline data yet. Start logging workouts on the Today tab.</p>
            ) : (
              <>
                {diagramConfigs.map((diagram) => {
                  const diagramPoints = getDiagramPoints(diagram.exerciseName, diagram.metric);
                  const yAxisDomain: [number | 'auto', number | 'auto'] = [
                    typeof diagram.axisDomain?.min === 'number' ? diagram.axisDomain.min : 'auto',
                    typeof diagram.axisDomain?.max === 'number' ? diagram.axisDomain.max : 'auto',
                  ];
                  const lineSeriesCount = showMovingAverage ? 2 : 1;
                  return (
                    <div key={diagram.id} className="border border-gray-100 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="flex flex-wrap gap-2">
                          <span className="px-2.5 py-1 text-xs rounded-full border border-red-200 text-red-700 bg-red-50">
                            {diagram.exerciseName}
                          </span>
                          <span className="px-2.5 py-1 text-xs rounded-full border border-gray-200 text-gray-700 bg-gray-50">
                            {METRIC_LABELS[diagram.metric]}
                          </span>
                          <span className="px-2.5 py-1 text-xs rounded-full border border-gray-200 text-gray-500 bg-white">
                            {CHART_STYLE_LABELS[diagram.style]}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => editDiagram(diagram)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            aria-label="Edit diagram"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeDiagram(diagram.id)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            aria-label="Remove diagram"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="h-64">
                        {diagramPoints.length === 0 ? (
                          <div className="flex items-center justify-center h-full text-sm text-gray-500">
                            No timeline points available for current filters.
                          </div>
                        ) : (
                          <ResponsiveContainer width="100%" height="100%">
                            {diagram.style === 'line' ? (
                                <LineChart data={diagramPoints} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#fee2e2" />
                                  <XAxis dataKey="date" tickFormatter={(v) => format(parseISO(v), 'MMM d')} tick={{ fontSize: 11 }} />
                                  <YAxis tick={{ fontSize: 11 }} domain={yAxisDomain} />
                                <Tooltip
                                  labelFormatter={(l) => format(parseISO(l as string), 'MMM d, yyyy')}
                                  formatter={(v, name) =>
                                    name === 'movingAverage'
                                      ? [`${v}`, 'Moving Avg']
                                      : [timelineFormatter(diagram.metric, Number(v)), 'Value']
                                  }
                                />
                                  {lineSeriesCount > 1 && <Legend />}
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
                                <BarChart data={diagramPoints} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#fee2e2" />
                                  <XAxis dataKey="date" tickFormatter={(v) => format(parseISO(v), 'MMM d')} tick={{ fontSize: 11 }} />
                                  <YAxis tick={{ fontSize: 11 }} domain={yAxisDomain} />
                                <Tooltip
                                  labelFormatter={(l) => format(parseISO(l as string), 'MMM d, yyyy')}
                                  formatter={(v) => [timelineFormatter(diagram.metric, Number(v)), 'Value']}
                                />
                                <Bar dataKey="metric" fill="#dc2626" radius={[4, 4, 0, 0]} name="Progress" />
                              </BarChart>
                            )}
                          </ResponsiveContainer>
                        )}
                      </div>
                    </div>
                  );
                })}

                <button
                  onClick={openNewDiagramPicker}
                  aria-label="Add gym diagram"
                  className="w-full h-24 rounded-2xl border-2 border-dashed border-red-200 bg-red-50/80 hover:bg-red-50 transition-colors flex items-center justify-center text-red-400"
                >
                  <Plus className="w-7 h-7" />
                </button>
              </>
            )}
          </div>
        </Card>

        {showDiagramPicker && (
          <div
            className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingDiagramId ? 'Edit Diagram' : 'Add Diagram'}
                </h3>
                <button
                  onClick={resetDiagramPicker}
                  className="p-1 rounded text-gray-400 hover:bg-gray-100"
                  aria-label="Close diagram picker"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Exercise</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-auto pr-1">
                  {timelineExercises.map((exercise) => (
                    <button
                      key={exercise}
                      onClick={() => setPendingExercise(exercise)}
                      className={`px-3 py-2 text-sm rounded-xl border shadow-sm transition-all text-left ${
                        pendingExercise === exercise
                          ? 'bg-red-600 text-white border-red-600 shadow-red-200'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-red-300 hover:-translate-y-0.5'
                      }`}
                    >
                      {exercise}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Metric</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(METRIC_LABELS) as TimelineMetric[]).map((metric) => (
                    <button
                      key={metric}
                      onClick={() => setPendingMetric(metric)}
                      className={`px-3 py-2 text-sm rounded-xl border shadow-sm transition-all text-left ${
                        pendingMetric === metric
                          ? 'bg-red-600 text-white border-red-600 shadow-red-200'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-red-300 hover:-translate-y-0.5'
                      }`}
                    >
                      {METRIC_LABELS[metric]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <p className="text-sm font-medium text-gray-700 mb-2">Chart type</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPendingStyle('line')}
                    className={`px-3 py-2 text-sm rounded-xl border shadow-sm transition-all inline-flex items-center gap-1.5 ${
                      pendingStyle === 'line'
                        ? 'bg-red-600 text-white border-red-600 shadow-red-200'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-red-300 hover:-translate-y-0.5'
                    }`}
                  >
                    <LineChartIcon className="w-4 h-4" />
                    Line
                  </button>
                  <button
                    onClick={() => setPendingStyle('bar')}
                    className={`px-3 py-2 text-sm rounded-xl border shadow-sm transition-all inline-flex items-center gap-1.5 ${
                      pendingStyle === 'bar'
                        ? 'bg-red-600 text-white border-red-600 shadow-red-200'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-red-300 hover:-translate-y-0.5'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    Bar
                  </button>
                </div>
              </div>

              <div className="mb-5">
                <p className="text-sm font-medium text-gray-700 mb-2">Y-axis range (optional)</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50">
                    <span className="text-sm text-gray-700">Min</span>
                    <input
                      type="number"
                      value={pendingAxisMin}
                      onChange={(e) => setPendingAxisMin(e.target.value)}
                      className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white"
                      placeholder="auto"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50">
                    <span className="text-sm text-gray-700">Max</span>
                    <input
                      type="number"
                      value={pendingAxisMax}
                      onChange={(e) => setPendingAxisMax(e.target.value)}
                      className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white"
                      placeholder="auto"
                    />
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={resetDiagramPicker}
                  className="px-4 py-2 text-sm rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={saveDiagram}
                  disabled={!pendingExercise}
                  className="px-4 py-2 text-sm rounded-xl border border-red-600 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editingDiagramId ? 'Save Diagram' : 'Add Diagram'}
                </button>
              </div>
            </div>
          </div>
        )}

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
