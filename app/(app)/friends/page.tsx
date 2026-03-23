'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Profile, Friendship } from '@/lib/types';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Users, Search, UserPlus, Check, X, UserCheck, Clock, ChevronRight } from 'lucide-react';
import Link from 'next/link';

type Tab = 'friends' | 'requests' | 'find';

interface FriendWithProfile extends Friendship {
  friendProfile: Profile;
}

export default function FriendsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('friends');

  // Friends list
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(true);

  // Pending requests
  const [sentRequests, setSentRequests] = useState<FriendWithProfile[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendWithProfile[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);

  // Find users
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  async function loadFriendships() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('friendships')
      .select('*, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .order('created_at', { ascending: false });

    const rows = (data || []) as (Friendship & { requester: Profile; addressee: Profile })[];

    const accepted: FriendWithProfile[] = [];
    const sent: FriendWithProfile[] = [];
    const received: FriendWithProfile[] = [];

    for (const row of rows) {
      const friendProfile = row.requester_id === user.id ? row.addressee : row.requester;
      const entry: FriendWithProfile = { ...row, friendProfile };
      if (row.status === 'accepted') {
        accepted.push(entry);
      } else if (row.status === 'pending') {
        if (row.requester_id === user.id) {
          sent.push(entry);
        } else {
          received.push(entry);
        }
      }
    }

    setFriends(accepted);
    setSentRequests(sent);
    setReceivedRequests(received);
    setFriendsLoading(false);
    setRequestsLoading(false);
  }

  useEffect(() => { loadFriendships(); }, []);

  async function searchUsers(query: string) {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSearchLoading(false); return; }

    const { data } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', user.id)
      .or(`username.ilike.%${query.trim()}%,display_name.ilike.%${query.trim()}%`)
      .limit(20);

    setSearchResults(data || []);
    setSearchLoading(false);
  }

  useEffect(() => {
    const timer = setTimeout(() => searchUsers(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  async function sendRequest(addresseeId: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('friendships').insert({
      requester_id: user.id,
      addressee_id: addresseeId,
      status: 'pending',
    });
    loadFriendships();
    searchUsers(searchQuery);
  }

  async function acceptRequest(friendshipId: string) {
    const supabase = createClient();
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId);
    loadFriendships();
  }

  async function rejectRequest(friendshipId: string) {
    const supabase = createClient();
    await supabase.from('friendships').update({ status: 'rejected' }).eq('id', friendshipId);
    loadFriendships();
  }

  async function removeFriend(friendshipId: string) {
    const supabase = createClient();
    await supabase.from('friendships').delete().eq('id', friendshipId);
    loadFriendships();
  }

  async function cancelRequest(friendshipId: string) {
    const supabase = createClient();
    await supabase.from('friendships').delete().eq('id', friendshipId);
    loadFriendships();
    searchUsers(searchQuery);
  }

  const pendingCount = receivedRequests.length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
          <Users className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Friends</h1>
          <p className="text-sm text-gray-500">Connect with others and compare progress</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {([
          { id: 'friends', label: 'Friends', badge: friends.length },
          { id: 'requests', label: 'Requests', badge: pendingCount },
          { id: 'find', label: 'Find People', badge: 0 },
        ] as { id: Tab; label: string; badge: number }[]).map(({ id, label, badge }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5
              ${activeTab === id
                ? 'border-green-600 text-green-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
          >
            {label}
            {badge > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-semibold
                ${id === 'requests' && pendingCount > 0
                  ? 'bg-red-100 text-red-600'
                  : 'bg-gray-100 text-gray-500'
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Friends tab */}
      {activeTab === 'friends' && (
        <>
          {friendsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
          ) : friends.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <UserCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">No friends yet.</p>
                <p className="text-gray-400 text-sm mt-1">
                  Go to{' '}
                  <button onClick={() => setActiveTab('find')} className="text-green-600 hover:underline">
                    Find People
                  </button>{' '}
                  to send a friend request!
                </p>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {friends.map((f) => (
                <div
                  key={f.id}
                  className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-3 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-green-700">
                        {(f.friendProfile.display_name || f.friendProfile.username).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate">
                        {f.friendProfile.display_name || f.friendProfile.username}
                      </p>
                      <p className="text-xs text-gray-400">@{f.friendProfile.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/profile/${f.friendProfile.id}`}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                    >
                      View Profile
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                    <button
                      onClick={() => removeFriend(f.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="Remove friend"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Requests tab */}
      {activeTab === 'requests' && (
        <>
          {requestsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
          ) : receivedRequests.length === 0 && sentRequests.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">No pending friend requests.</p>
              </div>
            </Card>
          ) : (
            <div className="flex flex-col gap-6">
              {receivedRequests.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Received ({receivedRequests.length})
                  </h2>
                  <div className="flex flex-col gap-3">
                    {receivedRequests.map((r) => (
                      <div
                        key={r.id}
                        className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-blue-700">
                              {(r.friendProfile.display_name || r.friendProfile.username).charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 truncate">
                              {r.friendProfile.display_name || r.friendProfile.username}
                            </p>
                            <p className="text-xs text-gray-400">@{r.friendProfile.username}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button onClick={() => acceptRequest(r.id)}>
                            <Check className="w-4 h-4" />
                            Accept
                          </Button>
                          <Button variant="secondary" onClick={() => rejectRequest(r.id)}>
                            <X className="w-4 h-4" />
                            Decline
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sentRequests.length > 0 && (
                <div>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Sent ({sentRequests.length})
                  </h2>
                  <div className="flex flex-col gap-3">
                    {sentRequests.map((r) => (
                      <div
                        key={r.id}
                        className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-sm font-bold text-gray-500">
                              {(r.friendProfile.display_name || r.friendProfile.username).charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 truncate">
                              {r.friendProfile.display_name || r.friendProfile.username}
                            </p>
                            <p className="text-xs text-gray-400">@{r.friendProfile.username}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Pending
                          </span>
                          <button
                            onClick={() => cancelRequest(r.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Cancel request"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Find People tab */}
      {activeTab === 'find' && (
        <div className="flex flex-col gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by username or display name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          {searchLoading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
          )}

          {!searchLoading && searchQuery && searchResults.length === 0 && (
            <Card>
              <div className="text-center py-8">
                <Search className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">No users found for &quot;{searchQuery}&quot;</p>
              </div>
            </Card>
          )}

          {!searchLoading && !searchQuery && (
            <Card>
              <div className="text-center py-8">
                <UserPlus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">Search for users to add as friends.</p>
              </div>
            </Card>
          )}

          {!searchLoading && searchResults.length > 0 && (
            <div className="flex flex-col gap-3">
              {searchResults.map((p) => {
                const alreadyFriend = friends.some((f) => f.friendProfile.id === p.id);
                const sentPending = sentRequests.some((r) => r.friendProfile.id === p.id);
                const receivedPending = receivedRequests.some((r) => r.friendProfile.id === p.id);

                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-green-700">
                          {(p.display_name || p.username).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate">
                          {p.display_name || p.username}
                        </p>
                        <p className="text-xs text-gray-400">@{p.username}</p>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {alreadyFriend ? (
                        <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                          <UserCheck className="w-4 h-4" />
                          Friends
                        </span>
                      ) : sentPending ? (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Request sent
                        </span>
                      ) : receivedPending ? (
                        <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Respond in Requests
                        </span>
                      ) : (
                        <Button onClick={() => sendRequest(p.id)}>
                          <UserPlus className="w-4 h-4" />
                          Add Friend
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
