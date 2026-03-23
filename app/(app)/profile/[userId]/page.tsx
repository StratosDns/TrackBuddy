'use client';

import { useState, useEffect } from 'react';
import { use } from 'react';
import { subDays, format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import {
  Profile, Food, FoodLog, WeightLog, FriendshipStatus,
  calcMacros, sumMacros, ZERO_MACROS, MEAL_ORDER, MEAL_LABELS, MealType,
} from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { WeightChart, CalorieChart, MacroChart } from '@/components/profile/Charts';
import { Lock, UserPlus, UserCheck, Clock, ChevronLeft, X, Check } from 'lucide-react';
import Link from 'next/link';

const RANGES = [
  { label: '7 Days', days: 7 },
  { label: '14 Days', days: 14 },
  { label: '30 Days', days: 30 },
];

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
  const [weightData, setWeightData] = useState<{ date: string; weight: number }[]>([]);
  const [macroData, setMacroData] = useState<{
    date: string; calories: number; protein: number; carbs: number; fats: number;
  }[]>([]);
  const [todayLogs, setTodayLogs] = useState<(FoodLog & { food: Food })[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

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
    if (friendshipStatus !== 'accepted') return;
    setDataLoading(true);
    const supabase = createClient();

    const startDate = format(subDays(new Date(), range - 1), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');
    const today = format(new Date(), 'yyyy-MM-dd');

    const [logsRes, weightsRes, todayRes] = await Promise.all([
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

    setTodayLogs(todayRes.data || []);
    setDataLoading(false);
  }

  useEffect(() => { loadProfileAndFriendship(); }, [userId]);
  useEffect(() => { loadFriendData(); }, [userId, friendshipStatus, range]);

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
                  ? `Your friend request is pending. Once ${displayName} accepts, you'll be able to see their macros and food logs.`
                  : `${displayName} sent you a friend request. Accept it to view their macros and food logs.`
                : `Add ${displayName} as a friend to view their daily macros and food logs.`
              }
            </p>
          </div>
        </Card>
      )}

      {/* Friend data */}
      {isFriend && (
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
    </div>
  );
}
