'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Calendar, BookOpen, User, Apple, LogOut, Users, Dumbbell } from 'lucide-react';
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
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 min-h-screen py-6 px-4 gap-2 fixed top-0 left-0 z-30">
        <div className="flex items-center gap-2 mb-6 px-2">
          <div className={`w-8 h-8 ${iconBg} rounded-lg flex items-center justify-center`}>
            <BrandIcon className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-gray-900">TrackBuddy</span>
          <button
            onClick={toggleWorld}
            title={`Switch to ${isGymMode ? 'diet' : 'gym'} world`}
            aria-label={`Switch to ${isGymMode ? 'diet' : 'gym'} world`}
            role="switch"
            aria-checked={isGymMode}
            className={`ml-auto relative inline-flex h-8 w-16 items-center rounded-full p-1 transition-colors ${
              isGymMode ? 'bg-red-100' : 'bg-green-100'
            }`}
          >
            <span
              className={`absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
                isGymMode ? 'translate-x-8' : ''
              }`}
            />
          </button>
        </div>

        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${active ? activeClasses : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}

        <div className="mt-auto pt-2 border-t border-gray-100">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 w-full transition-colors"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

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
