'use client';

import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, Legend, AreaChart, Area, ReferenceLine, LabelList
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
export type DiagramMetricUnits = Partial<Record<DiagramMetric, string>>;

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
  water: { label: 'Water', color: '#06b6d4', unit: 'L' },
  weight: { label: 'Weight', color: '#3b82f6', unit: 'kg' },
  carbs: { label: 'Carbs', color: '#eab308', unit: 'g' },
  fats: { label: 'Fats', color: '#ef4444', unit: 'g' },
  protein: { label: 'Protein', color: '#8b5cf6', unit: 'g' },
};

export const DIAGRAM_METRIC_UNIT_OPTIONS: Record<DiagramMetric, string[]> = {
  calories: ['kcal', 'kJ'],
  water: ['L', 'ml'],
  weight: ['kg', 'lb'],
  carbs: ['g', 'oz'],
  fats: ['g', 'oz'],
  protein: ['g', 'oz'],
};

const L_TO_ML = 1000;
const KG_TO_LB = 2.2046226218;
const KCAL_TO_KJ = 4.184;
const G_TO_OZ = 0.0352739619;
const VALUE_DECIMALS = 100;

export interface VisibleMacros {
  protein: boolean;
  carbs: boolean;
  fats: boolean;
}

interface MacroTargets {
  protein?: number | null;
  carbs?: number | null;
  fats?: number | null;
}

export function getDiagramMetricUnit(metric: DiagramMetric, units?: DiagramMetricUnits) {
  const selected = units?.[metric];
  if (selected && DIAGRAM_METRIC_UNIT_OPTIONS[metric].includes(selected)) return selected;
  return DIAGRAM_METRIC_META[metric].unit;
}

export function normalizeDiagramMetricUnits(value: unknown): DiagramMetricUnits {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([metric, unit]) => (
      metric in DIAGRAM_METRIC_UNIT_OPTIONS
      && typeof unit === 'string'
      && DIAGRAM_METRIC_UNIT_OPTIONS[metric as DiagramMetric].includes(unit)
    ))
    .map(([metric, unit]) => [metric as DiagramMetric, unit as string]);
  return Object.fromEntries(entries);
}

function convertDiagramValue(metric: DiagramMetric, value: number, units?: DiagramMetricUnits) {
  const unit = getDiagramMetricUnit(metric, units);
  if (metric === 'water') {
    return unit === 'ml' ? value * L_TO_ML : value;
  }
  if (metric === 'weight') {
    return unit === 'lb' ? value * KG_TO_LB : value;
  }
  if (metric === 'calories') {
    return unit === 'kJ' ? value * KCAL_TO_KJ : value;
  }
  if (metric === 'carbs' || metric === 'fats' || metric === 'protein') {
    return unit === 'oz' ? value * G_TO_OZ : value;
  }
  return value;
}

function formatDiagramTooltipValue(
  value: string | number,
  metric: DiagramMetric,
  units?: DiagramMetricUnits
) {
  const label = DIAGRAM_METRIC_META[metric].label;
  const unit = getDiagramMetricUnit(metric, units);
  if (typeof value !== 'number') {
    return [`${value} ${unit}`, label];
  }
  return [`${Math.round(value * VALUE_DECIMALS) / VALUE_DECIMALS} ${unit}`, label];
}

