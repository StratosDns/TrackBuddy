'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, Legend
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface WeightChartData {
  date: string;
  weight: number;
}

interface MacroChartData {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface VisibleMacros {
  protein: boolean;
  carbs: boolean;
  fats: boolean;
}

export function WeightChart({ data }: { data: WeightChartData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        No weight data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => format(parseISO(v), 'MMM d')}
          tick={{ fontSize: 11 }}
        />
        <YAxis tick={{ fontSize: 11 }} domain={['auto', 'auto']} unit="kg" />
        <Tooltip
          labelFormatter={(l) => format(parseISO(l as string), 'MMM d, yyyy')}
          formatter={(v) => [`${v} kg`, 'Weight']}
        />
        <Line
          type="monotone"
          dataKey="weight"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3, fill: '#3b82f6' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CalorieChart({ data }: { data: MacroChartData[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        No calorie data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => format(parseISO(v), 'MMM d')}
          tick={{ fontSize: 11 }}
        />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          labelFormatter={(l) => format(parseISO(l as string), 'MMM d, yyyy')}
          formatter={(v) => [`${v} kcal`, 'Calories']}
        />
        <Bar dataKey="calories" fill="#f97316" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MacroChart({
  data,
  visibleMacros = { protein: true, carbs: true, fats: true },
}: {
  data: MacroChartData[];
  visibleMacros?: VisibleMacros;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        No macro data yet
      </div>
    );
  }

  const noneVisible = !visibleMacros.protein && !visibleMacros.carbs && !visibleMacros.fats;
  if (noneVisible) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        Select at least one macro to display
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => format(parseISO(v), 'MMM d')}
          tick={{ fontSize: 11 }}
        />
        <YAxis tick={{ fontSize: 11 }} unit="g" />
        <Tooltip
          labelFormatter={(l) => format(parseISO(l as string), 'MMM d, yyyy')}
          formatter={(v, name) => [`${v}g`, name]}
        />
        <Legend />
        {visibleMacros.protein && (
          <Bar dataKey="protein" fill="#3b82f6" name="Protein" radius={[4, 4, 0, 0]} />
        )}
        {visibleMacros.carbs && (
          <Bar dataKey="carbs" fill="#eab308" name="Carbs" radius={[4, 4, 0, 0]} />
        )}
        {visibleMacros.fats && (
          <Bar dataKey="fats" fill="#ef4444" name="Fats" radius={[4, 4, 0, 0]} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
