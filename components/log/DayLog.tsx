'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import {
  Food, FoodLog, WeightLog, WaterLog, MealType,
  calcMacros, sumMacros, ZERO_MACROS, MEAL_LABELS, MEAL_ORDER, DayMacros
} from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import MacroBadge from '@/components/ui/MacroBadge';
import Input from '@/components/ui/Input';
import { Plus, Trash2, Scale, Droplets, Search, Globe, Pencil, Check, X } from 'lucide-react';

interface Props {
  date: string;
}

type LogEntry = FoodLog & { food: Food };

export default function DayLog({ date }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [weight, setWeight] = useState<WeightLog | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [water, setWater] = useState<WaterLog | null>(null);
  const [waterInput, setWaterInput] = useState('');
  const [addingMeal, setAddingMeal] = useState<MealType | null>(null);
  const [loading, setLoading] = useState(true);
  const [foodLogUpdateError, setFoodLogUpdateError] = useState('');

  const loadData = useCallback(async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [logsRes, foodsRes, weightRes, waterRes] = await Promise.all([
      supabase.from('food_logs').select('*, food:foods(*)').eq('user_id', user.id).eq('date', date),
      supabase.from('foods').select('*').eq('user_id', user.id).order('name'),
      supabase.from('weight_logs').select('*').eq('user_id', user.id).eq('date', date).maybeSingle(),
      supabase.from('water_logs').select('*').eq('user_id', user.id).eq('date', date).maybeSingle(),
    ]);

    setLogs((logsRes.data as LogEntry[]) || []);
    setFoods(foodsRes.data || []);
    setWeight(weightRes.data || null);
    setWeightInput(weightRes.data?.weight_kg?.toString() || '');
    setWater(waterRes.data || null);
    setWaterInput(waterRes.data?.water_ml != null ? (waterRes.data.water_ml / 1000).toString() : '');
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

  async function saveWater() {
    const liters = parseFloat(waterInput);
    if (isNaN(liters) || liters <= 0) return;
    const waterMl = liters * 1000;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (water) {
      await supabase.from('water_logs').update({ water_ml: waterMl }).eq('id', water.id);
    } else {
      await supabase.from('water_logs').insert({ user_id: user.id, date, water_ml: waterMl });
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
        <div className="flex items-center gap-3 flex-wrap">
          {/* Weight logger */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2">
            <Scale className="w-4 h-4 text-blue-500 shrink-0" />
            <input
              type="number"
              step="0.01"
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
          {/* Water logger */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2">
            <Droplets className="w-4 h-4 text-cyan-500 shrink-0" />
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Water (L)"
              value={waterInput}
              onChange={(e) => setWaterInput(e.target.value)}
              className="w-28 text-sm outline-none text-gray-700 placeholder-gray-400"
            />
            <Button size="sm" variant="secondary" onClick={saveWater}>
              Save
            </Button>
          </div>
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
          onUpdate={async (id, amountG) => {
            const supabase = createClient();
            setFoodLogUpdateError('');
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
              setFoodLogUpdateError('You must be signed in to edit a food entry.');
              return;
            }
            const { data, error } = await supabase
              .from('food_logs')
              .update({ amount_g: amountG })
              .eq('id', id)
              .eq('user_id', user.id)
              .select('id');
            if (!error && data && data.length > 0) {
              setLogs((prev) => prev.map((log) => (log.id === id ? { ...log, amount_g: amountG } : log)));
            } else {
              setFoodLogUpdateError('Unable to update this food entry. Please refresh and try again.');
            }
          }}
          onAdded={loadData}
          adding={addingMeal === meal}
          onToggleAdd={() => setAddingMeal(addingMeal === meal ? null : meal)}
        />
      ))}
      {foodLogUpdateError && <p className="text-xs text-red-600">{foodLogUpdateError}</p>}
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
  onUpdate: (id: string, amountG: number) => Promise<void>;
  onAdded: () => void;
  adding: boolean;
  onToggleAdd: () => void;
}

type FoodSearchTab = 'my-foods' | 'explore';
// These are strings because HTML input `min`/`step` attributes expect string values.
// Pieces support fractional edits, while grams allow whole-number stepping from 0.
const PIECES_MIN = '0.1';
const PIECES_STEP = '0.1';
const GRAMS_MIN = '0';
const GRAMS_STEP = '1';
const EXACT_MATCH_SCORE = 0;
const PREFIX_MATCH_SCORE = 1;
const WORD_PREFIX_MATCH_SCORE = 2;
const CONTAINS_MATCH_SCORE = 3;
const EMPTY_SEARCH_SCORE = 4;

function MealSection({ meal, logs, macros, foods, date, onDelete, onUpdate, onAdded, adding, onToggleAdd }: MealSectionProps) {
  const [foodSearchTab, setFoodSearchTab] = useState<FoodSearchTab>('my-foods');
  const [foodId, setFoodId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [amountUnit, setAmountUnit] = useState<'grams' | 'pieces'>('grams');
  const [saving, setSaving] = useState(false);
  const [exploreSearch, setExploreSearch] = useState('');
  const [exploreFoods, setExploreFoods] = useState<Food[]>([]);
  const [exploreLoading, setExploreLoading] = useState(false);
  const [selectedExploreFood, setSelectedExploreFood] = useState<Food | null>(null);
  const [myFoodSearch, setMyFoodSearch] = useState('');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingAmountInput, setEditingAmountInput] = useState('');
  const [editingAmountUnit, setEditingAmountUnit] = useState<'grams' | 'pieces'>('grams');
  const filteredMyFoods = useMemo(() => {
    const trimmed = myFoodSearch.trim().toLowerCase();
    return foods.filter((food) => !trimmed || food.name.toLowerCase().includes(trimmed));
  }, [foods, myFoodSearch]);
  const recommendedMyFoods = useMemo(() => {
    const trimmed = myFoodSearch.trim().toLowerCase();
    const getScore = (food: Food) => {
      if (!trimmed) return EMPTY_SEARCH_SCORE;
      const name = food.name.toLowerCase();
      if (name === trimmed) return EXACT_MATCH_SCORE;
      if (name.startsWith(trimmed)) return PREFIX_MATCH_SCORE;
      if (name.split(/\s+/).some((part) => part.startsWith(trimmed))) return WORD_PREFIX_MATCH_SCORE;
      return CONTAINS_MATCH_SCORE;
    };

    return filteredMyFoods
      .map((food) => ({ food, score: getScore(food) }))
      .sort((a, b) => {
        const scoreDiff = a.score - b.score;
        if (scoreDiff !== 0) return scoreDiff;
        return a.food.name.localeCompare(b.food.name);
      })
      .slice(0, 8)
      .map(({ food }) => food);
  }, [filteredMyFoods, myFoodSearch]);

  const selectedFood = foodSearchTab === 'my-foods'
    ? foods.find((f) => f.id === foodId)
    : selectedExploreFood ?? undefined;
  const parsedPieceWeightG = selectedFood?.piece_weight_g != null
    ? Number(selectedFood.piece_weight_g)
    : null;
  const isPieceFood = selectedFood?.input_basis === 'per_piece';
  const hasPieceWeight = isPieceFood && !!parsedPieceWeightG && parsedPieceWeightG > 0;
  const pieceWeightG: number | null = hasPieceWeight ? parsedPieceWeightG : null;
  const canLogByPieces = pieceWeightG !== null;
  const parsedAmount = parseFloat(amountInput);
  const amountInGrams =
    Number.isNaN(parsedAmount) || parsedAmount <= 0
      ? null
      : canLogByPieces && amountUnit === 'pieces'
        ? parsedAmount * pieceWeightG!
        : parsedAmount;
  const preview = selectedFood && amountInGrams ? calcMacros(selectedFood, amountInGrams) : null;

  const formatLoggedQuantity = (food: Food | undefined, amountG: number) => {
    const parsedPieceWeightG = food?.piece_weight_g != null
      ? Number(food.piece_weight_g)
      : null;
    const canShowPieces = food?.input_basis === 'per_piece' && !!parsedPieceWeightG && parsedPieceWeightG > 0;
    const amount = canShowPieces ? amountG / parsedPieceWeightG : amountG;
    const rounded = Math.round(amount * 10) / 10;
    const formatted = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toString();
    return canShowPieces ? formatted : `${formatted}g`;
  };

  const getEditablePieceWeight = (food: Food | undefined): number | null => {
    const parsed = food?.piece_weight_g != null ? Number(food.piece_weight_g) : null;
    if (food?.input_basis !== 'per_piece') return null;
    if (!parsed || parsed <= 0) return null;
    return parsed;
  };

  useEffect(() => {
    if (foodSearchTab !== 'explore') return;
    let cancelled = false;
    const supabase = createClient();
    const run = async () => {
      setExploreLoading(true);
      let q = supabase
        .from('foods')
        .select('*')
        .eq('is_public', true)
        .order('name')
        .limit(50);
      if (exploreSearch.trim()) {
        q = q.ilike('name', `%${exploreSearch.trim()}%`);
      }
      const { data } = await q;
      if (!cancelled) {
        setExploreFoods(data || []);
        setExploreLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [foodSearchTab, exploreSearch]);

  async function addEntry() {
    const logFoodId = foodSearchTab === 'my-foods' ? foodId : selectedExploreFood?.id;
    if (!logFoodId || !amountInput || !amountInGrams) return;

    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    await supabase.from('food_logs').insert({
      user_id: user.id,
      date,
      meal_type: meal,
      food_id: logFoodId,
      amount_g: amountInGrams,
    });

    setFoodId('');
    setAmountInput('');
    setAmountUnit('grams');
    setSelectedExploreFood(null);
    setExploreSearch('');
    setMyFoodSearch('');
    setSaving(false);
    onAdded();
    onToggleAdd();
  }

  function beginEdit(log: LogEntry) {
    const editablePieceWeight = getEditablePieceWeight(log.food);
    const canUsePieces = editablePieceWeight !== null;
    const amountValue = canUsePieces ? log.amount_g / editablePieceWeight : log.amount_g;
    const rounded = Math.round(amountValue * 10) / 10;

    setEditingLogId(log.id);
    setEditingAmountUnit(canUsePieces ? 'pieces' : 'grams');
    setEditingAmountInput(Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toString());
  }

  function cancelEdit() {
    setEditingLogId(null);
    setEditingAmountInput('');
    setEditingAmountUnit('grams');
  }

  async function saveEdit(log: LogEntry) {
    const parsedAmount = parseFloat(editingAmountInput);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) return;

    const editablePieceWeight = getEditablePieceWeight(log.food);
    const canUsePieces = editablePieceWeight !== null;
    const amountG = canUsePieces && editingAmountUnit === 'pieces'
      ? parsedAmount * editablePieceWeight
      : parsedAmount;

    await onUpdate(log.id, amountG);
    cancelEdit();
  }

  return (
    <Card>
      <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          {/* My Foods / Explore tabs */}
          <div className="flex gap-1 border-b border-gray-200">
            <button
              type="button"
              onClick={() => {
                setFoodSearchTab('my-foods');
                setSelectedExploreFood(null);
                setAmountInput('');
                setAmountUnit('grams');
                setMyFoodSearch('');
              }}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px
                ${foodSearchTab === 'my-foods' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              My Foods
            </button>
            <button
              type="button"
              onClick={() => {
                setFoodSearchTab('explore');
                setFoodId('');
                setAmountInput('');
                setAmountUnit('grams');
                setMyFoodSearch('');
              }}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px flex items-center gap-1
                ${foodSearchTab === 'explore' ? 'border-green-600 text-green-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <Globe className="w-3 h-3" />
              Explore
            </button>
          </div>

          {foodSearchTab === 'my-foods' && (
            <div className="flex flex-col gap-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search your foods…"
                  value={myFoodSearch}
                  onChange={(e) => setMyFoodSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {recommendedMyFoods.length === 0 ? (
                  myFoodSearch.trim() ? (
                    <p className="text-xs text-gray-500">No food recommendations match your search.</p>
                  ) : null
                ) : (
                  recommendedMyFoods.map((food) => (
                    <button
                      key={food.id}
                      type="button"
                      onClick={() => {
                        setFoodId(food.id);
                        setAmountInput('');
                        setAmountUnit(food.input_basis === 'per_piece' ? 'pieces' : 'grams');
                        setMyFoodSearch(food.name);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        foodId === food.id
                          ? 'border-green-300 bg-green-50 text-green-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {food.name}
                    </button>
                  ))
                )}
              </div>
              <label className="text-sm font-medium text-gray-700">Select food</label>
              <select
                value={foodId}
                onChange={(e) => {
                  const nextFoodId = e.target.value;
                  const nextFood = foods.find((f) => f.id === nextFoodId);
                  setFoodId(nextFoodId);
                  setAmountInput('');
                  setAmountUnit(nextFood?.input_basis === 'per_piece' ? 'pieces' : 'grams');
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
              >
                <option value="">-- Choose a food --</option>
                {filteredMyFoods.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.calories_per_100g} kcal/100g)
                  </option>
                ))}
              </select>
              {foods.length === 0 && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                  No custom foods yet. Go to <strong>My Foods</strong> to add some, or use <strong>Explore</strong> to log public foods!
                </p>
              )}
              {foods.length > 0 && filteredMyFoods.length === 0 && (
                <p className="text-xs text-gray-500 bg-gray-100 rounded-lg px-3 py-2 border border-gray-200">
                  No personal foods match your search. Try a different term or add foods in My Foods.
                </p>
              )}
            </div>
          )}

          {foodSearchTab === 'explore' && (
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search public foods…"
                  value={exploreSearch}
                  onChange={(e) => { setExploreSearch(e.target.value); setSelectedExploreFood(null); setAmountInput(''); }}
                  className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
                />
              </div>
              {exploreLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full" />
                </div>
              ) : exploreFoods.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">
                  {exploreSearch ? 'No public foods match your search.' : 'No public foods available.'}
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                  {exploreFoods.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setSelectedExploreFood(f);
                        setAmountInput('');
                        setAmountUnit(f.input_basis === 'per_piece' ? 'pieces' : 'grams');
                      }}
                      className={`text-left px-3 py-2 rounded-lg text-sm transition-colors border
                        ${selectedExploreFood?.id === f.id
                          ? 'bg-green-50 border-green-300 text-green-800'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'}`}
                    >
                      <span className="font-medium">{f.name}</span>
                      <span className="text-gray-400 text-xs ml-2">{f.calories_per_100g} kcal/100g</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {canLogByPieces && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Enter amount as</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAmountUnit('pieces')}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    amountUnit === 'pieces'
                      ? 'bg-green-50 border-green-300 text-green-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Pieces
                </button>
                <button
                  type="button"
                  onClick={() => setAmountUnit('grams')}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                    amountUnit === 'grams'
                      ? 'bg-green-50 border-green-300 text-green-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Grams
                </button>
              </div>
            </div>
          )}
          {selectedFood && (
            <>
              <Input
                label={canLogByPieces && amountUnit === 'pieces' ? 'Amount (pieces)' : 'Amount (g)'}
                type="number"
                min={canLogByPieces && amountUnit === 'pieces' ? '0.1' : '1'}
                step={canLogByPieces && amountUnit === 'pieces' ? '0.1' : '1'}
                placeholder={canLogByPieces && amountUnit === 'pieces' ? 'e.g. 1.5' : 'e.g. 150'}
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
              />
              {canLogByPieces && amountUnit === 'pieces' && amountInGrams && (
                <p className="text-xs text-gray-500">
                  This equals {Math.round(amountInGrams * 10) / 10}g ({pieceWeightG!}g per piece).
                </p>
              )}
              {selectedFood?.input_basis === 'per_piece' && !hasPieceWeight && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                  This food is missing piece-weight metadata, so piece-based logging is unavailable.
                  Edit this food in <strong>My Foods</strong> and set piece weight to enable logging by piece.
                </p>
              )}
              {preview && (
                <div className="text-xs text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <MacroBadge {...preview} compact />
                </div>
              )}
            </>
          )}
          <Button
            size="sm"
            onClick={addEntry}
            loading={saving}
            disabled={foodSearchTab === 'my-foods' ? (!foodId || !amountInput) : (!selectedExploreFood || !amountInput)}
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
            const ingredientRows = log.food?.ingredient_rows ?? [];
            const shouldShowIngredients = Boolean(log.food?.created_from_ingredients && ingredientRows.length > 0);
            return (
              <div
                key={log.id}
                className="py-2 border-b border-gray-50 last:border-0"
              >
                <div className="flex flex-wrap items-start gap-2 sm:items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600 shrink-0">
                        {formatLoggedQuantity(log.food, log.amount_g)}
                      </span>
                      <p className="text-sm font-medium text-gray-800 truncate">{log.food?.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {editingLogId === log.id ? (
                      <>
                        <button
                          onClick={cancelEdit}
                          className="text-gray-400 hover:text-gray-600 transition-colors p-1"
                          title="Cancel edit"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => saveEdit(log)}
                          className="text-gray-400 hover:text-green-600 transition-colors p-1"
                          title="Save edit"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => beginEdit(log)}
                        className="text-gray-400 hover:text-blue-500 transition-colors p-1"
                        title="Edit amount"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(log.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-1"
                      title="Delete entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {macros && (
                    <div className="basis-full sm:basis-auto">
                      <MacroBadge {...macros} compact />
                    </div>
                  )}
                </div>
                {editingLogId === log.id && (
                  <div className="mt-2 flex flex-col gap-2">
                    {getEditablePieceWeight(log.food) !== null ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingAmountUnit('pieces')}
                          className={`px-3 py-1 rounded-lg border text-xs transition-colors ${
                            editingAmountUnit === 'pieces'
                              ? 'bg-green-50 border-green-300 text-green-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          Pieces
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingAmountUnit('grams')}
                          className={`px-3 py-1 rounded-lg border text-xs transition-colors ${
                            editingAmountUnit === 'grams'
                              ? 'bg-green-50 border-green-300 text-green-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          Grams
                        </button>
                      </div>
                    ) : null}
                    <input
                      type="number"
                      min={editingAmountUnit === 'pieces' ? PIECES_MIN : GRAMS_MIN}
                      step={editingAmountUnit === 'pieces' ? PIECES_STEP : GRAMS_STEP}
                      value={editingAmountInput}
                      onChange={(e) => setEditingAmountInput(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
                    />
                  </div>
                )}
                {shouldShowIngredients && (
                  <div className="mt-2 ml-1 pl-3 border-l-2 border-gray-100 flex flex-col gap-1">
                    <p className="text-xs font-medium text-gray-500">Ingredients</p>
                    {ingredientRows.map((row) => {
                      const ingredientFood = foods.find((food) => food.id === row.food_id);
                      if (!ingredientFood) return null;
                      const ingredientMacros = calcMacros(ingredientFood, row.amount_g);
                      return (
                        <div key={`${log.id}-${row.food_id}-${row.amount_g}`} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs text-gray-700 truncate">{ingredientFood.name}</p>
                            <p className="text-xs text-gray-400">{row.amount_g}g</p>
                          </div>
                          <MacroBadge {...ingredientMacros} compact />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
