'use client';

import { useState, useEffect } from 'react';
import { subDays, format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { Food, FoodLog, WeightLog, calcMacros, sumMacros, ZERO_MACROS } from '@/lib/types';
import Card from '@/components/ui/Card';
import { WeightChart, CalorieChart, MacroChart } from '@/components/profile/Charts';
import { User } from 'lucide-react';

const RANGES = [
  { label: '7 Days', days: 7 },
  { label: '14 Days', days: 14 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
];

export default function ProfilePage() {
  const [email, setEmail] = useState('');
  const [range, setRange] = useState(30);
  const [weightData, setWeightData] = useState<{ date: string; weight: number }[]>([]);
  const [macroData, setMacroData] = useState<{
    date: string; calories: number; protein: number; carbs: number; fats: number;
  }[]>([]);

  useEffect(() => { loadData(); }, [range]);

  async function loadData() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setEmail(user.email || '');

    const startDate = format(subDays(new Date(), range - 1), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');

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

    // Weight data
    const weights: WeightLog[] = weightsRes.data || [];
    setWeightData(weights.map((w) => ({ date: w.date, weight: w.weight_kg })));

    // Macro data: aggregate per day
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
          <User className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <p className="text-sm text-gray-500">{email}</p>
        </div>
      </div>

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

      <Card title="Weight Progress">
        <WeightChart data={weightData} />
      </Card>

      <Card title="Daily Calories">
        <CalorieChart data={macroData} />
      </Card>

      <Card title="Daily Macros (Protein / Carbs / Fats)">
        <MacroChart data={macroData} />
      </Card>
    </div>
  );
}
