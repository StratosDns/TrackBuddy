'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { subDays, format, parseISO, isAfter } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { Food, FoodLog, WeightLog, WaterLog, Profile, calcMacros, sumMacros, ZERO_MACROS } from '@/lib/types';
import Card from '@/components/ui/Card';
import {
  CustomDiagramChart,
  DiagramMetric,
  DiagramStyle,
  DIAGRAM_METRIC_META,
  DiagramChartDataPoint,
} from '@/components/profile/Charts';
import GymDashboard from '@/components/profile/GymDashboard';
import { User, Pencil, Check, X, Plus } from 'lucide-react';

const RANGES = [
  { label: '7 Days', days: 7 },
  { label: '14 Days', days: 14 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
];

interface ProfilePageClientProps {
  mode: 'diet' | 'gym';
}

interface DiagramConfig {
  id: string;
  metrics: DiagramMetric[];
  style: DiagramStyle;
}

const DIAGRAM_METRICS: DiagramMetric[] = ['calories', 'water', 'weight', 'carbs', 'fats', 'protein'];
const DIAGRAM_STYLES: DiagramStyle[] = ['bar', 'line', 'area', 'stackedBar', 'stepLine'];
const DIAGRAM_STYLE_LABELS: Record<DiagramStyle, string> = {
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
  stackedBar: 'Stacked Bar',
  stepLine: 'Step Line',
};

interface DiagramConfigRow {
  id: string;
  metrics: string[];
  style: string;
}

export default function ProfilePageClient({ mode }: ProfilePageClientProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Date range state
  const [range, setRange] = useState(30);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Chart data
  const [weightData, setWeightData] = useState<{ date: string; weight: number }[]>([]);
  const [waterData, setWaterData] = useState<{ date: string; water: number }[]>([]);
  const [macroData, setMacroData] = useState<{
    date: string; calories: number; protein: number; carbs: number; fats: number;
  }[]>([]);

  const [diagramConfigs, setDiagramConfigs] = useState<DiagramConfig[]>([]);
  const [showDiagramPicker, setShowDiagramPicker] = useState(false);
  const [pendingMetrics, setPendingMetrics] = useState<DiagramMetric[]>([]);
  const [pendingStyle, setPendingStyle] = useState<DiagramStyle>('bar');
  const [editingDiagramId, setEditingDiagramId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const resetDiagramPicker = useCallback(() => {
    setPendingMetrics([]);
    setPendingStyle('bar');
    setEditingDiagramId(null);
    setShowDiagramPicker(false);
  }, []);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    setEmail(user.email || '');

    // Fetch or create profile (DB trigger should handle creation on signup;
    // this upsert is a fallback for users who signed up before the trigger existed)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!profileData) {
      // Fallback: create profile if trigger didn't run (existing users)
      const emailPrefix = user.email?.split('@')[0] ?? 'user';
      const randomSuffix = Math.random().toString(36).slice(2, 10);
      const { data: newProfile } = await supabase
        .from('profiles')
        .insert({ id: user.id, username: `${emailPrefix}_${randomSuffix}`, display_name: emailPrefix })
        .select()
        .single();
      setProfile(newProfile);
      setDraftName(newProfile?.display_name ?? '');
    } else {
      setProfile(profileData);
      setDraftName(profileData.display_name);
    }

    let startDate: string;
    let endDate: string;
    if (useCustomRange && customStart && customEnd) {
      startDate = customStart;
      endDate = customEnd;
      // Validate order
      if (isAfter(parseISO(startDate), parseISO(endDate))) {
        [startDate, endDate] = [endDate, startDate];
      }
    } else {
      startDate = format(subDays(new Date(), range - 1), 'yyyy-MM-dd');
      endDate = format(new Date(), 'yyyy-MM-dd');
    }

    const [logsRes, weightsRes, waterRes, diagramsRes] = await Promise.all([
      supabase
        .from('food_logs')
        .select('*, food:foods(*)')
        .eq('user_id', user.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date'),
      supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date'),
      supabase
        .from('water_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date'),
      supabase
        .from('diagram_configs')
        .select('id, metrics, style')
        .eq('user_id', user.id)
        .order('created_at'),
    ]);

    const validMetrics = new Set<DiagramMetric>(DIAGRAM_METRICS);
    const validStyles = new Set<DiagramStyle>(DIAGRAM_STYLES);
    const diagramRows: DiagramConfigRow[] = diagramsRes.data || [];
    const normalizedDiagrams: DiagramConfig[] = diagramRows
      .map((row) => ({
        id: row.id,
        metrics: (row.metrics || []).filter((metric): metric is DiagramMetric => validMetrics.has(metric as DiagramMetric)),
        style: validStyles.has(row.style as DiagramStyle) ? (row.style as DiagramStyle) : 'bar',
      }))
      .filter((row) => row.metrics.length > 0);
    setDiagramConfigs(normalizedDiagrams);

    const weights: WeightLog[] = weightsRes.data || [];
    setWeightData(weights.map((w) => ({ date: w.date, weight: w.weight_kg })));
    const waters: WaterLog[] = waterRes.data || [];
    setWaterData(waters.map((w) => ({ date: w.date, water: w.water_ml / 1000 })));

    if (mode === 'gym') {
      setMacroData([]);
      setWeightData([]);
      setWaterData([]);
      return;
    }

    const logs: (FoodLog & { food: Food })[] = logsRes.data || [];
    const byDay: Record<string, { calories: number; protein: number; carbs: number; fats: number }> = {};

    for (const log of logs) {
      if (!log.food) continue;
      if (!byDay[log.date]) byDay[log.date] = { ...ZERO_MACROS };
      byDay[log.date] = sumMacros(byDay[log.date], calcMacros(log.food, log.amount_g));
    }

    const macros = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, m]) => ({ date, ...m }));

    setMacroData(macros);
  }, [range, useCustomRange, customStart, customEnd, mode]);

  useEffect(() => { loadData(); }, [loadData]);

  async function saveDisplayName() {
    if (!profile) return;
    setSavingName(true);
    const supabase = createClient();
    await supabase.from('profiles').update({ display_name: draftName }).eq('id', profile.id);
    setProfile((prev) => prev ? { ...prev, display_name: draftName } : prev);
    setSavingName(false);
    setEditingName(false);
  }

  // When switching to custom range, pre-fill with current preset
  function handleCustomRangeToggle() {
    if (!useCustomRange) {
      setCustomEnd(format(new Date(), 'yyyy-MM-dd'));
      setCustomStart(format(subDays(new Date(), range - 1), 'yyyy-MM-dd'));
    }
    setUseCustomRange((v) => !v);
  }

  const today = format(new Date(), 'yyyy-MM-dd');

  const diagramData = useMemo<DiagramChartDataPoint[]>(() => {
    const byDate: Record<string, DiagramChartDataPoint> = {};

    for (const point of macroData) {
      byDate[point.date] = {
        ...(byDate[point.date] || { date: point.date }),
        calories: point.calories,
        protein: point.protein,
        carbs: point.carbs,
        fats: point.fats,
      };
    }

    for (const point of weightData) {
      byDate[point.date] = {
        ...(byDate[point.date] || { date: point.date }),
        weight: point.weight,
      };
    }

    for (const point of waterData) {
      byDate[point.date] = {
        ...(byDate[point.date] || { date: point.date }),
        water: point.water,
      };
    }

    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  }, [macroData, weightData, waterData]);

  function togglePendingMetric(metric: DiagramMetric) {
    setPendingMetrics((prev) => (
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    ));
  }

  async function addDiagram() {
    if (pendingMetrics.length === 0) return;
    if (!currentUserId) return;

    const supabase = createClient();

    if (editingDiagramId) {
      const { error } = await supabase
        .from('diagram_configs')
        .update({
          metrics: [...pendingMetrics],
          style: pendingStyle,
        })
        .eq('id', editingDiagramId)
        .eq('user_id', currentUserId);

      if (error) return;

      setDiagramConfigs((prev) => prev.map((diagram) => (
        diagram.id === editingDiagramId
          ? { ...diagram, metrics: [...pendingMetrics], style: pendingStyle }
          : diagram
      )));
      resetDiagramPicker();
      return;
    }

    const { data, error } = await supabase
      .from('diagram_configs')
      .insert({
        user_id: currentUserId,
        metrics: [...pendingMetrics],
        style: pendingStyle,
      })
      .select('id')
      .single();

    if (error || !data) return;

    setDiagramConfigs((prev) => [
      ...prev,
      {
        id: data.id,
        metrics: [...pendingMetrics],
        style: pendingStyle,
      },
    ]);
    resetDiagramPicker();
  }

  async function removeDiagram(id: string) {
    if (!currentUserId) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('diagram_configs')
      .delete()
      .eq('id', id)
      .eq('user_id', currentUserId);
    if (error) return;

    setDiagramConfigs((prev) => prev.filter((diagram) => diagram.id !== id));
    if (editingDiagramId === id) {
      resetDiagramPicker();
    }
  }

  function editDiagram(diagram: DiagramConfig) {
    setEditingDiagramId(diagram.id);
    setPendingMetrics([...diagram.metrics]);
    setPendingStyle(diagram.style);
    setShowDiagramPicker(true);
  }

  function openNewDiagramPicker() {
    setEditingDiagramId(null);
    setPendingMetrics([]);
    setPendingStyle('bar');
    setShowDiagramPicker(true);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Profile header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
          <User className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="text-xl font-bold text-gray-900 border-b border-green-500 outline-none bg-transparent"
                />
                <button
                  onClick={saveDisplayName}
                  disabled={savingName}
                  className="p-1 rounded text-green-600 hover:bg-green-50"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setEditingName(false); setDraftName(profile?.display_name ?? ''); }}
                  className="p-1 rounded text-gray-400 hover:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-gray-900">
                  {profile?.display_name || profile?.username || 'Profile'}
                </h1>
                <button
                  onClick={() => setEditingName(true)}
                  className="p-1 rounded text-gray-400 hover:text-green-600 hover:bg-green-50"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {profile?.username && <span className="mr-2">@{profile.username}</span>}
            {email}
          </p>
        </div>
      </div>

      {mode === 'gym' ? (
        <GymDashboard />
      ) : (
        <>
          {/* Date range controls */}
          <div className="flex flex-col gap-3">
            <div className="flex gap-2 flex-wrap items-center">
              {!useCustomRange && RANGES.map(({ label, days }) => (
                <button
                  key={days}
                  onClick={() => setRange(days)}
                  className={`px-4 py-1.5 text-sm rounded-full font-medium border transition-colors
                    ${range === days
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
                    }`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={handleCustomRangeToggle}
                className={`px-4 py-1.5 text-sm rounded-full font-medium border transition-colors
                  ${useCustomRange
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-400'
                  }`}
              >
                Custom Range
              </button>
            </div>

            {useCustomRange && (
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500 font-medium">Start date</label>
                  <input
                    type="date"
                    value={customStart}
                    max={customEnd || today}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-500 font-medium">End date</label>
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart}
                    max={today}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
            )}
          </div>

          <Card title="Diagrams">
            <div className="flex flex-col gap-4">
              {diagramConfigs.map((diagram) => (
                <div key={diagram.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex flex-wrap gap-2">
                      {diagram.metrics.map((metric) => (
                        <span
                          key={metric}
                          className="px-2.5 py-1 text-xs rounded-full border border-gray-200 text-gray-700 bg-gray-50"
                        >
                          {DIAGRAM_METRIC_META[metric].label}
                        </span>
                      ))}
                      <span className="px-2.5 py-1 text-xs rounded-full border border-gray-200 text-gray-500 bg-white">
                        {DIAGRAM_STYLE_LABELS[diagram.style]}
                      </span>
                    </div>
                    <button
                      onClick={() => editDiagram(diagram)}
                      className="p-1.5 rounded-md text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
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
                  <CustomDiagramChart data={diagramData} metrics={diagram.metrics} style={diagram.style} />
                </div>
              ))}

              <button
                onClick={openNewDiagramPicker}
                className="w-full h-24 rounded-full border-2 border-dashed border-gray-300 bg-gray-100/90 hover:bg-gray-100 transition-colors flex items-center justify-center text-gray-500"
              >
                <Plus className="w-7 h-7" />
              </button>
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
                  <p className="text-sm font-medium text-gray-700 mb-2">Metrics</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {DIAGRAM_METRICS.map((metric) => (
                      <button
                        key={metric}
                        onClick={() => togglePendingMetric(metric)}
                        className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left
                          ${pendingMetrics.includes(metric)
                            ? 'bg-green-600 text-white border-green-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-green-400'
                          }`}
                      >
                        {DIAGRAM_METRIC_META[metric].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <label htmlFor="diagram-style" className="text-sm font-medium text-gray-700 mb-2 block">
                    Diagram style
                  </label>
                  <select
                    id="diagram-style"
                    value={pendingStyle}
                    onChange={(e) => setPendingStyle(e.target.value as DiagramStyle)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="bar">{DIAGRAM_STYLE_LABELS.bar}</option>
                    <option value="line">{DIAGRAM_STYLE_LABELS.line}</option>
                    <option value="area">{DIAGRAM_STYLE_LABELS.area}</option>
                    <option value="stackedBar">{DIAGRAM_STYLE_LABELS.stackedBar}</option>
                    <option value="stepLine">{DIAGRAM_STYLE_LABELS.stepLine}</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={resetDiagramPicker}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addDiagram}
                    disabled={pendingMetrics.length === 0}
                    className="px-4 py-2 text-sm rounded-lg border border-green-600 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editingDiagramId ? 'Save Diagram' : 'Add Diagram'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
