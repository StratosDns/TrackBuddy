import GymTracker from '@/components/gym/GymTracker';

export default function GymPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Exercises</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your exercises and use the Today tab to log workouts. Dashboard charts are now in Profile.
        </p>
      </div>
      <GymTracker />
    </div>
  );
}
