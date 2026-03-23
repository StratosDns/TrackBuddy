'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import {
  Food, FoodLog, WeightLog, MealType,
  calcMacros, sumMacros, ZERO_MACROS, MEAL_LABELS, MEAL_ORDER, DayMacros
} from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import MacroBadge from '@/components/ui/MacroBadge';
import Input from '@/components/ui/Input';
import { Plus, Trash2, Scale } from 'lucide-react';

interface Props {
  date: string;
}

type LogEntry = FoodLog & { food: Food };

export default function DayLog({ date }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [weight, setWeight] = useState<WeightLog | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [addingMeal, setAddingMeal] = useState<MealType | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [logsRes, foodsRes, weightRes] = await Promise.all([
      supabase.from('food_logs').select('*, food:foods(*)').eq('user_id', user.id).eq('date', date),
      supabase.from('foods').select('*').eq('user_id', user.id).order('name'),
      supabase.from('weight_logs').select('*').eq('user_id', user.id).eq('date', date).maybeSingle(),
    ]);

    setLogs((logsRes.data as LogEntry[]) || []);
    setFoods(foodsRes.data || []);
    setWeight(weightRes.data || null);
    setWeightInput(weightRes.data?.weight_kg?.toString() || '');
    setLoading(false);
  }, [date]);

  useEffect(() => { loadData(); }, [loadData]);

  async function saveWeight() {
    const val = parseFloat(weightInput);
    if (isNaN(val) || val <= 0) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (weight) {
      await supabase.from('weight_logs').update({ weight_kg: val }).eq('id', weight.id);
    } else {
      await supabase.from('weight_logs').insert({ user_id: user.id, date, weight_kg: val });
    }
    loadData();
  }

  async function deleteLog(id: string) {
    const supabase = createClient();
    await supabase.from('food_logs').delete().eq('id', id);
    setLogs((prev) => prev.filter((l) => l.id !== id));
  }

  const totalMacros = logs.reduce((acc, log) => {
    if (!log.food) return acc;
    return sumMacros(acc, calcMacros(log.food, log.amount_g));
  }, { ...ZERO_MACROS });

  const mealLogs = (meal: MealType) => logs.filter((l) => l.meal_type === meal);

  const mealMacros = (meal: MealType): DayMacros =>
    mealLogs(meal).reduce((acc, log) => {
      if (!log.food) return acc;
      return sumMacros(acc, calcMacros(log.food, log.amount_g));
    }, { ...ZERO_MACROS });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Date header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {format(parseISO(date), 'EEEE, MMMM d')}
          </h1>
          <p className="text-sm text-gray-500">{format(parseISO(date), 'yyyy')}</p>
        </div>
        {/* Weight logger */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2">
          <Scale className="w-4 h-4 text-blue-500 shrink-0" />
          <input
            type="number"
            step="0.1"
            min="1"
            placeholder="Weight (kg)"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            className="w-28 text-sm outline-none text-gray-700 placeholder-gray-400"
          />
          <Button size="sm" variant="secondary" onClick={saveWeight}>
            Save
          </Button>
        </div>
      </div>

      {/* Daily total */}
      <Card title="Daily Total">
        <MacroBadge {...totalMacros} />
      </Card>

      {/* Meal sections */}
      {MEAL_ORDER.map((meal) => (
        <MealSection
          key={meal}
          meal={meal}
          logs={mealLogs(meal)}
          macros={mealMacros(meal)}
          foods={foods}
          date={date}
          onDelete={deleteLog}
          onAdded={loadData}
          adding={addingMeal === meal}
          onToggleAdd={() => setAddingMeal(addingMeal === meal ? null : meal)}
        />
      ))}
    </div>
  );
}

// ─── MealSection ────────────────────────────────────────────────────────────

interface MealSectionProps {
  meal: MealType;
  logs: LogEntry[];
  macros: DayMacros;
  foods: Food[];
  date: string;
  onDelete: (id: string) => void;
  onAdded: () => void;
  adding: boolean;
  onToggleAdd: () => void;
}

function MealSection({ meal, logs, macros, foods, date, onDelete, onAdded, adding, onToggleAdd }: MealSectionProps) {
  const [foodId, setFoodId] = useState('');
  const [amountG, setAmountG] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedFood = foods.find((f) => f.id === foodId);
  const preview = selectedFood && amountG ? calcMacros(selectedFood, parseFloat(amountG) || 0) : null;

  async function addEntry() {
    if (!foodId || !amountG) return;
    const amount = parseFloat(amountG);
    if (isNaN(amount) || amount <= 0) return;

    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    await supabase.from('food_logs').insert({
      user_id: user.id,
      date,
      meal_type: meal,
      food_id: foodId,
      amount_g: amount,
    });

    setFoodId('');
    setAmountG('');
    setSaving(false);
    onAdded();
    onToggleAdd();
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-800 capitalize">{MEAL_LABELS[meal]}</h3>
          {logs.length > 0 && (
            <MacroBadge {...macros} compact />
          )}
        </div>
        <Button size="sm" variant={adding ? 'secondary' : 'primary'} onClick={onToggleAdd}>
          <Plus className="w-3.5 h-3.5" />
          {adding ? 'Cancel' : 'Add Food'}
        </Button>
      </div>

      {/* Add food form */}
      {adding && (
        <div className="bg-gray-50 rounded-xl p-4 mb-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Select food</label>
            <select
              value={foodId}
              onChange={(e) => setFoodId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
            >
              <option value="">-- Choose a food --</option>
              {foods.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.calories_per_100g} kcal/100g)
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Amount (g)"
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 150"
            value={amountG}
            onChange={(e) => setAmountG(e.target.value)}
          />
          {preview && (
            <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
              <MacroBadge {...preview} compact />
            </div>
          )}
          {foods.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
              No custom foods yet. Go to <strong>My Foods</strong> to add some!
            </p>
          )}
          <Button
            size="sm"
            onClick={addEntry}
            loading={saving}
            disabled={!foodId || !amountG}
          >
            Add to {MEAL_LABELS[meal]}
          </Button>
        </div>
      )}

      {/* Log entries */}
      {logs.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No entries yet</p>
      ) : (
        <div className="flex flex-col gap-2">
          {logs.map((log) => {
            const macros = log.food ? calcMacros(log.food, log.amount_g) : null;
            return (
              <div
                key={log.id}
                className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{log.food?.name}</p>
                  <p className="text-xs text-gray-400">{log.amount_g}g</p>
                </div>
                {macros && <MacroBadge {...macros} compact />}
                <button
                  onClick={() => onDelete(log.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1 shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
