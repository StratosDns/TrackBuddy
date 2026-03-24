import CalendarView from '@/components/dashboard/CalendarView';
import GymCalendarView from '@/components/dashboard/GymCalendarView';
import { cookies } from 'next/headers';
import { MODE_COOKIE, normalizeMode } from '@/lib/mode';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const mode = normalizeMode(cookieStore.get(MODE_COOKIE)?.value);
  const isGymMode = mode === 'gym';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          {isGymMode ? 'Click any day to log your workout' : 'Click any day to log your meals'}
        </p>
      </div>
      {isGymMode ? <GymCalendarView /> : <CalendarView />}
    </div>
  );
}
