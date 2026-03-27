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
  calories: ['kcal', 'kJ', 'cal'],
  water: ['L', 'ml', 'cL', 'cups', 'fl oz'],
  weight: ['kg', 'lb', 'g'],
  carbs: ['g', 'mg', 'kg', 'oz', 'lb'],
  fats: ['g', 'mg', 'kg', 'oz', 'lb'],
  protein: ['g', 'mg', 'kg', 'oz', 'lb'],
};

const L_TO_ML = 1000;
const L_TO_CL = 100;
const KG_TO_G = 1000;
const KG_TO_LB = 2.2046226218;
const KCAL_TO_KJ = 4.184;
const KCAL_TO_SMALL_CALORIES = 1000;
const G_TO_OZ = 0.0352739619;
const G_TO_MG = 1000;
const G_TO_KG = 0.001;
const G_TO_LB = 0.00220462262;
const L_TO_CUPS = 4.22675284;
const L_TO_FL_OZ = 33.8140227;
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
  calories?: number | null;
  water?: number | null;
}

export interface DiagramAxisDomain {
  min?: number;
  max?: number;
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
    if (unit === 'ml') return value * L_TO_ML;
    if (unit === 'cL') return value * L_TO_CL;
    if (unit === 'cups') return value * L_TO_CUPS;
    if (unit === 'fl oz') return value * L_TO_FL_OZ;
    return value;
  }
  if (metric === 'weight') {
    if (unit === 'g') return value * KG_TO_G;
    return unit === 'lb' ? value * KG_TO_LB : value;
  }
  if (metric === 'calories') {
    if (unit === 'cal') return value * KCAL_TO_SMALL_CALORIES;
    return unit === 'kJ' ? value * KCAL_TO_KJ : value;
  }
  if (metric === 'carbs' || metric === 'fats' || metric === 'protein') {
    if (unit === 'mg') return value * G_TO_MG;
    if (unit === 'kg') return value * G_TO_KG;
    if (unit === 'lb') return value * G_TO_LB;
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
  const visibleMacroCount = Number(visibleMacros.protein) + Number(visibleMacros.carbs) + Number(visibleMacros.fats);
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
        {visibleMacroCount > 1 && <Legend />}
        {visibleMacros.protein && typeof targets?.protein === 'number' && targets.protein > 0 && (
          <ReferenceLine y={targets.protein} stroke={DIAGRAM_METRIC_META.protein.color} strokeDasharray="4 4" label={{ value: 'Protein target', position: 'right', fill: DIAGRAM_METRIC_META.protein.color, fontSize: 10 }} />
        )}
        {visibleMacros.carbs && typeof targets?.carbs === 'number' && targets.carbs > 0 && (
          <ReferenceLine y={targets.carbs} stroke={DIAGRAM_METRIC_META.carbs.color} strokeDasharray="4 4" label={{ value: 'Carbs target', position: 'right', fill: DIAGRAM_METRIC_META.carbs.color, fontSize: 10 }} />
        )}
        {visibleMacros.fats && typeof targets?.fats === 'number' && targets.fats > 0 && (
          <ReferenceLine y={targets.fats} stroke={DIAGRAM_METRIC_META.fats.color} strokeDasharray="4 4" label={{ value: 'Fats target', position: 'right', fill: DIAGRAM_METRIC_META.fats.color, fontSize: 10 }} />
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
  axisDomain,
  showValueLabels = false,
}: {
  data: DiagramChartDataPoint[];
  metrics: DiagramMetric[];
  style: DiagramStyle;
  metricUnits?: DiagramMetricUnits;
  macroTargets?: MacroTargets;
  axisDomain?: DiagramAxisDomain;
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
  const yAxisDomain: [number | 'auto', number | 'auto'] = [
    typeof axisDomain?.min === 'number' ? axisDomain.min : 'auto',
    typeof axisDomain?.max === 'number' ? axisDomain.max : 'auto',
  ];

  const sharedElements = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
      <XAxis
        dataKey="date"
        tickFormatter={(v) => format(parseISO(v), 'MMM d')}
        tick={{ fontSize: 11 }}
      />
      <YAxis tick={{ fontSize: 11 }} unit={yAxisUnit} domain={yAxisDomain} />
      <Tooltip
        labelFormatter={(l) => format(parseISO(l as string), 'MMM d, yyyy')}
        formatter={(v, _name, item) => {
          const metric = String(item.dataKey).replace('__display', '') as DiagramMetric;
          return formatDiagramTooltipValue(v as string | number, metric, metricUnits);
        }}
      />
      {metrics.length > 1 && <Legend />}
      {metrics.includes('protein') && typeof macroTargets?.protein === 'number' && macroTargets.protein > 0 && (
        <ReferenceLine y={convertDiagramValue('protein', macroTargets.protein, metricUnits)} stroke={DIAGRAM_METRIC_META.protein.color} strokeDasharray="4 4" label={{ value: 'Protein target', position: 'right', fill: DIAGRAM_METRIC_META.protein.color, fontSize: 10 }} />
      )}
      {metrics.includes('carbs') && typeof macroTargets?.carbs === 'number' && macroTargets.carbs > 0 && (
        <ReferenceLine y={convertDiagramValue('carbs', macroTargets.carbs, metricUnits)} stroke={DIAGRAM_METRIC_META.carbs.color} strokeDasharray="4 4" label={{ value: 'Carbs target', position: 'right', fill: DIAGRAM_METRIC_META.carbs.color, fontSize: 10 }} />
      )}
      {metrics.includes('fats') && typeof macroTargets?.fats === 'number' && macroTargets.fats > 0 && (
        <ReferenceLine y={convertDiagramValue('fats', macroTargets.fats, metricUnits)} stroke={DIAGRAM_METRIC_META.fats.color} strokeDasharray="4 4" label={{ value: 'Fats target', position: 'right', fill: DIAGRAM_METRIC_META.fats.color, fontSize: 10 }} />
      )}
      {metrics.includes('calories') && typeof macroTargets?.calories === 'number' && macroTargets.calories > 0 && (
        <ReferenceLine y={convertDiagramValue('calories', macroTargets.calories, metricUnits)} stroke={DIAGRAM_METRIC_META.calories.color} strokeDasharray="4 4" label={{ value: 'Calories target', position: 'right', fill: DIAGRAM_METRIC_META.calories.color, fontSize: 10 }} />
      )}
      {metrics.includes('water') && typeof macroTargets?.water === 'number' && macroTargets.water > 0 && (
        <ReferenceLine y={convertDiagramValue('water', macroTargets.water, metricUnits)} stroke={DIAGRAM_METRIC_META.water.color} strokeDasharray="4 4" label={{ value: 'Water target', position: 'right', fill: DIAGRAM_METRIC_META.water.color, fontSize: 10 }} />
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
