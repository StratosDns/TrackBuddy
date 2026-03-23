'use client';

import { useState, useEffect } from 'react';
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
    const payload = { ...data, is_public: Boolean(isPublicValue) };

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
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
    reset({ is_public: false });
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
          <Button onClick={() => { setShowForm(true); setEditId(null); reset({ is_public: false }); }}>
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
                <Input
                  label="Calories (per 100g)"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g. 165"
                  error={errors.calories_per_100g?.message}
                  {...register('calories_per_100g')}
                />
                <Input
                  label="Protein (g per 100g)"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g. 31"
                  error={errors.protein_per_100g?.message}
                  {...register('protein_per_100g')}
                />
                <Input
                  label="Carbs (g per 100g)"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g. 0"
                  error={errors.carbs_per_100g?.message}
                  {...register('carbs_per_100g')}
                />
                <Input
                  label="Fats (g per 100g)"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="e.g. 3.6"
                  error={errors.fats_per_100g?.message}
                  {...register('fats_per_100g')}
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
