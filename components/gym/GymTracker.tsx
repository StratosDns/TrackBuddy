'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Exercise } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Plus, Globe } from 'lucide-react';

type ActiveTab = 'my-exercises' | 'public-exercises';

const DEFAULT_EXERCISE_FORM = { name: '', muscle_group: '', description: '', is_public: false };

export default function GymTracker() {
  const [currentUserId, setCurrentUserId] = useState('');
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [savingExercise, setSavingExercise] = useState(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('my-exercises');
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [showExerciseForm, setShowExerciseForm] = useState(false);
  const [exerciseForm, setExerciseForm] = useState(DEFAULT_EXERCISE_FORM);

  async function loadGymData() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return;
    }
    setCurrentUserId(user.id);

    const { data: exercises } = await supabase
      .from('exercises')
      .select('*')
      .or(`user_id.eq.${user.id},is_public.eq.true`)
      .order('name');

    setAllExercises((exercises || []) as Exercise[]);
  }

  useEffect(() => {
    queueMicrotask(() => {
      void loadGymData();
    });
  }, []);

  const searchableExercises = useMemo(() => {
    const trimmed = exerciseSearch.trim().toLowerCase();
    return allExercises
      .filter((exercise) => !trimmed || exercise.name.toLowerCase().includes(trimmed));
  }, [allExercises, exerciseSearch]);

  const myExercises = useMemo(
    () => searchableExercises.filter((exercise) => exercise.user_id === currentUserId),
    [searchableExercises, currentUserId]
  );
  const publicExercises = useMemo(
    () => searchableExercises.filter((exercise) => exercise.is_public),
    [searchableExercises]
  );

  async function createExercise() {
    const supabase = createClient();
    if (!exerciseForm.name.trim()) return;
    setSavingExercise(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSavingExercise(false);
      return;
    }

    const payload = {
      user_id: user.id,
      name: exerciseForm.name.trim(),
      muscle_group: exerciseForm.muscle_group.trim(),
      description: exerciseForm.description.trim(),
      is_public: exerciseForm.is_public,
      is_preset: false,
    };
    const { data, error } = await supabase.from('exercises').insert(payload).select().single();
    if (!error && data) {
      setAllExercises((prev) => [...prev, data as Exercise].sort((a, b) => a.name.localeCompare(b.name)));
      setExerciseForm(DEFAULT_EXERCISE_FORM);
      setShowExerciseForm(false);
    }
    setSavingExercise(false);
  }

  return (
    <Card>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl bg-red-50 border border-red-100 p-3">
              <p className="text-xs text-red-700 font-medium">My Exercises</p>
              <p className="text-2xl font-bold text-red-600">{myExercises.length}</p>
            </div>
            <div className="rounded-xl bg-red-50 border border-red-100 p-3">
              <p className="text-xs text-red-700 font-medium">Public Exercises</p>
              <p className="text-2xl font-bold text-red-600">{publicExercises.length}</p>
            </div>
          </div>

          <div className="flex gap-1 border-b border-gray-200">
            <button
              onClick={() => {
                setActiveTab('my-exercises');
                setShowExerciseForm(false);
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === 'my-exercises'
                  ? 'border-red-600 text-red-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              My Exercises
            </button>
            <button
              onClick={() => {
                setActiveTab('public-exercises');
                setShowExerciseForm(false);
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                activeTab === 'public-exercises'
                  ? 'border-red-600 text-red-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Explore
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <Input
              label="Search exercise"
              placeholder="Find by name..."
              value={exerciseSearch}
              onChange={(e) => setExerciseSearch(e.target.value)}
            />
            {activeTab === 'my-exercises' && (
              <Button
                variant="secondary"
                className="md:mb-0 border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => setShowExerciseForm((prev) => !prev)}
              >
                <Plus className="w-4 h-4" />
                New Exercise
              </Button>
            )}
          </div>

          {activeTab === 'my-exercises' && showExerciseForm && (
            <div className="rounded-xl border border-red-100 bg-red-50 p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input
                label="Exercise name"
                value={exerciseForm.name}
                onChange={(e) => setExerciseForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g. Incline Dumbbell Press"
              />
              <Input
                label="Muscle group"
                value={exerciseForm.muscle_group}
                onChange={(e) => setExerciseForm((prev) => ({ ...prev, muscle_group: e.target.value }))}
                placeholder="Chest"
              />
              <Input
                label="Description"
                value={exerciseForm.description}
                onChange={(e) => setExerciseForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional notes"
                className="md:col-span-2"
              />
              <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
                <input
                  type="checkbox"
                  checked={exerciseForm.is_public}
                  onChange={(e) => setExerciseForm((prev) => ({ ...prev, is_public: e.target.checked }))}
                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                />
                Make this exercise public
              </label>
              <div className="md:col-span-2">
                <Button
                  onClick={createExercise}
                  className="bg-red-600 hover:bg-red-700"
                  loading={savingExercise}
                >
                  Save Exercise
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'my-exercises' ? (
            myExercises.length === 0 ? (
              <p className="text-sm text-gray-500">No personal exercises found.</p>
            ) : (
              <div className="space-y-2">
                {myExercises.map((exercise) => (
                  <div key={exercise.id} className="rounded-xl border border-gray-200 p-3">
                    <p className="font-medium text-gray-900">{exercise.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{exercise.muscle_group || 'General'}</p>
                    {exercise.description && <p className="text-xs text-gray-600 mt-1">{exercise.description}</p>}
                    {exercise.is_public && (
                      <p className="text-xs text-red-600 mt-2 font-medium">Public</p>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : publicExercises.length === 0 ? (
            <p className="text-sm text-gray-500">No public exercises found.</p>
          ) : (
            <div className="space-y-2">
              {publicExercises.map((exercise) => (
                <div key={exercise.id} className="rounded-xl border border-gray-200 p-3">
                  <p className="font-medium text-gray-900">{exercise.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{exercise.muscle_group || 'General'}</p>
                  {exercise.description && <p className="text-xs text-gray-600 mt-1">{exercise.description}</p>}
                  {exercise.is_preset && (
                    <p className="text-xs text-red-600 mt-2 font-medium">Preset</p>
                  )}
                  {!exercise.is_preset && exercise.user_id === currentUserId && (
                    <p className="text-xs text-red-600 mt-2 font-medium">Created by you</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="rounded-xl border border-red-100 bg-red-50 p-3">
            <p className="text-xs text-red-700">
              Log workouts from the <span className="font-semibold">Today</span> tab or by choosing a date in the
              <span className="font-semibold"> Calendar</span>.
            </p>
          </div>
        </div>
    </Card>
  );
}
