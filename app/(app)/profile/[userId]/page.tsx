'use client';

import { useState, useEffect, useMemo } from 'react';
import { use } from 'react';
import { subDays, format, parseISO, isAfter, differenceInCalendarDays } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import {
  Profile, Food, FoodLog, WeightLog, WaterLog, FriendshipStatus,
  calcMacros, sumMacros, ZERO_MACROS, MEAL_ORDER, MEAL_LABELS, MealType,
} from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import GymDashboard from '@/components/profile/GymDashboard';
import {
  WeightChart,
  CalorieChart,
  MacroChart,
  CustomDiagramChart,
  DiagramMetric,
  DiagramStyle,
  DIAGRAM_METRIC_META,
  DiagramChartDataPoint,
} from '@/components/profile/Charts';
import { Lock, UserPlus, UserCheck, Clock, ChevronLeft, X, Check, Pencil, Plus } from 'lucide-react';
import Link from 'next/link';
import { MODE_COOKIE, normalizeMode } from '@/lib/mode';
import { normalizeFriendVisibility } from '@/lib/profileVisibility';

const DEFAULT_RANGE_DAYS = 30;
const DATA_FETCH_LOOKBACK_DAYS = 36500;

interface DiagramConfig {
  id: string;
  metrics: DiagramMetric[];
  style: DiagramStyle;
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

const DIAGRAM_METRICS: DiagramMetric[] = ['calories', 'water', 'weight', 'carbs', 'fats', 'protein'];
const DIAGRAM_STYLES: DiagramStyle[] = ['bar', 'line', 'area', 'stackedBar', 'stepLine'];
const DIAGRAM_STYLE_LABELS: Record<DiagramStyle, string> = {
  bar: 'Bar',
  line: 'Line',
  area: 'Area',
  stackedBar: 'Stacked Bar',
  stepLine: 'Step Line',
};
const DEFAULT_TARGET_PROTEIN_G = 150;
const DEFAULT_TARGET_CARBS_G = 250;
const DEFAULT_TARGET_FATS_G = 70;
const DEFAULT_TARGET_WATER_ML = 2000;
const DEFAULT_TARGET_CALORIES = 2000;

function parseModeFromCookie(): 'diet' | 'gym' {
  if (typeof document === 'undefined') return 'diet';
  const cookieValue = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${MODE_COOKIE}=`))
    ?.split('=')[1];
  return normalizeMode(cookieValue);
}

function normalizeDiagramConfigs(source: unknown): DiagramConfig[] {
  if (!Array.isArray(source)) return [];

  const validMetrics = new Set<DiagramMetric>(DIAGRAM_METRICS);
  const validStyles = new Set<DiagramStyle>(DIAGRAM_STYLES);

  return source.reduce<DiagramConfig[]>((acc, row) => {
    if (!row || typeof row !== 'object') return acc;
    const value = row as {
      id?: unknown;
      metrics?: unknown;
      style?: unknown;
      axis_min?: unknown;
      axis_max?: unknown;
      axisDomain?: { min?: unknown; max?: unknown };
    };
    const metrics = Array.isArray(value.metrics)
      ? value.metrics.filter((metric): metric is DiagramMetric => validMetrics.has(metric as DiagramMetric))
      : [];
    if (metrics.length === 0) return acc;
    acc.push({
      id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
      metrics,
      style: validStyles.has(value.style as DiagramStyle) ? (value.style as DiagramStyle) : 'bar',
      axisDomain: {
        min: normalizeAxisValue(value.axis_min ?? value.axisDomain?.min),
        max: normalizeAxisValue(value.axis_max ?? value.axisDomain?.max),
      },
    });
    return acc;
  }, []);
}

function isDiagramStyle(value: string): value is DiagramStyle {
  return DIAGRAM_STYLES.includes(value as DiagramStyle);
}

function getDefaultDiagramRange(today: string) {
  const todayDate = parseISO(today);
  return {
    start: format(subDays(todayDate, DEFAULT_RANGE_DAYS - 1), 'yyyy-MM-dd'),
    end: today,
  };
}

export default function FriendProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Friendship state
  const [friendshipId, setFriendshipId] = useState<string | null>(null);
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus | null>(null);
  const [iAmRequester, setIAmRequester] = useState(false);

  // Chart data (only loaded if friends)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const mode = parseModeFromCookie();
  const [weightData, setWeightData] = useState<{ date: string; weight: number }[]>([]);
  const [waterData, setWaterData] = useState<{ date: string; water: number }[]>([]);
  const [macroData, setMacroData] = useState<{
    date: string; calories: number; protein: number; carbs: number; fats: number;
  }[]>([]);
  const [selectedDateLogs, setSelectedDateLogs] = useState<(FoodLog & { food: Food })[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [diagramConfigs, setDiagramConfigs] = useState<DiagramConfig[]>([]);
  const [diagramRanges, setDiagramRanges] = useState<Record<string, { start: string; end: string }>>({});
  const [showDiagramPicker, setShowDiagramPicker] = useState(false);
  const [pendingMetrics, setPendingMetrics] = useState<DiagramMetric[]>([]);
  const [pendingStyle, setPendingStyle] = useState<DiagramStyle>('bar');
  const [pendingAxisMin, setPendingAxisMin] = useState('');
  const [pendingAxisMax, setPendingAxisMax] = useState('');
  const [editingDiagramId, setEditingDiagramId] = useState<string | null>(null);

  function buildFriendDiagramStorageKey(targetUserId: string) {
    return `trackbuddy_friend_diagrams:${targetUserId}`;
  }

  function seedViewerDiagramConfigsFromFriend(
    rawFriendDiagrams: unknown,
    localStorageKey: string
  ) {
    const friendDiagrams = normalizeDiagramConfigs(rawFriendDiagrams);
    setDiagramConfigs(friendDiagrams);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(localStorageKey, JSON.stringify(friendDiagrams));
    }
  }

  function resetDiagramPicker() {
    setPendingMetrics([]);
    setPendingStyle('bar');
    setPendingAxisMin('');
    setPendingAxisMax('');
    setEditingDiagramId(null);
    setShowDiagramPicker(false);
  }

  function persistDiagramConfigsToLocalStorage(configs: DiagramConfig[]) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(buildFriendDiagramStorageKey(userId), JSON.stringify(configs));
  }

  async function loadProfileAndFriendship() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load the target profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(profileData);
    setProfileLoading(false);

    // Check friendship
    const { data: fs } = await supabase
      .from('friendships')
      .select('*')
      .or(
        `and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`
      )
      .maybeSingle();

    if (fs) {
      setFriendshipId(fs.id);
      setFriendshipStatus(fs.status as FriendshipStatus);
      setIAmRequester(fs.requester_id === user.id);
    } else {
      setFriendshipId(null);
      setFriendshipStatus(null);
    }
  }

  async function loadFriendDietData() {
    if (friendshipStatus !== 'accepted' || mode !== 'diet') return;
    setDataLoading(true);
    const supabase = createClient();
    const endDate = format(new Date(), 'yyyy-MM-dd');
    const fetchStartDate = format(subDays(new Date(), DATA_FETCH_LOOKBACK_DAYS - 1), 'yyyy-MM-dd');

    const [logsRes, weightsRes, selectedDateRes, waterRes, diagramsRes] = await Promise.all([
      supabase
        .from('food_logs')
        .select('*, food:foods(*)')
        .eq('user_id', userId)
        .gte('date', fetchStartDate)
        .lte('date', endDate)
        .order('date'),
      supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('date', fetchStartDate)
        .lte('date', endDate)
        .order('date'),
      supabase
        .from('food_logs')
        .select('*, food:foods(*)')
        .eq('user_id', userId)
        .eq('date', selectedDate)
        .order('meal_type'),
      supabase
        .from('water_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('date', fetchStartDate)
        .lte('date', endDate)
        .order('date'),
      supabase
        .from('diagram_configs')
        .select('id, metrics, style, axis_min, axis_max')
        .eq('user_id', userId)
        .order('created_at'),
    ]);

    const weights: WeightLog[] = weightsRes.data || [];
    setWeightData(weights.map((w) => ({ date: w.date, weight: w.weight_kg })));

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

    const waters: WaterLog[] = waterRes.data || [];
    setWaterData(waters.map((w) => ({ date: w.date, water: w.water_ml / 1000 })));

    const normalizedDiagrams = normalizeDiagramConfigs(diagramsRes.data || []);
    if (typeof window !== 'undefined') {
      const localStorageKey = buildFriendDiagramStorageKey(userId);
      const rawLocal = window.localStorage.getItem(localStorageKey);
      if (rawLocal) {
        try {
          const localDiagrams = normalizeDiagramConfigs(JSON.parse(rawLocal));
          setDiagramConfigs(localDiagrams);
          setDiagramRanges((prev) => {
            const fallbackRange = getDefaultDiagramRange(endDate);
            const next: Record<string, { start: string; end: string }> = {};
            for (const diagram of localDiagrams) {
              next[diagram.id] = prev[diagram.id] || fallbackRange;
            }
            return next;
          });
        } catch {
          seedViewerDiagramConfigsFromFriend(diagramsRes.data || [], localStorageKey);
          setDiagramRanges((prev) => {
            const fallbackRange = getDefaultDiagramRange(endDate);
            const next: Record<string, { start: string; end: string }> = {};
            for (const diagram of normalizedDiagrams) {
              next[diagram.id] = prev[diagram.id] || fallbackRange;
            }
            return next;
          });
        }
      } else {
        seedViewerDiagramConfigsFromFriend(diagramsRes.data || [], localStorageKey);
        setDiagramRanges((prev) => {
          const fallbackRange = getDefaultDiagramRange(endDate);
          const next: Record<string, { start: string; end: string }> = {};
          for (const diagram of normalizedDiagrams) {
            next[diagram.id] = prev[diagram.id] || fallbackRange;
          }
          return next;
        });
      }
    } else {
      setDiagramConfigs(normalizedDiagrams);
      setDiagramRanges((prev) => {
        const fallbackRange = getDefaultDiagramRange(endDate);
        const next: Record<string, { start: string; end: string }> = {};
        for (const diagram of normalizedDiagrams) {
          next[diagram.id] = prev[diagram.id] || fallbackRange;
        }
        return next;
      });
    }
    setSelectedDateLogs(selectedDateRes.data || []);
    setDataLoading(false);
  }

  useEffect(() => { loadProfileAndFriendship(); }, [userId]);
  useEffect(() => { loadFriendDietData(); }, [userId, friendshipStatus, selectedDate, mode]);

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
    const fallbackRange = getDefaultDiagramRange(format(new Date(), 'yyyy-MM-dd'));
    return diagramConfigs.map((diagram) => {
      const configuredRange = diagramRanges[diagram.id] || fallbackRange;
      let startDate = configuredRange.start || fallbackRange.start;
      let endDate = configuredRange.end || fallbackRange.end;
      if (isAfter(parseISO(startDate), parseISO(endDate))) {
        [startDate, endDate] = [endDate, startDate];
      }
      const chartData = diagramData.filter((point) => point.date >= startDate && point.date <= endDate);
      const rangeDays = Math.abs(differenceInCalendarDays(parseISO(endDate), parseISO(startDate))) + 1;
      return {
        diagram,
        configuredRange,
        chartData,
        rangeDays,
      };
    });
  }, [diagramConfigs, diagramRanges, diagramData]);

  function setDiagramRangeValue(id: string, key: 'start' | 'end', value: string) {
    setDiagramRanges((prev) => {
      const fallbackRange = getDefaultDiagramRange(format(new Date(), 'yyyy-MM-dd'));
      const existing = prev[id] || fallbackRange;
      return {
        ...prev,
        [id]: {
          ...existing,
          [key]: value,
        },
      };
    });
  }

  function togglePendingMetric(metric: DiagramMetric) {
    setPendingMetrics((prev) => {
      const index = prev.indexOf(metric);
      if (index === -1) return [...prev, metric];
      return [...prev.slice(0, index), ...prev.slice(index + 1)];
    });
  }

  function openNewDiagramPicker() {
    setEditingDiagramId(null);
    setPendingMetrics([]);
    setPendingStyle('bar');
    setPendingAxisMin('');
    setPendingAxisMax('');
    setShowDiagramPicker(true);
  }

  function editDiagram(diagram: DiagramConfig) {
    setEditingDiagramId(diagram.id);
    setPendingMetrics([...diagram.metrics]);
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
    if (pendingMetrics.length === 0) return;
    let axisMin = parseAxisInput(pendingAxisMin);
    let axisMax = parseAxisInput(pendingAxisMax);
    if (axisMin !== null && axisMax !== null && axisMin > axisMax) {
      [axisMin, axisMax] = [axisMax, axisMin];
    }
    const axisDomain = {
      min: axisMin ?? undefined,
      max: axisMax ?? undefined,
    };
    const nextConfigs = editingDiagramId
      ? diagramConfigs.map((diagram) => (
        diagram.id === editingDiagramId
          ? { ...diagram, metrics: [...pendingMetrics], style: pendingStyle, axisDomain }
          : diagram
      ))
      : [...diagramConfigs, {
        id: crypto.randomUUID(),
        metrics: [...pendingMetrics],
        style: pendingStyle,
        axisDomain,
      }];
    setDiagramConfigs(nextConfigs);
    persistDiagramConfigsToLocalStorage(nextConfigs);
    setDiagramRanges((prev) => {
      const fallbackRange = getDefaultDiagramRange(format(new Date(), 'yyyy-MM-dd'));
      const next: Record<string, { start: string; end: string }> = {};
      for (const diagram of nextConfigs) {
        next[diagram.id] = prev[diagram.id] || fallbackRange;
      }
      return next;
    });
    resetDiagramPicker();
  }

  function removeDiagram(id: string) {
    const nextConfigs = diagramConfigs.filter((diagram) => diagram.id !== id);
    setDiagramConfigs(nextConfigs);
    persistDiagramConfigsToLocalStorage(nextConfigs);
    setDiagramRanges((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (editingDiagramId === id) {
      resetDiagramPicker();
    }
  }

  async function sendRequest() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('friendships').insert({
      requester_id: user.id,
      addressee_id: userId,
      status: 'pending',
    }).select().single();
    setFriendshipId(data?.id ?? null);
    setFriendshipStatus('pending');
    setIAmRequester(true);
  }

  async function cancelOrReject() {
    if (!friendshipId) return;
    const supabase = createClient();
    await supabase.from('friendships').delete().eq('id', friendshipId);
    setFriendshipId(null);
    setFriendshipStatus(null);
  }

  async function acceptRequest() {
    if (!friendshipId) return;
    const supabase = createClient();
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
    setFriendshipStatus('accepted');
    loadFriendDietData();
  }

  async function removeFriend() {
    if (!friendshipId) return;
    const supabase = createClient();
    await supabase.from('friendships').delete().eq('id', friendshipId);
    setFriendshipId(null);
    setFriendshipStatus(null);
    setWeightData([]);
    setMacroData([]);
    setSelectedDateLogs([]);
  }

  if (profileLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center py-20 gap-4">
        <p className="text-gray-500">User not found.</p>
        <Link href="/friends" className="text-green-600 hover:underline text-sm">
          ← Back to Friends
        </Link>
      </div>
    );
  }

  const displayName = profile.display_name || profile.username;
  const isFriend = friendshipStatus === 'accepted';
  const isPending = friendshipStatus === 'pending';
  const friendVisibility = normalizeFriendVisibility(profile.friend_visibility);
  const canSee = (key: string) => friendVisibility[key] !== false;
  const latestKnownWeight = weightData.length > 0 ? weightData[weightData.length - 1].weight : null;
  const selectedMacro = macroData.find((point) => point.date === selectedDate) ?? null;
  const selectedWeight = weightData.find((point) => point.date === selectedDate)?.weight ?? latestKnownWeight;
  const macroTargets = {
    protein: profile.target_protein_g ?? DEFAULT_TARGET_PROTEIN_G,
    carbs: profile.target_carbs_g ?? DEFAULT_TARGET_CARBS_G,
    fats: profile.target_fats_g ?? DEFAULT_TARGET_FATS_G,
  };
  const waterTargetL = (profile.target_water_ml ?? DEFAULT_TARGET_WATER_ML) / 1000;
  const diagramTargets = {
    protein: canSee('macro_targets') ? macroTargets.protein : undefined,
    carbs: canSee('macro_targets') ? macroTargets.carbs : undefined,
    fats: canSee('macro_targets') ? macroTargets.fats : undefined,
    calories: canSee('calorie_target') ? (profile.target_calories ?? DEFAULT_TARGET_CALORIES) : undefined,
    water: canSee('water_target') ? waterTargetL : undefined,
  };
  const selectedCalories = selectedMacro?.calories ?? 0;
  const selectedCalorieTarget = profile.target_calories ?? DEFAULT_TARGET_CALORIES;
  const selectedCalorieProgress = selectedCalorieTarget > 0
    ? Math.min(selectedCalories / selectedCalorieTarget, 1)
    : 0;
  const selectedCaloriePercent = Math.round(selectedCalorieProgress * 100);
  const circleRadius = 33;
  const circleCircumference = 2 * Math.PI * circleRadius;
  const circleDashOffset = circleCircumference * (1 - selectedCalorieProgress);
  const selectedMacroTotal = selectedMacro
    ? Math.max(selectedMacro.protein + selectedMacro.carbs + selectedMacro.fats, 1)
    : 1;
  const macroProgressItems = [
    {
      key: 'protein',
      label: 'Protein',
      value: selectedMacro?.protein ?? 0,
      width: `${Math.min(((selectedMacro?.protein ?? 0) / selectedMacroTotal) * 100, 100)}%`,
      color: 'bg-violet-500',
      target: macroTargets.protein,
    },
    {
      key: 'carbs',
      label: 'Carbs',
      value: selectedMacro?.carbs ?? 0,
      width: `${Math.min(((selectedMacro?.carbs ?? 0) / selectedMacroTotal) * 100, 100)}%`,
      color: 'bg-amber-500',
      target: macroTargets.carbs,
    },
    {
      key: 'fats',
      label: 'Fats',
      value: selectedMacro?.fats ?? 0,
      width: `${Math.min(((selectedMacro?.fats ?? 0) / selectedMacroTotal) * 100, 100)}%`,
      color: 'bg-rose-500',
      target: macroTargets.fats,
    },
  ];

  // Group selected date logs by meal
  const mealGroups: Record<MealType, (FoodLog & { food: Food })[]> = {
    breakfast: [],
    lunch: [],
    snack: [],
    dinner: [],
  };
  for (const log of selectedDateLogs) {
    mealGroups[log.meal_type as MealType].push(log);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Back link */}
      <Link
        href="/friends"
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-green-600 transition-colors w-fit"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Friends
      </Link>

      {/* Profile header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
            <span className="text-xl font-bold text-green-700">
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
            <p className="text-sm text-gray-500">@{profile.username}</p>
          </div>
        </div>

        {/* Friendship action button */}
        <div className="shrink-0">
          {isFriend ? (
            <button
              onClick={removeFriend}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <X className="w-4 h-4" />
              Remove Friend
            </button>
          ) : isPending && iAmRequester ? (
            <button
              onClick={cancelOrReject}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Clock className="w-4 h-4" />
              Cancel Request
            </button>
          ) : isPending && !iAmRequester ? (
            <div className="flex gap-2">
              <Button onClick={acceptRequest}>
                <Check className="w-4 h-4" />
                Accept
              </Button>
              <Button variant="secondary" onClick={cancelOrReject}>
                <X className="w-4 h-4" />
                Decline
              </Button>
            </div>
          ) : (
            <Button onClick={sendRequest}>
              <UserPlus className="w-4 h-4" />
              Add Friend
            </Button>
          )}
        </div>
      </div>

      {/* Friendship status badge */}
      {isFriend && (
        <div className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
          <UserCheck className="w-4 h-4" />
          You are friends
        </div>
      )}

      {/* Not friends → privacy notice */}
      {!isFriend && (
        <Card>
          <div className="flex flex-col items-center py-8 gap-3 text-center">
            <Lock className="w-10 h-10 text-gray-300" />
            <p className="font-semibold text-gray-600">This profile is private</p>
            <p className="text-sm text-gray-400 max-w-sm">
              {isPending
                ? iAmRequester
                  ? `Your friend request is pending. Once ${displayName} accepts, you'll be able to see their diet and gym dashboards.`
                  : `${displayName} sent you a friend request. Accept it to view their diet and gym dashboards.`
                : `Add ${displayName} as a friend to view their diet and gym dashboards.`
              }
            </p>
          </div>
        </Card>
      )}

      {/* Friend data */}
      {isFriend && (
        <>
          {mode === 'gym' ? (
            <GymDashboard targetUserId={userId} />
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Total calories</p>
                    <p className="text-3xl font-bold text-gray-900 leading-tight">{selectedCalories} kcal</p>
                    <p className="text-sm text-gray-500 mt-1">{selectedCaloriePercent}% of {selectedCalorieTarget} kcal target</p>
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
                      {selectedCaloriePercent}%
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor="friend-selected-date" className="text-xs font-medium text-gray-600">Date</label>
                  <input
                    id="friend-selected-date"
                    type="date"
                    value={selectedDate}
                    max={format(new Date(), 'yyyy-MM-dd')}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  {macroProgressItems.map((item) => (
                    <div key={item.key} className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
                      <span className="text-xs text-gray-600 font-medium w-12">{item.label}</span>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full ${item.color}`} style={{ width: item.width }} />
                      </div>
                      <span className="text-xs text-gray-500 w-20 text-right">{item.value}g / {item.target}g</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Targets</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {canSee('water_target') && (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-500">Water</p>
                        <p className="font-medium text-gray-900">{waterTargetL} L</p>
                      </div>
                    )}
                    {canSee('macro_targets') && (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-500">Protein</p>
                        <p className="font-medium text-gray-900">{macroTargets.protein} g</p>
                      </div>
                    )}
                    {canSee('macro_targets') && (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-500">Carbs</p>
                        <p className="font-medium text-gray-900">{macroTargets.carbs} g</p>
                      </div>
                    )}
                    {canSee('macro_targets') && (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-500">Fats</p>
                        <p className="font-medium text-gray-900">{macroTargets.fats} g</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {dataLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
                </div>
              ) : (
                <>
                  <Card title="Shared personal data">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {canSee('age') && (
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                          <p className="text-xs text-gray-500">Age</p>
                          <p className="font-medium text-gray-900">{profile.age ?? '-'}</p>
                        </div>
                      )}
                      {canSee('height') && (
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                          <p className="text-xs text-gray-500">Height</p>
                          <p className="font-medium text-gray-900">{profile.height_cm ? `${profile.height_cm} cm` : '-'}</p>
                        </div>
                      )}
                      {canSee('weight') && (
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                          <p className="text-xs text-gray-500">Latest weight</p>
                          <p className="font-medium text-gray-900">{selectedWeight != null ? `${selectedWeight} kg` : '-'}</p>
                        </div>
                      )}
                      {canSee('calorie_target') && (
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2">
                          <p className="text-xs text-gray-500">Calorie target</p>
                          <p className="font-medium text-gray-900">{profile.target_calories ?? 2000} kcal</p>
                        </div>
                      )}
                      {canSee('macro_targets') && (
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 col-span-2">
                          <p className="text-xs text-gray-500">Macro targets</p>
                          <p className="font-medium text-gray-900">
                            Protein {macroTargets.protein}g • Carbs {macroTargets.carbs}g • Fats {macroTargets.fats}g
                          </p>
                        </div>
                      )}
                      {canSee('water_target') && (
                        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 col-span-2">
                          <p className="text-xs text-gray-500">Water target</p>
                          <p className="font-medium text-gray-900">{waterTargetL} L</p>
                        </div>
                      )}
                    </div>
                  </Card>

                    {canSee('weight') && (
                      <Card title="Weight Progress">
                      <WeightChart data={weightData} showValueLabels={false} />
                      </Card>
                    )}

                    <Card title="Daily Calories">
                    <CalorieChart data={macroData} showValueLabels={false} />
                    </Card>

                    <Card title="Daily Macros (Protein / Carbs / Fats)">
                      <MacroChart
                        data={macroData}
                        targets={canSee('macro_targets') ? macroTargets : undefined}
                      showValueLabels={false}
                      />
                    </Card>

                  {canSee('diagrams') && (
                    <Card title="Custom Diagrams">
                      <div className="flex flex-col gap-4">
                        {diagramRenderData.map(({ diagram, configuredRange, chartData, rangeDays }) => (
                          <div key={diagram.id} className="border border-gray-100 rounded-2xl p-4 shadow-sm">
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
                              <div className="flex items-center gap-1.5">
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
                            </div>
                            <div className="mb-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <label className="flex items-center justify-between gap-2 text-xs text-gray-600">
                                <span className="font-medium">Start</span>
                                <input
                                  type="date"
                                  value={configuredRange.start}
                                  max={configuredRange.end || format(new Date(), 'yyyy-MM-dd')}
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
                                  max={format(new Date(), 'yyyy-MM-dd')}
                                  onChange={(e) => setDiagramRangeValue(diagram.id, 'end', e.target.value)}
                                  className="px-2 py-1 border border-gray-200 rounded-md text-xs"
                                />
                              </label>
                            </div>
                            <CustomDiagramChart
                              data={chartData}
                              metrics={diagram.metrics}
                              style={diagram.style}
                              axisDomain={diagram.axisDomain}
                              macroTargets={diagramTargets}
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
                  )}

                  <Card title={`Food Log — ${format(parseISO(selectedDate), 'MMM d, yyyy')}`}>
                    {selectedDateLogs.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        {displayName} has not logged any food on this date.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-4">
                        {MEAL_ORDER.map((meal) => {
                          const entries = mealGroups[meal];
                          if (entries.length === 0) return null;
                          const mealTotal = entries.reduce(
                            (acc, log) => sumMacros(acc, calcMacros(log.food, log.amount_g)),
                            { ...ZERO_MACROS }
                          );
                          return (
                            <div key={meal}>
                              <div className="flex items-center justify-between mb-2">
                                <h4 className="text-sm font-semibold text-gray-700">{MEAL_LABELS[meal]}</h4>
                                <span className="text-xs text-gray-400">{mealTotal.calories} kcal</span>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                {entries.map((log) => {
                                  const m = calcMacros(log.food, log.amount_g);
                                  return (
                                    <div
                                      key={log.id}
                                      className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-2"
                                    >
                                      <div>
                                        <span className="font-medium text-gray-800">{log.food.name}</span>
                                        <span className="text-gray-400 ml-1.5">{log.amount_g}g</span>
                                      </div>
                                      <div className="flex gap-3 text-xs text-gray-500">
                                        <span>{m.calories} kcal</span>
                                        <span className="text-blue-500">P {m.protein}g</span>
                                        <span className="text-yellow-600">C {m.carbs}g</span>
                                        <span className="text-red-500">F {m.fats}g</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                </>
              )}
            </>
          )}
        </>
      )}

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

            <div className="mb-5">
              <label htmlFor="friend-diagram-style" className="text-sm font-medium text-gray-700 mb-2 block">
                Diagram style
              </label>
              <select
                id="friend-diagram-style"
                value={pendingStyle}
                onChange={(e) => {
                  const nextStyle = e.target.value;
                  if (isDiagramStyle(nextStyle)) setPendingStyle(nextStyle);
                }}
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
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveDiagram}
                disabled={pendingMetrics.length === 0}
                className="px-4 py-2 text-sm rounded-lg border border-green-600 bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editingDiagramId ? 'Save Diagram' : 'Add Diagram'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