export function WeightChart({
  data,
  showValueLabels = false,
}: {
  data: WeightChartData[];
  showValueLabels?: boolean;
}) {
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
          label={showValueLabels ? { position: 'top', fontSize: 10, fill: '#6b7280' } : false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CalorieChart({
  data,
  showValueLabels = false,
}: {
  data: MacroChartData[];
  showValueLabels?: boolean;
}) {
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
        <Bar dataKey="calories" fill="#f97316" radius={[4, 4, 0, 0]}>
          {showValueLabels && (
            <LabelList dataKey="calories" position="top" fontSize={10} fill="#6b7280" />
          )}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MacroChart({
  data,
  visibleMacros = { protein: true, carbs: true, fats: true },
  targets,
  showValueLabels = false,
}: {
  data: MacroChartData[];
  visibleMacros?: VisibleMacros;
  targets?: MacroTargets;
  showValueLabels?: boolean;
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
        {visibleMacros.protein && typeof targets?.protein === 'number' && targets.protein > 0 && (
          <ReferenceLine y={targets.protein} stroke="#3b82f6" strokeDasharray="4 4" label={{ value: 'Protein target', position: 'right', fill: '#3b82f6', fontSize: 10 }} />
        )}
        {visibleMacros.carbs && typeof targets?.carbs === 'number' && targets.carbs > 0 && (
          <ReferenceLine y={targets.carbs} stroke="#eab308" strokeDasharray="4 4" label={{ value: 'Carbs target', position: 'right', fill: '#ca8a04', fontSize: 10 }} />
        )}
        {visibleMacros.fats && typeof targets?.fats === 'number' && targets.fats > 0 && (
          <ReferenceLine y={targets.fats} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Fats target', position: 'right', fill: '#dc2626', fontSize: 10 }} />
        )}
        {visibleMacros.protein && (
          <Bar dataKey="protein" fill="#3b82f6" name="Protein" radius={[4, 4, 0, 0]}>
            {showValueLabels && (
              <LabelList dataKey="protein" position="top" fontSize={10} fill="#6b7280" />
            )}
          </Bar>
        )}
        {visibleMacros.carbs && (
          <Bar dataKey="carbs" fill="#eab308" name="Carbs" radius={[4, 4, 0, 0]}>
            {showValueLabels && (
              <LabelList dataKey="carbs" position="top" fontSize={10} fill="#6b7280" />
            )}
          </Bar>
        )}
        {visibleMacros.fats && (
          <Bar dataKey="fats" fill="#ef4444" name="Fats" radius={[4, 4, 0, 0]}>
            {showValueLabels && (
              <LabelList dataKey="fats" position="top" fontSize={10} fill="#6b7280" />
            )}
          </Bar>
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CustomDiagramChart({
  data,
  metrics,
  style,
  metricUnits,
  macroTargets,
  showValueLabels = false,
}: {
  data: DiagramChartDataPoint[];
  metrics: DiagramMetric[];
  style: DiagramStyle;
  metricUnits?: DiagramMetricUnits;
  macroTargets?: MacroTargets;
  showValueLabels?: boolean;
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

  const chartData = data.map((point) => {
    const next: DiagramChartDataPoint & Record<string, number | string | undefined> = { ...point };
    for (const metric of metrics) {
      const rawValue = point[metric];
      next[`${metric}__display`] = typeof rawValue === 'number'
        ? convertDiagramValue(metric, rawValue, metricUnits)
        : undefined;
    }
    return next;
  });

  const yAxisUnit = metrics.length === 1 ? getDiagramMetricUnit(metrics[0], metricUnits) : undefined;

  const sharedElements = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
      <XAxis
        dataKey="date"
        tickFormatter={(v) => format(parseISO(v), 'MMM d')}
        tick={{ fontSize: 11 }}
      />
      <YAxis tick={{ fontSize: 11 }} unit={yAxisUnit} />
      <Tooltip
        labelFormatter={(l) => format(parseISO(l as string), 'MMM d, yyyy')}
        formatter={(v, _name, item) => {
          const metric = String(item.dataKey).replace('__display', '') as DiagramMetric;
          return formatDiagramTooltipValue(v as string | number, metric, metricUnits);
        }}
      />
      <Legend />
      {metrics.includes('protein') && typeof macroTargets?.protein === 'number' && macroTargets.protein > 0 && (
        <ReferenceLine y={convertDiagramValue('protein', macroTargets.protein, metricUnits)} stroke={DIAGRAM_METRIC_META.protein.color} strokeDasharray="4 4" label={{ value: 'Protein target', position: 'right', fill: DIAGRAM_METRIC_META.protein.color, fontSize: 10 }} />
      )}
      {metrics.includes('carbs') && typeof macroTargets?.carbs === 'number' && macroTargets.carbs > 0 && (
        <ReferenceLine y={convertDiagramValue('carbs', macroTargets.carbs, metricUnits)} stroke={DIAGRAM_METRIC_META.carbs.color} strokeDasharray="4 4" label={{ value: 'Carbs target', position: 'right', fill: DIAGRAM_METRIC_META.carbs.color, fontSize: 10 }} />
      )}
      {metrics.includes('fats') && typeof macroTargets?.fats === 'number' && macroTargets.fats > 0 && (
        <ReferenceLine y={convertDiagramValue('fats', macroTargets.fats, metricUnits)} stroke={DIAGRAM_METRIC_META.fats.color} strokeDasharray="4 4" label={{ value: 'Fats target', position: 'right', fill: DIAGRAM_METRIC_META.fats.color, fontSize: 10 }} />
      )}
    </>
  );

  return (
    <ResponsiveContainer width="100%" height={240}>
      {style === 'line' ? (
        <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          {sharedElements}
          {metrics.map((metric) => (
            <Line
              key={metric}
              type="monotone"
              dataKey={`${metric}__display`}
              name={`${DIAGRAM_METRIC_META[metric].label} (${getDiagramMetricUnit(metric, metricUnits)})`}
              stroke={DIAGRAM_METRIC_META[metric].color}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
              label={showValueLabels ? { position: 'top', fontSize: 10, fill: '#6b7280' } : false}
            />
          ))}
        </LineChart>
      ) : style === 'stepLine' ? (
        <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          {sharedElements}
          {metrics.map((metric) => (
            <Line
              key={metric}
              type="stepAfter"
              dataKey={`${metric}__display`}
              name={`${DIAGRAM_METRIC_META[metric].label} (${getDiagramMetricUnit(metric, metricUnits)})`}
              stroke={DIAGRAM_METRIC_META[metric].color}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls
              label={showValueLabels ? { position: 'top', fontSize: 10, fill: '#6b7280' } : false}
            />
          ))}
        </LineChart>
      ) : style === 'area' ? (
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          {sharedElements}
          {metrics.map((metric) => (
            <Area
              key={metric}
              type="monotone"
              dataKey={`${metric}__display`}
              name={`${DIAGRAM_METRIC_META[metric].label} (${getDiagramMetricUnit(metric, metricUnits)})`}
              stroke={DIAGRAM_METRIC_META[metric].color}
              fill={DIAGRAM_METRIC_META[metric].color}
              fillOpacity={0.2}
              connectNulls
            >
              {showValueLabels && (
                <LabelList dataKey={`${metric}__display`} position="top" fontSize={10} fill="#6b7280" />
              )}
            </Area>
          ))}
        </AreaChart>
      ) : style === 'stackedBar' ? (
        <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          {sharedElements}
          {metrics.map((metric) => (
            <Bar
              key={metric}
              dataKey={`${metric}__display`}
              stackId="diagram-stack"
              name={`${DIAGRAM_METRIC_META[metric].label} (${getDiagramMetricUnit(metric, metricUnits)})`}
              fill={DIAGRAM_METRIC_META[metric].color}
              radius={[4, 4, 0, 0]}
            >
              {showValueLabels && (
                <LabelList dataKey={`${metric}__display`} position="top" fontSize={10} fill="#6b7280" />
              )}
            </Bar>
          ))}
        </BarChart>
      ) : (
        <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          {sharedElements}
          {metrics.map((metric) => (
            <Bar
              key={metric}
              dataKey={`${metric}__display`}
              name={`${DIAGRAM_METRIC_META[metric].label} (${getDiagramMetricUnit(metric, metricUnits)})`}
              fill={DIAGRAM_METRIC_META[metric].color}
              radius={[4, 4, 0, 0]}
            >
              {showValueLabels && (
                <LabelList dataKey={`${metric}__display`} position="top" fontSize={10} fill="#6b7280" />
              )}
            </Bar>
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}
