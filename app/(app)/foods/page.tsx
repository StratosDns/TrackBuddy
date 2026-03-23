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
import { Plus, Trash2, Pencil, X, Check } from 'lucide-react';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  calories_per_100g: z.coerce.number().min(0).max(9000),
  protein_per_100g: z.coerce.number().min(0).max(100),
  carbs_per_100g: z.coerce.number().min(0).max(100),
  fats_per_100g: z.coerce.number().min(0).max(100),
});

type FormData = z.infer<typeof schema>;

export default function FoodsPage() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) as Resolver<FormData> });

  useEffect(() => { loadFoods(); }, []);

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

  async function onSubmit(data: FormData) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editId) {
      await supabase.from('foods').update(data).eq('id', editId);
      setEditId(null);
    } else {
      await supabase.from('foods').insert({ ...data, user_id: user.id });
    }
    reset();
    setShowForm(false);
    loadFoods();
  }

  async function deleteFood(id: string) {
    const supabase = createClient();
    await supabase.from('foods').delete().eq('id', id);
    setFoods((prev) => prev.filter((f) => f.id !== id));
    setDeleteConfirm(null);
  }

  function startEdit(food: Food) {
    setEditId(food.id);
    reset({
      name: food.name,
      calories_per_100g: food.calories_per_100g,
      protein_per_100g: food.protein_per_100g,
      carbs_per_100g: food.carbs_per_100g,
      fats_per_100g: food.fats_per_100g,
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
    reset();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Foods</h1>
          <p className="text-sm text-gray-500 mt-1">Add custom foods with their nutritional info</p>
        </div>
        {!showForm && (
          <Button onClick={() => { setShowForm(true); setEditId(null); reset(); }}>
            <Plus className="w-4 h-4" />
            Add Food
          </Button>
        )}
      </div>

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

      {/* Foods list */}
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
            <div
              key={food.id}
              className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-3 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-gray-800 leading-tight">{food.name}</h3>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(food)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {deleteConfirm === food.id ? (
                    <div className="flex gap-1">
                      <button
                        onClick={() => deleteFood(food.id)}
                        className="p-1.5 rounded-lg text-white bg-red-500 hover:bg-red-600 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(food.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
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
          ))}
        </div>
      )}
    </div>
  );
}
