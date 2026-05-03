import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../AuthContext';
import { listLikes, listConversations } from '../api';

interface Props {
  children: ReactNode;
}

const NAV_ITEMS = [
  { to: '/',            icon: '🎲', label: 'Match',       end: true },
  { to: '/likes',       icon: '❤️', label: 'Likes',       badgeKey: 'likes' as const },
  { to: '/messages',    icon: '💬', label: 'Messages',    badgeKey: 'messages' as const },
  { to: '/events',      icon: '📆', label: 'Events' },
  { to: '/saved',       icon: '💗', label: 'Saved' },
  { to: '/profile',     icon: '👤', label: 'Profile' },
  { to: '/preferences', icon: '🎯', label: 'Preferences' },
  { to: '/settings',    icon: '⚙️', label: 'Settings' }
];

export function DashboardLayout({ children }: Props) {
  const { user, profile, logout } = useAuth();
  const [badges, setBadges] = useState<{ likes: number; messages: number }>({ likes: 0, messages: 0 });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
      listLikes().then((l) => l.received_only.length + l.mutual.length).catch(() => 0),
      listConversations().then(({ conversations }) => conversations.filter(c => c.unread).length).catch(() => 0)
    ]).then(([likes, messages]) => {
      if (!cancelled) setBadges({ likes, messages });
    });
    return () => { cancelled = true; };
  }, [user]);

  return (
    <div className="dl">
      <aside className="dl-sidebar">
        <Link to="/" className="dl-brand">
          <span className="dl-brand-mark">👀</span>
          <span className="dl-brand-text">Glimpse</span>
        </Link>

        <nav className="dl-nav">
          {NAV_ITEMS.map(item => {
            const badge = item.badgeKey ? badges[item.badgeKey] : 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `dl-nav-item ${isActive ? 'dl-nav-active' : ''}`}
              >
                <span className="dl-nav-icon">{item.icon}</span>
                <span className="dl-nav-label">{item.label}</span>
                {badge > 0 && <span className="dl-nav-badge">{badge}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="dl-user-block">
          {user ? (
            <>
              {user.premium ? (
                <Link to="/upgrade" className="dl-premium-pill dl-premium-pill-on">
                  ✨ Glimpse+
                </Link>
              ) : (
                <Link to="/upgrade" className="dl-premium-pill">
                  ✨ Get Glimpse+
                </Link>
              )}
              <div className="dl-user">
                {profile?.photo
                  ? <img src={profile.photo} alt="" className="dl-user-pic" />
                  : <div className="dl-user-pic dl-user-pic-empty">👤</div>}
                <div className="dl-user-meta">
                  <div className="dl-user-name">
                    {profile?.name || 'You'}
                    {user.premium && <span className="dl-user-premium" title="Glimpse+ member">✨</span>}
                  </div>
                  <div className="dl-user-email">{user.email}</div>
                </div>
              </div>
              <button className="dl-signout" onClick={logout}>Sign out</button>
            </>
          ) : (
            <div className="dl-auth-cta">
              <Link to="/login" className="dl-auth-link">Sign in</Link>
              <Link to="/signup" className="dl-auth-link dl-auth-link-strong">Sign up</Link>
            </div>
          )}
        </div>
      </aside>

      <main className="dl-main">{children}</main>
    </div>
  );
}
