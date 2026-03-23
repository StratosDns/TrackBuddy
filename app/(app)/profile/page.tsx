'use client';

import { useState, useEffect } from 'react';
import { subDays, format, parseISO, isAfter } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { Food, FoodLog, WeightLog, Profile, calcMacros, sumMacros, ZERO_MACROS } from '@/lib/types';
import Card from '@/components/ui/Card';
import { WeightChart, CalorieChart, MacroChart, VisibleMacros } from '@/components/profile/Charts';
import { User, Pencil, Check, X } from 'lucide-react';

const RANGES = [
  { label: '7 Days', days: 7 },
  { label: '14 Days', days: 14 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
];

export default function ProfilePage() {
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
  const [macroData, setMacroData] = useState<{
    date: string; calories: number; protein: number; carbs: number; fats: number;
  }[]>([]);

  // Macro visibility toggles
  const [visibleMacros, setVisibleMacros] = useState<VisibleMacros>({
    protein: true,
    carbs: true,
    fats: true,
  });

  function toggleMacro(key: keyof VisibleMacros) {
    setVisibleMacros((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function loadData() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

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

    const [logsRes, weightsRes] = await Promise.all([
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
  }

  useEffect(() => { loadData(); }, [range, useCustomRange, customStart, customEnd]);

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

      <Card title="Weight Progress">
        <WeightChart data={weightData} />
      </Card>

      <Card title="Daily Calories">
        <CalorieChart data={macroData} />
      </Card>

      <Card
        title="Daily Macros"
        action={
          <div className="flex gap-2">
            {(['protein', 'carbs', 'fats'] as const).map((macro) => (
              <button
                key={macro}
                onClick={() => toggleMacro(macro)}
                className={`px-3 py-1 text-xs rounded-full font-medium border transition-colors
                  ${visibleMacros[macro]
                    ? macro === 'protein'
                      ? 'bg-blue-500 text-white border-blue-500'
                      : macro === 'carbs'
                        ? 'bg-yellow-400 text-white border-yellow-400'
                        : 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400'
                  }`}
              >
                {macro.charAt(0).toUpperCase() + macro.slice(1)}
              </button>
            ))}
          </div>
        }
      >
        <MacroChart data={macroData} visibleMacros={visibleMacros} />
      </Card>
    </div>
  );
}
