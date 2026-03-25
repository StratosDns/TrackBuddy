'use client';

import { useState, useEffect, useMemo } from 'react';
import { use } from 'react';
import { subDays, format } from 'date-fns';
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

const RANGES = [
  { label: '7 Days', days: 7 },
  { label: '14 Days', days: 14 },
  { label: '30 Days', days: 30 },
];

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

  return source
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const value = row as { id?: unknown; metrics?: unknown; style?: unknown };
      const metrics = Array.isArray(value.metrics)
        ? value.metrics.filter((metric): metric is DiagramMetric => validMetrics.has(metric as DiagramMetric))
        : [];
      if (metrics.length === 0) return null;
      return {
        id: typeof value.id === 'string' ? value.id : crypto.randomUUID(),
        metrics,
        style: validStyles.has(value.style as DiagramStyle) ? (value.style as DiagramStyle) : 'bar',
      };
    })
    .filter((row): row is DiagramConfig => row !== null);
}

function readDiagramConfigsFromLocalStorage(localStorageKey: string): DiagramConfig[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(localStorageKey);
    if (!raw) return [];
    return normalizeDiagramConfigs(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
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
  const [range, setRange] = useState(30);
  const [mode] = useState<'diet' | 'gym'>(parseModeFromCookie);
  const [weightData, setWeightData] = useState<{ date: string; weight: number }[]>([]);
  const [waterData, setWaterData] = useState<{ date: string; water: number }[]>([]);
  const [macroData, setMacroData] = useState<{
    date: string; calories: number; protein: number; carbs: number; fats: number;
  }[]>([]);
  const [todayLogs, setTodayLogs] = useState<(FoodLog & { food: Food })[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [diagramConfigs, setDiagramConfigs] = useState<DiagramConfig[]>(
    () => readDiagramConfigsFromLocalStorage(`tb_friend_diagrams:${userId}`)
  );
  const [showDiagramPicker, setShowDiagramPicker] = useState(false);
  const [pendingMetrics, setPendingMetrics] = useState<DiagramMetric[]>([]);
  const [pendingStyle, setPendingStyle] = useState<DiagramStyle>('bar');
  const [editingDiagramId, setEditingDiagramId] = useState<string | null>(null);

  function getLocalStorageKey() {
    return `tb_friend_diagrams:${userId}`;
  }

  function resetDiagramPicker() {
    setPendingMetrics([]);
    setPendingStyle('bar');
    setEditingDiagramId(null);
    setShowDiagramPicker(false);
  }

  function persistDiagramConfigsToLocalStorage(configs: DiagramConfig[]) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(getLocalStorageKey(), JSON.stringify(configs));
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

  async function loadFriendData() {
    if (friendshipStatus !== 'accepted' || mode !== 'diet') return;
    setDataLoading(true);
    const supabase = createClient();

    const startDate = format(subDays(new Date(), range - 1), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');
    const today = format(new Date(), 'yyyy-MM-dd');

    const [logsRes, weightsRes, todayRes, waterRes, diagramsRes] = await Promise.all([
      supabase
        .from('food_logs')
        .select('*, food:foods(*)')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date'),
      supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date'),
      supabase
        .from('food_logs')
        .select('*, food:foods(*)')
        .eq('user_id', userId)
        .eq('date', today)
        .order('meal_type'),
      supabase
        .from('water_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date'),
      supabase
        .from('diagram_configs')
        .select('id, metrics, style')
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
    setWaterData(waters.map((w) => ({ date: w.date, water: w.water_ml })));

    if (typeof window !== 'undefined') {
      const localStorageKey = getLocalStorageKey();
      const rawLocal = window.localStorage.getItem(localStorageKey);
      if (!rawLocal) {
        const friendDiagrams = normalizeDiagramConfigs(diagramsRes.data || []);
        setDiagramConfigs(friendDiagrams);
        persistDiagramConfigsToLocalStorage(friendDiagrams);
      }
    }

    setTodayLogs(todayRes.data || []);
    setDataLoading(false);
  }

  useEffect(() => { loadProfileAndFriendship(); }, [userId]);
  useEffect(() => { loadFriendData(); }, [userId, friendshipStatus, range, mode]);

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

  function openNewDiagramPicker() {
    setEditingDiagramId(null);
    setPendingMetrics([]);
    setPendingStyle('bar');
    setShowDiagramPicker(true);
  }

  function editDiagram(diagram: DiagramConfig) {
    setEditingDiagramId(diagram.id);
    setPendingMetrics([...diagram.metrics]);
    setPendingStyle(diagram.style);
    setShowDiagramPicker(true);
  }

  function saveDiagram() {
    if (pendingMetrics.length === 0) return;
    const nextConfigs = editingDiagramId
      ? diagramConfigs.map((diagram) => (
        diagram.id === editingDiagramId
          ? { ...diagram, metrics: [...pendingMetrics], style: pendingStyle }
          : diagram
      ))
      : [...diagramConfigs, {
        id: crypto.randomUUID(),
        metrics: [...pendingMetrics],
        style: pendingStyle,
      }];
    setDiagramConfigs(nextConfigs);
    persistDiagramConfigsToLocalStorage(nextConfigs);
    resetDiagramPicker();
  }

  function removeDiagram(id: string) {
    const nextConfigs = diagramConfigs.filter((diagram) => diagram.id !== id);
    setDiagramConfigs(nextConfigs);
    persistDiagramConfigsToLocalStorage(nextConfigs);
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
    loadFriendData();
  }

  async function removeFriend() {
    if (!friendshipId) return;
    const supabase = createClient();
    await supabase.from('friendships').delete().eq('id', friendshipId);
    setFriendshipId(null);
    setFriendshipStatus(null);
    setWeightData([]);
    setMacroData([]);
    setTodayLogs([]);
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

  // Group today's logs by meal
  const mealGroups: Record<MealType, (FoodLog & { food: Food })[]> = {
    breakfast: [],
    lunch: [],
    snack: [],
    dinner: [],
  };
  for (const log of todayLogs) {
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
                  ? `Your friend request is pending. Once ${displayName} accepts, you'll be able to see their dashboards.`
                  : `${displayName} sent you a friend request. Accept it to view their dashboards.`
                : `Add ${displayName} as a friend to view their dashboards.`
              }
            </p>
          </div>
        </Card>
      )}

      {/* Friend data */}
      {isFriend && (
        <>
          {mode === 'gym' ? (
            <GymDashboard viewerId={userId} />
          ) : (
            <>
              {/* Range selector */}
              <div className="flex gap-2 flex-wrap">
                {RANGES.map(({ label, days }) => (
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
              </div>

              {dataLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
                </div>
              ) : (
                <>
                  <Card title="Weight Progress">
                    <WeightChart data={weightData} />
                  </Card>

                  <Card title="Daily Calories">
                    <CalorieChart data={macroData} />
                  </Card>

                  <Card title="Daily Macros (Protein / Carbs / Fats)">
                    <MacroChart data={macroData} />
                  </Card>

                  <Card title="Custom Diagrams">
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

                  {/* Today's food log */}
                  <Card title={`Today's Food Log — ${format(new Date(), 'MMM d, yyyy')}`}>
                    {todayLogs.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        {displayName} has not logged any food today.
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
              <label htmlFor="friend-diagram-style" className="text-sm font-medium text-gray-700 mb-2 block">
                Diagram style
              </label>
              <select
                id="friend-diagram-style"
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
