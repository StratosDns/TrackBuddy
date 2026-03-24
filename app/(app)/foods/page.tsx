'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm, Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/client';
import { Food } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Plus, Trash2, Pencil, X, Check, Search, Globe } from 'lucide-react';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  calories_per_100g: z.coerce.number().min(0).max(9000),
  protein_per_100g: z.coerce.number().min(0).max(100),
  carbs_per_100g: z.coerce.number().min(0).max(100),
  fats_per_100g: z.coerce.number().min(0).max(100),
  is_public: z.boolean(),
});

type FormData = z.infer<typeof schema>;

type ActiveTab = 'my-foods' | 'public-foods';
type InputBasis = 'per_100g' | 'per_100ml' | 'per_piece';
type IngredientRow = { foodId: string; amountG: string };
type PersistedIngredientRow = { food_id: string; amount_g: number };

const BASIS_LABELS: Record<InputBasis, string> = {
  per_100g: '100g',
  per_100ml: '100ml',
  per_piece: '1 piece',
};

function roundToOneDecimalPlace(value: number): number {
  return Math.round(value * 10) / 10;
}

function FoodCard({
  food,
  onEdit,
  onDelete,
  showActions = true,
}: {
  food: Food;
  onEdit?: (food: Food) => void;
  onDelete?: (id: string) => void;
  showActions?: boolean;
}) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="font-semibold text-gray-800 leading-tight truncate">{food.name}</h3>
          {food.is_public && (
            <span title="Public food" className="inline-flex">
              <Globe className="w-3.5 h-3.5 text-green-500 shrink-0" />
            </span>
          )}
        </div>
        {showActions && onEdit && onDelete && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onEdit(food)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {deleteConfirm ? (
              <div className="flex gap-1">
                <button
                  onClick={() => { onDelete(food.id); setDeleteConfirm(false); }}
                  className="p-1.5 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-xs font-medium text-gray-400">Per 100g:</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-orange-50 rounded-lg p-2 text-center">
          <p className="font-bold text-orange-600">{food.calories_per_100g}</p>
          <p className="text-gray-400">kcal</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-2 text-center">
          <p className="font-bold text-blue-600">{food.protein_per_100g}g</p>
          <p className="text-gray-400">protein</p>
        </div>
        <div className="bg-yellow-50 rounded-lg p-2 text-center">
          <p className="font-bold text-yellow-600">{food.carbs_per_100g}g</p>
          <p className="text-gray-400">carbs</p>
        </div>
        <div className="bg-red-50 rounded-lg p-2 text-center">
          <p className="font-bold text-red-600">{food.fats_per_100g}g</p>
          <p className="text-gray-400">fats</p>
        </div>
      </div>
    </div>
  );
}

export default function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('my-foods');
  const [publicFoods, setPublicFoods] = useState<Food[]>([]);
  const [publicSearch, setPublicSearch] = useState('');
  const [publicLoading, setPublicLoading] = useState(false);
  const [inputBasis, setInputBasis] = useState<InputBasis>('per_100g');
  const [pieceWeightG, setPieceWeightG] = useState('');
  const [useIngredientBuilder, setUseIngredientBuilder] = useState(false);
  const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>([{ foodId: '', amountG: '' }]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: { is_public: false },
  });

  const isPublicValue = watch('is_public');

  const selectedBasisLabel = BASIS_LABELS[inputBasis];

  const ingredientRecipe = useMemo(() => {
    const selectedRows = ingredientRows
      .map((row) => {
        const ingredient = foods.find((food) => food.id === row.foodId);
        const amountG = parseFloat(row.amountG);
        if (!ingredient || Number.isNaN(amountG) || amountG <= 0) return null;
        return { ingredient, amountG };
      })
      .filter((row): row is { ingredient: Food; amountG: number } => row !== null);

    const totals = selectedRows.reduce(
      (acc, row) => {
        const factor = row.amountG / 100;
        acc.weightG += row.amountG;
        acc.calories += row.ingredient.calories_per_100g * factor;
        acc.protein += row.ingredient.protein_per_100g * factor;
        acc.carbs += row.ingredient.carbs_per_100g * factor;
        acc.fats += row.ingredient.fats_per_100g * factor;
        return acc;
      },
      { weightG: 0, calories: 0, protein: 0, carbs: 0, fats: 0 }
    );

    if (totals.weightG <= 0) return null;

    const per100Factor = 100 / totals.weightG;
    const per100 = {
      calories: roundToOneDecimalPlace(totals.calories * per100Factor),
      protein: roundToOneDecimalPlace(totals.protein * per100Factor),
      carbs: roundToOneDecimalPlace(totals.carbs * per100Factor),
      fats: roundToOneDecimalPlace(totals.fats * per100Factor),
    };

    return {
      per100,
      totalWeightG: roundToOneDecimalPlace(totals.weightG),
    };
  }, [foods, ingredientRows]);

  async function loadFoods() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('foods')
      .select('*')
      .eq('user_id', user.id)
      .order('name');
    setFoods(data || []);
    setLoading(false);
  }

  useEffect(() => { loadFoods(); }, []);

  async function searchPublicFoods(query: string) {
    setPublicLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setPublicLoading(false); return; }

    let q = supabase
      .from('foods')
      .select('*')
      .eq('is_public', true)
      .order('name')
      .limit(50);

    if (query.trim()) {
      q = q.ilike('name', `%${query.trim()}%`);
    }

    const { data } = await q;
    setPublicFoods(data || []);
    setPublicLoading(false);
  }

  useEffect(() => {
    if (activeTab === 'public-foods') {
      searchPublicFoods(publicSearch);
    }
  }, [activeTab, publicSearch]);

  async function onSubmit(data: FormData) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const parsedPieceWeight = parseFloat(pieceWeightG);
    let calories = data.calories_per_100g;
    let protein = data.protein_per_100g;
    let carbs = data.carbs_per_100g;
    let fats = data.fats_per_100g;

    if (useIngredientBuilder) {
      if (!ingredientRecipe) {
        alert('Please select at least one ingredient and enter a valid amount greater than 0g.');
        return;
      }
      calories = ingredientRecipe.per100.calories;
      protein = ingredientRecipe.per100.protein;
      carbs = ingredientRecipe.per100.carbs;
      fats = ingredientRecipe.per100.fats;
    } else if (inputBasis === 'per_piece') {
      if (Number.isNaN(parsedPieceWeight) || parsedPieceWeight <= 0) {
        alert('Please enter a piece weight greater than 0 grams.');
        return;
      }
      const normalizeFactor = 100 / parsedPieceWeight;
      calories = roundToOneDecimalPlace(calories * normalizeFactor);
      protein = roundToOneDecimalPlace(protein * normalizeFactor);
      carbs = roundToOneDecimalPlace(carbs * normalizeFactor);
      fats = roundToOneDecimalPlace(fats * normalizeFactor);
    }

    const persistedIngredientRows = useIngredientBuilder
      ? ingredientRows
          .map((row) => {
            const amountG = parseFloat(row.amountG);
            if (!row.foodId || Number.isNaN(amountG) || amountG <= 0) return null;
            return { food_id: row.foodId, amount_g: roundToOneDecimalPlace(amountG) };
          })
          .filter((row): row is PersistedIngredientRow => row !== null)
      : null;

    const pieceWeightToPersist =
      inputBasis === 'per_piece'
        ? useIngredientBuilder
          ? ingredientRecipe?.totalWeightG ?? null
          : !Number.isNaN(parsedPieceWeight) && parsedPieceWeight > 0
            ? parsedPieceWeight
            : null
        : null;

    const payload = {
      ...data,
      calories_per_100g: calories,
      protein_per_100g: protein,
      carbs_per_100g: carbs,
      fats_per_100g: fats,
      is_public: Boolean(isPublicValue),
      created_from_ingredients: useIngredientBuilder,
      ingredient_rows: persistedIngredientRows,
      input_basis: inputBasis,
      piece_weight_g: pieceWeightToPersist !== null
        ? roundToOneDecimalPlace(pieceWeightToPersist)
        : null,
    };

    if (editId) {
      const { error } = await supabase
        .from('foods')
        .update(payload)
        .eq('id', editId)
        .eq('user_id', user.id);
      if (error) {
        alert(error.message);
        return;
      }
      setEditId(null);
    } else {
      const { error } = await supabase.from('foods').insert({ ...payload, user_id: user.id });
      if (error) {
        alert(error.message);
        return;
      }
    }
    reset({ is_public: payload.is_public });
    setShowForm(false);
    await loadFoods();
  }

  function startEdit(food: Food) {
    setEditId(food.id);
    reset({
      name: food.name,
      calories_per_100g: food.calories_per_100g,
      protein_per_100g: food.protein_per_100g,
      carbs_per_100g: food.carbs_per_100g,
      fats_per_100g: food.fats_per_100g,
      is_public: food.is_public,
    });
    setShowForm(true);
    const isIngredientBased = Boolean(food.created_from_ingredients);
    setUseIngredientBuilder(isIngredientBased);
    setInputBasis(food.input_basis);
    setPieceWeightG(food.piece_weight_g ? String(food.piece_weight_g) : '');
    const restoredRows = (food.ingredient_rows ?? []).map((row) => ({
      foodId: row.food_id,
      amountG: String(row.amount_g),
    }));
    setIngredientRows(restoredRows.length > 0 ? restoredRows : [{ foodId: '', amountG: '' }]);
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
    reset({ is_public: false });
    setInputBasis('per_100g');
    setPieceWeightG('');
    setUseIngredientBuilder(false);
    setIngredientRows([{ foodId: '', amountG: '' }]);
  }

  async function deleteFood(id: string) {
    const supabase = createClient();
    await supabase.from('foods').delete().eq('id', id);
    setFoods((prev) => prev.filter((f) => f.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Foods</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your foods and explore public foods</p>
        </div>
        {activeTab === 'my-foods' && !showForm && (
          <Button
            onClick={() => {
              setShowForm(true);
              setEditId(null);
              reset({ is_public: false });
              setInputBasis('per_100g');
              setPieceWeightG('');
              setUseIngredientBuilder(false);
              setIngredientRows([{ foodId: '', amountG: '' }]);
            }}
          >
            <Plus className="w-4 h-4" />
            Add Food
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('my-foods')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px
            ${activeTab === 'my-foods'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
        >
          My Foods
        </button>
        <button
          onClick={() => setActiveTab('public-foods')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5
            ${activeTab === 'public-foods'
              ? 'border-green-600 text-green-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
        >
          <Globe className="w-3.5 h-3.5" />
          Public Foods
        </button>
      </div>

      {activeTab === 'my-foods' && (
        <>
          {/* Add / Edit form */}
          {showForm && (
            <Card className="mb-6" title={editId ? 'Edit Food' : 'Add New Food'}>
              <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="sm:col-span-2 lg:col-span-3">
                  <Input
                    label="Food name"
                    placeholder="e.g. Chicken Breast"
                    error={errors.name?.message}
                    {...register('name')}
                  />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">Macros are entered per:</p>
                  <div className="flex flex-wrap gap-2">
                    {(['per_100g', 'per_100ml', 'per_piece'] as InputBasis[]).map((basis) => (
                      <button
                        key={basis}
                        type="button"
                        onClick={() => setInputBasis(basis)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                          inputBasis === basis
                            ? 'bg-green-50 border-green-300 text-green-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        {BASIS_LABELS[basis]}
                      </button>
                    ))}
                  </div>
                </div>
                {!useIngredientBuilder && inputBasis === 'per_piece' && (
                  <Input
                    label="Weight of 1 piece (g)"
                    type="number"
                    step="0.1"
                    min="0.1"
                    placeholder="e.g. 250"
                    value={pieceWeightG}
                    onChange={(e) => setPieceWeightG(e.target.value)}
                  />
                )}
                <div className="sm:col-span-2 lg:col-span-3">
                  <button
                    type="button"
                    onClick={() => setUseIngredientBuilder((prev) => !prev)}
                    className="text-sm font-medium text-green-700 hover:text-green-800"
                  >
                    {useIngredientBuilder ? 'Use manual macros instead' : 'Build this meal from existing ingredients'}
                  </button>
                </div>
                {useIngredientBuilder && (
                  <div className="sm:col-span-2 lg:col-span-3 bg-gray-50 border border-gray-200 rounded-lg p-3 flex flex-col gap-3">
                    {ingredientRows.map((row, index) => (
                      <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                        <div className="sm:col-span-7">
                          <label className="text-xs text-gray-600 mb-1 block">Ingredient</label>
                          <select
                            value={row.foodId}
                            onChange={(e) =>
                              setIngredientRows((prev) =>
                                prev.map((r, i) => (i === index ? { ...r, foodId: e.target.value } : r))
                              )
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
                          >
                            <option value="">-- Choose a food --</option>
                            {foods.map((food) => (
                              <option key={food.id} value={food.id}>
                                {food.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="sm:col-span-3">
                          <label className="text-xs text-gray-600 mb-1 block">Amount (g)</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0.1"
                            value={row.amountG}
                            onChange={(e) =>
                              setIngredientRows((prev) =>
                                prev.map((r, i) => (i === index ? { ...r, amountG: e.target.value } : r))
                              )
                            }
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
                            placeholder="e.g. 120"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <button
                            type="button"
                            disabled={ingredientRows.length <= 1}
                            onClick={() => setIngredientRows((prev) => prev.filter((_, i) => i !== index))}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setIngredientRows((prev) => [...prev, { foodId: '', amountG: '' }])}
                        className="text-sm text-green-700 hover:text-green-800 font-medium"
                      >
                        + Add ingredient
                      </button>
                      {ingredientRecipe && (
                        <p className="text-xs text-gray-500">
                          Total recipe weight: {ingredientRecipe.totalWeightG}g
                        </p>
                      )}
                    </div>
                    {ingredientRecipe && inputBasis === 'per_piece' && (
                      <p className="text-xs text-gray-500">
                        For this food, 1 piece = whole recipe ({ingredientRecipe.totalWeightG}g).
                      </p>
                    )}
                    {ingredientRecipe && (
                      <p className="text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2">
                        Generated macros per {BASIS_LABELS.per_100g}: {ingredientRecipe.per100.calories} kcal,{' '}
                        {ingredientRecipe.per100.protein}g protein, {ingredientRecipe.per100.carbs}g carbs,{' '}
                        {ingredientRecipe.per100.fats}g fats
                      </p>
                    )}
                  </div>
                )}
                <Input
                  label={`Calories (per ${selectedBasisLabel})`}
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g. 165"
                  error={errors.calories_per_100g?.message}
                  {...register('calories_per_100g')}
                  disabled={useIngredientBuilder}
                />
                <Input
                  label={`Protein (g per ${selectedBasisLabel})`}
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g. 31"
                  error={errors.protein_per_100g?.message}
                  {...register('protein_per_100g')}
                  disabled={useIngredientBuilder}
                />
                <Input
                  label={`Carbs (g per ${selectedBasisLabel})`}
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g. 0"
                  error={errors.carbs_per_100g?.message}
                  {...register('carbs_per_100g')}
                  disabled={useIngredientBuilder}
                />
                <Input
                  label={`Fats (g per ${selectedBasisLabel})`}
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g. 3.6"
                  error={errors.fats_per_100g?.message}
                  {...register('fats_per_100g')}
                  disabled={useIngredientBuilder}
                />
                <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isPublicValue}
                    onClick={() => setValue('is_public', !isPublicValue)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none
                      ${isPublicValue ? 'bg-green-600' : 'bg-gray-200'}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
                        ${isPublicValue ? 'translate-x-4.5' : 'translate-x-0.5'}`}
                    />
                  </button>
                  <span className="text-sm text-gray-700 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-gray-400" />
                    Make this food public (visible to all users)
                  </span>
                </div>
                <div className="sm:col-span-2 lg:col-span-3 flex gap-3 justify-end">
                  <Button variant="secondary" type="button" onClick={cancelForm}>
                    <X className="w-4 h-4" />
                    Cancel
                  </Button>
                  <Button type="submit" loading={isSubmitting}>
                    <Check className="w-4 h-4" />
                    {editId ? 'Update Food' : 'Save Food'}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* My Foods list */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
          ) : foods.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <p className="text-gray-400 text-sm">No foods added yet.</p>
                <p className="text-gray-400 text-sm">Click &quot;Add Food&quot; to create your first food entry.</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {foods.map((food) => (
                <FoodCard
                  key={food.id}
                  food={food}
                  onEdit={startEdit}
                  onDelete={deleteFood}
                />
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'public-foods' && (
        <div className="flex flex-col gap-4">
          {/* Search box */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search public foods by name…"
              value={publicSearch}
              onChange={(e) => setPublicSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          {publicLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
          ) : publicFoods.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <Globe className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">
                  {publicSearch ? 'No public foods match your search.' : 'No public foods yet.'}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  Be the first to share a food by marking it as public!
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {publicFoods.map((food) => (
                <FoodCard key={food.id} food={food} showActions={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
