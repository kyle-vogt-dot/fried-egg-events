'use client';

import Link from 'next/link';

const MANAGE_TABS = [
  { key: 'manage', label: 'Manage', path: 'manage' },
  { key: 'pairings', label: 'Pairings', path: 'pairings' },
  { key: 'income', label: 'Income', path: 'income' },
] as const;

const DAY_TABS = [
  { key: 'check-in', label: 'Check-in', path: 'check-in' },
  { key: 'lineup', label: 'Lineup', path: 'lineup' },
  { key: 'scoring', label: 'Scoring', path: 'scoring' },
  { key: 'leaderboard', label: 'Leaderboard', path: 'leaderboard' },
  { key: 'scorecards', label: 'Scorecards', path: 'scorecards' },
  { key: 'contacts', label: 'Contacts', path: 'contacts' },
] as const;

export default function EventTabs({
  eventId,
  variant,
  active,
}: {
  eventId: string;
  variant: 'manage' | 'dayof';
  active: string;
}) {
  const tabs = variant === 'manage' ? MANAGE_TABS : DAY_TABS;
  return (
    <nav className="flex flex-wrap gap-x-1 border-b border-gray-700 mb-6">
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Link
            key={`${variant}-${tab.key}`}
            href={`/event/${eventId}/${tab.path}`}
            className={`px-3 sm:px-4 py-3 text-sm font-medium whitespace-nowrap ${
              isActive
                ? 'text-white border-b-2 border-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
