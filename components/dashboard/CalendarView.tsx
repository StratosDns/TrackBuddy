'use client';

import { useState, useEffect } from 'react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isSameMonth, isToday, subMonths, addMonths
} from 'date-fns';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { FoodLog, Food, WeightLog, calcMacros, sumMacros, ZERO_MACROS } from '@/lib/types';

interface DayData {
  calories: number;
  weight?: number;
  logged: boolean;
}

export default function CalendarView() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [dayData, setDayData] = useState<Record<string, DayData>>({});

  useEffect(() => {
    const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
    const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
    loadMonthData(start, end);
  }, [currentMonth]);

  async function loadMonthData(start: string, end: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [logsRes, weightsRes] = await Promise.all([
      supabase
        .from('food_logs')
        .select('*, food:foods(*)')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end),
      supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', start)
        .lte('date', end),
    ]);

    const logs: (FoodLog & { food: Food })[] = logsRes.data || [];
    const weights: WeightLog[] = weightsRes.data || [];

    const data: Record<string, DayData> = {};
    for (const log of logs) {
      if (!log.food) continue;
      const macros = calcMacros(log.food, log.amount_g);
      if (!data[log.date]) data[log.date] = { calories: 0, logged: true };
      const current = data[log.date];
      const sum = sumMacros({ calories: current.calories, protein: 0, carbs: 0, fats: 0 }, macros);
      data[log.date] = { ...current, calories: sum.calories, logged: true };
    }

    for (const w of weights) {
      if (!data[w.date]) data[w.date] = { calories: 0, logged: false };
      data[w.date].weight = w.weight_kg;
    }

    setDayData(data);
  }

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });
  const startPad = getDay(startOfMonth(currentMonth));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">{format(currentMonth, 'MMMM yyyy')}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCurrentMonth(new Date())}
            className="px-3 py-1.5 text-sm rounded-lg hover:bg-gray-100 text-gray-600 font-medium transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const data = dayData[dateStr];
          const today = isToday(day);
          const inMonth = isSameMonth(day, currentMonth);

          return (
            <Link
              key={dateStr}
              href={`/log/${dateStr}`}
              className={`
                relative min-h-[70px] rounded-xl p-1.5 border text-center transition-all hover:shadow-md
                ${today ? 'border-green-500 bg-green-50' : 'border-gray-100 bg-white hover:border-gray-200'}
                ${!inMonth ? 'opacity-30' : ''}
              `}
            >
              <span
                className={`text-xs font-semibold ${
                  today ? 'text-green-600' : 'text-gray-700'
                }`}
              >
                {format(day, 'd')}
              </span>
              {data?.logged && (
                <div className="mt-1">
                  <span className="block text-[10px] font-medium text-orange-500">
                    {data.calories} kcal
                  </span>
                </div>
              )}
              {data?.weight && (
                <span className="block text-[10px] text-blue-500 font-medium">
                  {data.weight}kg
                </span>
              )}
              {data?.logged && (
                <div className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 bg-green-400 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
