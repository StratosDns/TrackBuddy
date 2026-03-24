import { cookies } from 'next/headers';
import { MODE_COOKIE, normalizeMode } from '@/lib/mode';
import ProfilePageClient from '@/components/profile/ProfilePageClient';

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const mode = normalizeMode(cookieStore.get(MODE_COOKIE)?.value);
  return <ProfilePageClient mode={mode} />;
}
