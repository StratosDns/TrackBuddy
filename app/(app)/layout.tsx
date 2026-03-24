import Navigation from '@/components/Navigation';
import { cookies } from 'next/headers';
import { MODE_COOKIE, normalizeMode } from '@/lib/mode';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const mode = normalizeMode(cookieStore.get(MODE_COOKIE)?.value);

  return (
    <div className="flex min-h-screen">
      <Navigation initialMode={mode} />
      {/* Main content - offset for desktop sidebar */}
      <main className="flex-1 md:ml-64 pt-16 md:pt-0 pb-20 md:pb-0">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
