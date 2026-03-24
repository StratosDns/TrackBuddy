import DayLog from '@/components/log/DayLog';
import WorkoutLog from '@/components/log/WorkoutLog';
import { cookies } from 'next/headers';
import { MODE_COOKIE, normalizeMode } from '@/lib/mode';

interface Props {
  params: Promise<{ date: string }>;
}

export default async function LogPage({ params }: Props) {
  const { date } = await params;
  const cookieStore = await cookies();
  const mode = normalizeMode(cookieStore.get(MODE_COOKIE)?.value);
  return mode === 'gym' ? <WorkoutLog date={date} /> : <DayLog date={date} />;
}
