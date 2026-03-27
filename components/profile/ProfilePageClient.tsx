'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { subDays, format, parseISO, isAfter, differenceInCalendarDays } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { Food, FoodLog, WeightLog, WaterLog, Profile, calcMacros, sumMacros, ZERO_MACROS } from '@/lib/types';
import { normalizeFriendVisibility } from '@/lib/profileVisibility';
import Card from '@/components/ui/Card';
import {
  CustomDiagramChart,
  DiagramMetric,
  DiagramStyle,
  DiagramMetricUnits,
  DiagramAxisDomain,
  DIAGRAM_METRIC_META,
  DIAGRAM_METRIC_UNIT_OPTIONS,
  getDiagramMetricUnit,
  normalizeDiagramMetricUnits,
  DiagramChartDataPoint,
} from '@/components/profile/Charts';
import GymDashboard from '@/components/profile/GymDashboard';
import { User, Pencil, Check, X, Plus } from 'lucide-react';

const DEFAULT_RANGE_DAYS = 30;
const DATA_FETCH_LOOKBACK_DAYS = 36500;

interface ProfilePageClientProps {
  mode: 'diet' | 'gym';
}

interface DiagramConfig {
  id: string;
  metrics: DiagramMetric[];
  style: DiagramStyle;
  metricUnits: DiagramMetricUnits;
  axisDomain: DiagramAxisDomain;
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
const DEFAULT_TARGET_CALORIES = 2000;
const DEFAULT_TARGET_WATER_ML = 2000;
const DEFAULT_TARGET_PROTEIN_G = 150;
const DEFAULT_TARGET_CARBS_G = 250;
const DEFAULT_TARGET_FATS_G = 70;
const MIN_MACRO_TOTAL = 1;

interface DiagramConfigRow {
  id: string;
  metrics: string[];
  style: string;
  metric_units?: unknown;
  axis_min?: unknown;
  axis_max?: unknown;
}

function normalizeAxisValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseAxisInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function getDefaultDiagramRange(today: string) {
  const todayDate = parseISO(today);
  return {
    start: format(subDays(todayDate, DEFAULT_RANGE_DAYS - 1), 'yyyy-MM-dd'),
    end: today,
  };
}

export default function ProfilePageClient({ mode }: ProfilePageClientProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);

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
  const [pendingMetricUnits, setPendingMetricUnits] = useState<DiagramMetricUnits>({});
  const [pendingAxisMin, setPendingAxisMin] = useState('');
  const [pendingAxisMax, setPendingAxisMax] = useState('');
  const [editingDiagramId, setEditingDiagramId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [targetCaloriesInput, setTargetCaloriesInput] = useState(String(DEFAULT_TARGET_CALORIES));
  const [targetWaterInput, setTargetWaterInput] = useState(String(DEFAULT_TARGET_WATER_ML / 1000));
  const [targetProteinInput, setTargetProteinInput] = useState(String(DEFAULT_TARGET_PROTEIN_G));
  const [targetCarbsInput, setTargetCarbsInput] = useState(String(DEFAULT_TARGET_CARBS_G));
  const [targetFatsInput, setTargetFatsInput] = useState(String(DEFAULT_TARGET_FATS_G));
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [diagramRanges, setDiagramRanges] = useState<Record<string, { start: string; end: string }>>({});
  const [ageInput, setAgeInput] = useState('');
  const [heightInput, setHeightInput] = useState('');
  const [displayWeightKg, setDisplayWeightKg] = useState<number | null>(null);
  const [friendVisibility, setFriendVisibility] = useState<Record<string, boolean>>(normalizeFriendVisibility(null));

  const resetDiagramPicker = useCallback(() => {
    setPendingMetrics([]);
    setPendingStyle('bar');
    setPendingMetricUnits({});
    setPendingAxisMin('');
    setPendingAxisMax('');
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
      setTargetCaloriesInput(String(DEFAULT_TARGET_CALORIES));
      setTargetWaterInput(String(DEFAULT_TARGET_WATER_ML / 1000));
      setTargetProteinInput(String(DEFAULT_TARGET_PROTEIN_G));
      setTargetCarbsInput(String(DEFAULT_TARGET_CARBS_G));
      setTargetFatsInput(String(DEFAULT_TARGET_FATS_G));
      setAgeInput('');
      setHeightInput('');
      setFriendVisibility(normalizeFriendVisibility(null));
    } else {
      setProfile(profileData);
      setDraftName(profileData.display_name);
      const profileWithTarget = profileData as Profile;
      setTargetCaloriesInput(
        profileWithTarget.target_calories && profileWithTarget.target_calories > 0
          ? String(profileWithTarget.target_calories)
          : String(DEFAULT_TARGET_CALORIES)
      );
      setTargetWaterInput(
        profileWithTarget.target_water_ml && profileWithTarget.target_water_ml > 0
          ? String(profileWithTarget.target_water_ml / 1000)
          : String(DEFAULT_TARGET_WATER_ML / 1000)
      );
      setTargetProteinInput(
        profileWithTarget.target_protein_g && profileWithTarget.target_protein_g > 0
          ? String(profileWithTarget.target_protein_g)
          : String(DEFAULT_TARGET_PROTEIN_G)
      );
      setTargetCarbsInput(
        profileWithTarget.target_carbs_g && profileWithTarget.target_carbs_g > 0
          ? String(profileWithTarget.target_carbs_g)
          : String(DEFAULT_TARGET_CARBS_G)
      );
      setTargetFatsInput(
        profileWithTarget.target_fats_g && profileWithTarget.target_fats_g > 0
          ? String(profileWithTarget.target_fats_g)
          : String(DEFAULT_TARGET_FATS_G)
      );
      setAgeInput(profileWithTarget.age ? String(profileWithTarget.age) : '');
      setHeightInput(profileWithTarget.height_cm ? String(profileWithTarget.height_cm) : '');
      const nextVisibility = normalizeFriendVisibility(profileWithTarget.friend_visibility);
      setFriendVisibility(nextVisibility);
    }

    const todayDate = format(new Date(), 'yyyy-MM-dd');
    const fetchStartDate = format(subDays(new Date(), DATA_FETCH_LOOKBACK_DAYS - 1), 'yyyy-MM-dd');
    const [logsRes, weightsRes, waterRes, diagramsRes, todayWeightRes, latestWeightRes] = await Promise.all([
      supabase
        .from('food_logs')
        .select('*, food:foods(*)')
        .eq('user_id', user.id)
        .gte('date', fetchStartDate)
        .lte('date', todayDate)
        .order('date'),
      supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', fetchStartDate)
        .lte('date', todayDate)
        .order('date'),
      supabase
        .from('water_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', fetchStartDate)
        .lte('date', todayDate)
        .order('date'),
      supabase
        .from('diagram_configs')
        .select('id, metrics, style, metric_units, axis_min, axis_max')
        .eq('user_id', user.id)
        .order('created_at'),
      supabase
        .from('weight_logs')
        .select('weight_kg')
        .eq('user_id', user.id)
        .eq('date', todayDate)
        .maybeSingle(),
      supabase
        .from('weight_logs')
        .select('weight_kg')
        .eq('user_id', user.id)
        .lte('date', todayDate)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const validMetrics = new Set<DiagramMetric>(DIAGRAM_METRICS);
    const validStyles = new Set<DiagramStyle>(DIAGRAM_STYLES);
    const diagramRows: DiagramConfigRow[] = diagramsRes.data || [];
    const normalizedDiagrams: DiagramConfig[] = diagramRows
      .map((row) => ({
        id: row.id,
        metrics: (row.metrics || []).filter((metric): metric is DiagramMetric => validMetrics.has(metric as DiagramMetric)),
        style: validStyles.has(row.style as DiagramStyle) ? (row.style as DiagramStyle) : 'bar',
        metricUnits: normalizeDiagramMetricUnits(row.metric_units),
        axisDomain: {
          min: normalizeAxisValue(row.axis_min),
          max: normalizeAxisValue(row.axis_max),
        },
      }))
      .filter((row) => row.metrics.length > 0);
    setDiagramConfigs(normalizedDiagrams);
    setDiagramRanges((prev) => {
      const defaultRange = getDefaultDiagramRange(todayDate);
      const next: Record<string, { start: string; end: string }> = {};
      for (const diagram of normalizedDiagrams) {
        next[diagram.id] = prev[diagram.id] || defaultRange;
      }
      return next;
    });

    const weights: WeightLog[] = weightsRes.data || [];
    setWeightData(weights.map((w) => ({ date: w.date, weight: w.weight_kg })));
    const todayWeight = todayWeightRes.data?.weight_kg ?? null;
    const latestWeight = latestWeightRes.data?.weight_kg ?? null;
    setDisplayWeightKg(todayWeight ?? latestWeight);
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
  }, [mode]);

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

  async function saveTargetCalories() {
    if (!profile) return;
    const nextTarget = Number(targetCaloriesInput.trim());
    if (!Number.isInteger(nextTarget) || nextTarget <= 0) return;
    const supabase = createClient();
    await supabase.from('profiles').update({ target_calories: nextTarget }).eq('id', profile.id);
    setProfile((prev) => prev ? { ...prev, target_calories: nextTarget } as Profile : prev);
    setTargetCaloriesInput(String(nextTarget));
  }

  async function saveMacroAndWaterTargets() {
    if (!profile) return;
    const nextWaterLiters = Number(targetWaterInput.trim());
    const nextProtein = Number(targetProteinInput.trim());
    const nextCarbs = Number(targetCarbsInput.trim());
    const nextFats = Number(targetFatsInput.trim());
    const nextWaterMl = Math.round(nextWaterLiters * 1000);
    if (
      !Number.isFinite(nextWaterLiters) || nextWaterLiters <= 0
      || !Number.isInteger(nextWaterMl) || nextWaterMl <= 0
      || !Number.isInteger(nextProtein) || nextProtein <= 0
      || !Number.isInteger(nextCarbs) || nextCarbs <= 0
      || !Number.isInteger(nextFats) || nextFats <= 0
    ) return;

    const supabase = createClient();
    await supabase.from('profiles').update({
      target_water_ml: nextWaterMl,
      target_protein_g: nextProtein,
      target_carbs_g: nextCarbs,
      target_fats_g: nextFats,
    }).eq('id', profile.id);
    setProfile((prev) => prev ? {
      ...prev,
      target_water_ml: nextWaterMl,
      target_protein_g: nextProtein,
      target_carbs_g: nextCarbs,
      target_fats_g: nextFats,
    } : prev);
  }

  async function saveAgeAndHeight() {
    if (!profile) return;
    const age = ageInput.trim() ? Number(ageInput.trim()) : null;
    const heightCm = heightInput.trim() ? Number(heightInput.trim()) : null;
    if ((age !== null && (!Number.isInteger(age) || age <= 0)) || (heightCm !== null && (!Number.isInteger(heightCm) || heightCm <= 0))) {
      return;
    }
    const supabase = createClient();
    await supabase.from('profiles').update({ age, height_cm: heightCm }).eq('id', profile.id);
    setProfile((prev) => prev ? { ...prev, age, height_cm: heightCm } : prev);
  }

  async function saveFriendVisibility() {
    if (!profile) return;
    const supabase = createClient();
    await supabase.from('profiles').update({ friend_visibility: friendVisibility }).eq('id', profile.id);
    setProfile((prev) => prev ? { ...prev, friend_visibility: friendVisibility } : prev);
  }

  function toggleFriendVisibility(key: string) {
    setFriendVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const today = format(new Date(), 'yyyy-MM-dd');
  function setDiagramRangeValue(id: string, key: 'start' | 'end', value: string) {
    setDiagramRanges((prev) => {
      const existing = prev[id] || getDefaultDiagramRange(today);
      return {
        ...prev,
        [id]: {
          ...existing,
          [key]: value,
        },
      };
    });
  }

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
  const diagramRenderData = useMemo(() => {
    const fallbackRange = getDefaultDiagramRange(today);
    return diagramConfigs.map((diagram) => {
      const configuredRange = diagramRanges[diagram.id] || fallbackRange;
      let startDate = configuredRange.start || fallbackRange.start;
      let endDate = configuredRange.end || fallbackRange.end;
      if (isAfter(parseISO(startDate), parseISO(endDate))) {
        [startDate, endDate] = [endDate, startDate];
      }
      const chartData = diagramData.filter((point) => (
        point.date >= startDate && point.date <= endDate
      ));
      const rangeDays = Math.abs(
        differenceInCalendarDays(parseISO(endDate), parseISO(startDate))
      ) + 1;
      return {
        diagram,
        configuredRange,
        chartData,
        rangeDays,
      };
    });
  }, [diagramConfigs, diagramRanges, diagramData, today]);

  const selectedMacro = macroData.find((point) => point.date === selectedDate) ?? null;
  const targetCalories = profile?.target_calories ?? DEFAULT_TARGET_CALORIES;
  const totalCaloriesForSelectedDate = selectedMacro?.calories ?? 0;
  const calorieProgress = targetCalories > 0
    ? Math.min(totalCaloriesForSelectedDate / targetCalories, 1)
    : 0;
  const calorieProgressPercent = Math.round(calorieProgress * 100);
  const circleRadius = 33;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const circleDashOffset = circleCircumference * (1 - calorieProgress);

  const macroGoalTotals = selectedMacro
    ? Math.max(selectedMacro.protein + selectedMacro.carbs + selectedMacro.fats, MIN_MACRO_TOTAL)
    : MIN_MACRO_TOTAL;
  const targetProtein = profile?.target_protein_g ?? DEFAULT_TARGET_PROTEIN_G;
  const targetCarbs = profile?.target_carbs_g ?? DEFAULT_TARGET_CARBS_G;
  const targetFats = profile?.target_fats_g ?? DEFAULT_TARGET_FATS_G;
  const targetWater = (profile?.target_water_ml ?? DEFAULT_TARGET_WATER_ML) / 1000;
  const macroTargetByKey: Record<string, number> = {
    protein: targetProtein,
    carbs: targetCarbs,
    fats: targetFats,
  };
  const macroProgressItems = [
    {
      key: 'protein',
      label: 'Protein',
      value: selectedMacro?.protein ?? 0,
      width: `${Math.min(((selectedMacro?.protein ?? 0) / macroGoalTotals) * 100, 100)}%`,
      color: 'bg-violet-500',
    },
    {
      key: 'carbs',
      label: 'Carbs',
      value: selectedMacro?.carbs ?? 0,
      width: `${Math.min(((selectedMacro?.carbs ?? 0) / macroGoalTotals) * 100, 100)}%`,
      color: 'bg-amber-500',
    },
    {
      key: 'fats',
      label: 'Fats',
      value: selectedMacro?.fats ?? 0,
      width: `${Math.min(((selectedMacro?.fats ?? 0) / macroGoalTotals) * 100, 100)}%`,
      color: 'bg-rose-500',
    },
  ];

  function togglePendingMetric(metric: DiagramMetric) {
    setPendingMetrics((prev) => (
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    ));
  }

  function setPendingMetricUnit(metric: DiagramMetric, unit: string) {
    setPendingMetricUnits((prev) => ({
      ...prev,
      [metric]: unit,
    }));
  }

  async function addDiagram() {
    if (pendingMetrics.length === 0) return;
    if (!currentUserId) return;

    const supabase = createClient();
    let axisMin = parseAxisInput(pendingAxisMin);
    let axisMax = parseAxisInput(pendingAxisMax);
    if (axisMin !== null && axisMax !== null && axisMin > axisMax) {
      [axisMin, axisMax] = [axisMax, axisMin];
    }
    const normalizedAxisDomain: DiagramAxisDomain = {
      min: axisMin ?? undefined,
      max: axisMax ?? undefined,
    };

    if (editingDiagramId) {
      const { error } = await supabase
        .from('diagram_configs')
        .update({
          metrics: [...pendingMetrics],
          style: pendingStyle,
          metric_units: pendingMetricUnits,
          axis_min: axisMin,
          axis_max: axisMax,
        })
        .eq('id', editingDiagramId)
        .eq('user_id', currentUserId);

      if (error) return;

      setDiagramConfigs((prev) => prev.map((diagram) => (
        diagram.id === editingDiagramId
          ? {
            ...diagram,
            metrics: [...pendingMetrics],
            style: pendingStyle,
            metricUnits: pendingMetricUnits,
            axisDomain: normalizedAxisDomain,
          }
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
        metric_units: pendingMetricUnits,
        axis_min: axisMin,
        axis_max: axisMax,
      })
      .select('id, metric_units, axis_min, axis_max')
      .single();

    if (error || !data) return;

    setDiagramConfigs((prev) => [
      ...prev,
      {
        id: data.id,
        metrics: [...pendingMetrics],
        style: pendingStyle,
        metricUnits: normalizeDiagramMetricUnits(data.metric_units ?? pendingMetricUnits),
        axisDomain: normalizedAxisDomain,
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
    setPendingMetricUnits(diagram.metricUnits || {});
    setPendingAxisMin(
      typeof diagram.axisDomain?.min === 'number' ? String(diagram.axisDomain.min) : ''
    );
    setPendingAxisMax(
      typeof diagram.axisDomain?.max === 'number' ? String(diagram.axisDomain.max) : ''
    );
    setShowDiagramPicker(true);
  }

  function openNewDiagramPicker() {
    setEditingDiagramId(null);
    setPendingMetrics([]);
    setPendingStyle('bar');
    setPendingMetricUnits({});
    setPendingAxisMin('');
    setPendingAxisMax('');
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
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Total calories</p>
                  <p className="text-3xl font-bold text-gray-900 leading-tight">{totalCaloriesForSelectedDate} kcal</p>
                  <p className="text-sm text-gray-500 mt-1">{calorieProgressPercent}% of {targetCalories} kcal target</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label htmlFor="profile-selected-date" className="text-xs font-medium text-gray-600">Date</label>
                    <input
                      id="profile-selected-date"
                      type="date"
                      value={selectedDate}
                      max={today}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <label htmlFor="target-calories" className="text-xs font-medium text-gray-600">Target</label>
                    <input
                      id="target-calories"
                      type="number"
                      min={1}
                      value={targetCaloriesInput}
                      onChange={(e) => setTargetCaloriesInput(e.target.value)}
                      className="w-28 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <button
                      onClick={saveTargetCalories}
                      className="px-3 py-1.5 text-xs rounded-lg border border-green-600 bg-green-600 text-white hover:bg-green-700"
                    >
                      Save
                    </button>
                  </div>
                </div>
                <div className="relative w-24 h-24">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
                    <circle cx="40" cy="40" r={circleRadius} stroke="#e5e7eb" strokeWidth="8" fill="none" />
                    <circle
                      cx="40"
                      cy="40"
                      r={circleRadius}
                      stroke="#16a34a"
                      strokeWidth="8"
                      fill="none"
                      strokeLinecap="round"
                      strokeDasharray={circleCircumference}
                      strokeDashoffset={circleDashOffset}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-gray-700">
                    {calorieProgressPercent}%
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                {macroProgressItems.map((item) => (
                  <div key={item.key} className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
                    <span className="text-xs text-gray-600 font-medium w-12">{item.label}</span>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full ${item.color}`} style={{ width: item.width }} />
                    </div>
                    <span className="text-xs text-gray-500 w-16 text-right">{item.value}g / {macroTargetByKey[item.key]}g</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-gray-100">
                <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Targets</p>
                <div className="space-y-2">
                  <label htmlFor="target-water" className="flex items-center justify-between gap-3 text-xs text-gray-600">
                    <span className="font-medium">Water</span>
                    <input
                      id="target-water"
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={targetWaterInput}
                      onChange={(e) => setTargetWaterInput(e.target.value)}
                      className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </label>
                  <label htmlFor="target-protein" className="flex items-center justify-between gap-3 text-xs text-gray-600">
                    <span className="font-medium">Protein</span>
                    <input
                      id="target-protein"
                      type="number"
                      min={1}
                      value={targetProteinInput}
                      onChange={(e) => setTargetProteinInput(e.target.value)}
                      className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </label>
                  <label htmlFor="target-carbs" className="flex items-center justify-between gap-3 text-xs text-gray-600">
                    <span className="font-medium">Carbs</span>
                    <input
                      id="target-carbs"
                      type="number"
                      min={1}
                      value={targetCarbsInput}
                      onChange={(e) => setTargetCarbsInput(e.target.value)}
                      className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </label>
                  <label htmlFor="target-fats" className="flex items-center justify-between gap-3 text-xs text-gray-600">
                    <span className="font-medium">Fats</span>
                    <input
                      id="target-fats"
                      type="number"
                      min={1}
                      value={targetFatsInput}
                      onChange={(e) => setTargetFatsInput(e.target.value)}
                      className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </label>
                </div>
                <button
                  onClick={saveMacroAndWaterTargets}
                  className="mt-3 px-3 py-1.5 text-xs rounded-lg border border-green-600 bg-green-600 text-white hover:bg-green-700"
                >
                  Save targets
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <h3 className="font-semibold text-gray-800 mb-4">Personal data</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">Name</p>
                  <p className="font-medium text-gray-900">{profile?.display_name || profile?.username || '-'}</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">Age</p>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      min={1}
                      value={ageInput}
                      onChange={(e) => setAgeInput(e.target.value)}
                      className="w-full px-2 py-1 border border-gray-200 rounded-md text-sm"
                      placeholder="Age"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">Height</p>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      min={1}
                      value={heightInput}
                      onChange={(e) => setHeightInput(e.target.value)}
                      className="w-full px-2 py-1 border border-gray-200 rounded-md text-sm"
                      placeholder="cm"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-500">Weight</p>
                  <p className="font-medium text-gray-900">
                    {displayWeightKg != null ? `${displayWeightKg} kg` : '-'}
                  </p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 col-span-2">
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="font-medium text-gray-900 break-all">{email || '-'}</p>
                </div>
                <div className="col-span-2 flex justify-end">
                  <button
                    onClick={saveAgeAndHeight}
                    className="px-3 py-1.5 text-xs rounded-lg border border-green-600 bg-green-600 text-white hover:bg-green-700"
                  >
                    Save personal data
                  </button>
                </div>
                <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 col-span-2">
                  <p className="text-xs text-gray-500 mb-2">Visible to friends</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                    {Object.entries({
                      age: 'Age',
                      height: 'Height',
                      weight: 'Weight',
                      calorie_target: 'Calorie target',
                      macro_targets: 'Macro targets',
                      water_target: 'Water target',
                      diagrams: 'Diagrams',
                    }).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={friendVisibility[key] !== false}
                          onChange={() => toggleFriendVisibility(key)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={saveFriendVisibility}
                    className="mt-2 px-3 py-1.5 text-xs rounded-lg border border-green-600 bg-green-600 text-white hover:bg-green-700"
                  >
                    Save visibility
                  </button>
                </div>
              </div>
            </div>
          </div>

          <Card title="Diagrams" className="rounded-2xl shadow-sm">
            <div className="flex flex-col gap-4">
              {diagramRenderData.map(({ diagram, configuredRange, chartData, rangeDays }) => (
                <div key={diagram.id} className="border border-gray-100 rounded-2xl p-4 shadow-sm bg-white">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex flex-wrap gap-2">
                      {diagram.metrics.map((metric) => (
                        <span
                          key={metric}
                          className="px-2.5 py-1 text-xs rounded-full border border-gray-200 text-gray-700 bg-gray-50"
                        >
                          {DIAGRAM_METRIC_META[metric].label} ({getDiagramMetricUnit(metric, diagram.metricUnits)})
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
                  <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-center justify-between gap-2 text-xs text-gray-600">
                      <span className="font-medium">Start</span>
                      <input
                        type="date"
                        value={configuredRange.start}
                        max={configuredRange.end || today}
                        onChange={(e) => setDiagramRangeValue(diagram.id, 'start', e.target.value)}
                        className="px-2 py-1 border border-gray-200 rounded-md text-xs"
                      />
                    </label>
                    <label className="flex items-center justify-between gap-2 text-xs text-gray-600">
                      <span className="font-medium">End</span>
                      <input
                        type="date"
                        value={configuredRange.end}
                        min={configuredRange.start}
                        max={today}
                        onChange={(e) => setDiagramRangeValue(diagram.id, 'end', e.target.value)}
                        className="px-2 py-1 border border-gray-200 rounded-md text-xs"
                      />
                    </label>
                  </div>
                  <CustomDiagramChart
                    data={chartData}
                    metrics={diagram.metrics}
                    style={diagram.style}
                    metricUnits={diagram.metricUnits}
                    axisDomain={diagram.axisDomain}
                    macroTargets={{
                      protein: targetProtein,
                      carbs: targetCarbs,
                      fats: targetFats,
                      calories: targetCalories,
                      water: targetWater,
                    }}
                    showValueLabels={rangeDays <= 10}
                  />
                </div>
              ))}

              <button
                onClick={openNewDiagramPicker}
                className="w-full h-24 rounded-2xl border-2 border-dashed border-green-200 bg-green-50/80 hover:bg-green-50 transition-colors flex items-center justify-center text-green-500 shadow-sm"
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
                          className={`px-3 py-2 text-sm rounded-xl border shadow-sm transition-all text-left
                          ${pendingMetrics.includes(metric)
                            ? 'bg-green-600 text-white border-green-600 shadow-green-200'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-green-400 hover:-translate-y-0.5'
                          }`}
                      >
                        {DIAGRAM_METRIC_META[metric].label}
                      </button>
                    ))}
                  </div>
                </div>

                {pendingMetrics.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Units</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {pendingMetrics.map((metric) => (
                        <label
                          key={`${metric}-unit`}
                          className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50"
                        >
                          <span className="text-sm text-gray-700">{DIAGRAM_METRIC_META[metric].label}</span>
                          <select
                            value={getDiagramMetricUnit(metric, pendingMetricUnits)}
                            onChange={(e) => setPendingMetricUnit(metric, e.target.value)}
                            className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white"
                          >
                            {DIAGRAM_METRIC_UNIT_OPTIONS[metric].map((unit) => (
                              <option key={unit} value={unit}>{unit}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

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

                <div className="mb-5">
                  <p className="text-sm font-medium text-gray-700 mb-2">Y-axis range (optional)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
