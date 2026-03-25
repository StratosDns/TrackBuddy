'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, Legend, AreaChart, Area
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

export type DiagramMetric = 'calories' | 'water' | 'weight' | 'carbs' | 'fats' | 'protein';
export type DiagramStyle = 'bar' | 'line' | 'area' | 'stackedBar' | 'stepLine';

export interface DiagramChartDataPoint {
  date: string;
  calories?: number;
  water?: number;
  weight?: number;
  carbs?: number;
  fats?: number;
  protein?: number;
}

export const DIAGRAM_METRIC_META: Record<DiagramMetric, { label: string; color: string; unit: string }> = {
  calories: { label: 'Calories', color: '#f97316', unit: 'kcal' },
  water: { label: 'Water', color: '#06b6d4', unit: 'ml' },
  weight: { label: 'Weight', color: '#3b82f6', unit: 'kg' },
  carbs: { label: 'Carbs', color: '#eab308', unit: 'g' },
  fats: { label: 'Fats', color: '#ef4444', unit: 'g' },
  protein: { label: 'Protein', color: '#8b5cf6', unit: 'g' },
};

export interface VisibleMacros {
  protein: boolean;
  carbs: boolean;
  fats: boolean;
}

function formatDiagramTooltipValue(value: string | number, metric: DiagramMetric) {
  const { label, unit } = DIAGRAM_METRIC_META[metric];
  return [`${value} ${unit}`, label];
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

export function CustomDiagramChart({
  data,
  metrics,
  style,
}: {
  data: DiagramChartDataPoint[];
  metrics: DiagramMetric[];
  style: DiagramStyle;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        No data available in selected date range
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        Select at least one metric
      </div>
    );
  }

  const sharedElements = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
      <XAxis
        dataKey="date"
        tickFormatter={(v) => format(parseISO(v), 'MMM d')}
        tick={{ fontSize: 11 }}
      />
      <YAxis tick={{ fontSize: 11 }} />
      <Tooltip
        labelFormatter={(l) => format(parseISO(l as string), 'MMM d, yyyy')}
        formatter={(v, _name, item) =>
          formatDiagramTooltipValue(v as string | number, item.dataKey as DiagramMetric)
        }
      />
      <Legend />
    </>
  );

  return (
    <ResponsiveContainer width="100%" height={240}>
      {style === 'line' ? (
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          {sharedElements}
          {metrics.map((metric) => (
            <Line
              key={metric}
              type="monotone"
              dataKey={metric}
              name={DIAGRAM_METRIC_META[metric].label}
              stroke={DIAGRAM_METRIC_META[metric].color}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      ) : style === 'stepLine' ? (
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          {sharedElements}
          {metrics.map((metric) => (
            <Line
              key={metric}
              type="stepAfter"
              dataKey={metric}
              name={DIAGRAM_METRIC_META[metric].label}
              stroke={DIAGRAM_METRIC_META[metric].color}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      ) : style === 'area' ? (
        <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          {sharedElements}
          {metrics.map((metric) => (
            <Area
              key={metric}
              type="monotone"
              dataKey={metric}
              name={DIAGRAM_METRIC_META[metric].label}
              stroke={DIAGRAM_METRIC_META[metric].color}
              fill={DIAGRAM_METRIC_META[metric].color}
              fillOpacity={0.2}
              connectNulls
            />
          ))}
        </AreaChart>
      ) : style === 'stackedBar' ? (
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          {sharedElements}
          {metrics.map((metric) => (
            <Bar
              key={metric}
              dataKey={metric}
              stackId="diagram-stack"
              name={DIAGRAM_METRIC_META[metric].label}
              fill={DIAGRAM_METRIC_META[metric].color}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      ) : (
        <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          {sharedElements}
          {metrics.map((metric) => (
            <Bar
              key={metric}
              dataKey={metric}
              name={DIAGRAM_METRIC_META[metric].label}
              fill={DIAGRAM_METRIC_META[metric].color}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
