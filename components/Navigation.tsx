'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Calendar, BookOpen, User, Apple, Users, Dumbbell } from 'lucide-react';
import { format } from 'date-fns';
import { AppMode, MODE_COOKIE } from '@/lib/mode';

interface NavigationProps {
  initialMode: AppMode;
}

export default function Navigation({ initialMode }: NavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isOnGymRoute = pathname === '/gym' || pathname.startsWith('/gym/');
  const isGymMode = isOnGymRoute || initialMode === 'gym';
  const activeClasses = isGymMode ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700';
  const mobileActiveClasses = isGymMode ? 'text-red-600' : 'text-green-600';
  const iconBg = isGymMode ? 'bg-red-600' : 'bg-green-600';
  const BrandIcon = isGymMode ? Dumbbell : Apple;
  const navItems = [
    { href: '/dashboard', label: 'Calendar', icon: Calendar },
    { href: `/log/${format(new Date(), 'yyyy-MM-dd')}`, label: 'Today', icon: BookOpen },
    { href: isGymMode ? '/gym' : '/foods', label: isGymMode ? 'My Exercises' : 'My Foods', icon: isGymMode ? Dumbbell : Apple },
    { href: '/friends', label: 'Friends', icon: Users },
    { href: '/profile', label: 'Profile', icon: User },
  ];

  function setModeCookie(nextMode: AppMode) {
    document.cookie = `${MODE_COOKIE}=${nextMode}; path=/; max-age=31536000; samesite=lax`;
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  }

  function toggleWorld() {
    const nextMode: AppMode = isGymMode ? 'diet' : 'gym';
    setModeCookie(nextMode);

    if (pathname === '/gym' || pathname.startsWith('/gym/')) {
      router.push(nextMode === 'diet' ? '/foods' : '/gym');
      return;
    }
    if (pathname === '/foods' || pathname.startsWith('/foods/')) {
      router.push(nextMode === 'gym' ? '/gym' : '/foods');
      return;
    }
    router.refresh();
  }

  return (
    <>
      {/* Desktop top bar */}
      <header
        className={`hidden md:flex fixed top-0 left-0 right-0 z-40 border-b px-6 py-3 items-center gap-6 ${
          isGymMode
            ? 'bg-gradient-to-b from-red-100 to-red-50 border-red-200'
            : 'bg-gradient-to-b from-green-100 to-green-50 border-green-200'
        }`}
      >
        <div className="flex items-center gap-2 shrink-0">
          <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center`}>
            <BrandIcon className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-gray-900">TrackBuddy</span>
        </div>

        <nav className="flex-1 grid grid-flow-col auto-cols-fr items-center">
          {navItems.map(({ href, label }) => {
            const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`text-center px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active ? activeClasses : 'text-gray-700 hover:bg-white/70 hover:text-gray-900'
                }`}
              >
                {label}
              </Link>
            );
          })}
          <button
            onClick={handleSignOut}
            className="text-center px-2 py-2 rounded-lg text-sm font-medium text-red-700 hover:bg-red-100/80 transition-colors"
          >
            Sign Out
          </button>
        </nav>

        <button
          onClick={toggleWorld}
          title={`Switch to ${isGymMode ? 'diet' : 'gym'} world`}
          aria-label={`Switch to ${isGymMode ? 'diet' : 'gym'} world`}
          role="switch"
          aria-checked={isGymMode}
          className={`relative inline-flex h-8 w-16 items-center rounded-full p-1 transition-colors shrink-0 ${
            isGymMode ? 'bg-red-100' : 'bg-green-100'
          }`}
        >
          <span
            className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
              isGymMode ? 'translate-x-8' : ''
            }`}
          />
        </button>
      </header>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 ${iconBg} rounded-md flex items-center justify-center`}>
            <BrandIcon className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900">TrackBuddy</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={toggleWorld}
            title={`Switch to ${isGymMode ? 'diet' : 'gym'} world`}
            aria-label={`Switch to ${isGymMode ? 'diet' : 'gym'} world`}
            role="switch"
            aria-checked={isGymMode}
            className={`relative inline-flex h-7 w-14 items-center rounded-full p-1 transition-colors ${
              isGymMode ? 'bg-red-100' : 'bg-green-100'
            }`}
          >
            <span
              className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
                isGymMode ? 'translate-x-7' : ''
              }`}
            />
          </button>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 flex">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center py-2 text-xs font-medium transition-colors
                ${active ? mobileActiveClasses : 'text-gray-500'}`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
