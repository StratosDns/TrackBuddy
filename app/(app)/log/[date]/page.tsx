import DayLog from '@/components/log/DayLog';

interface Props {
  params: Promise<{ date: string }>;
}

export default async function LogPage({ params }: Props) {
  const { date } = await params;
  return <DayLog date={date} />;
}
