'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const navigationItems = [
  { href: '/', label: 'スクリーニング', icon: '🔍' },
  { href: '/pts', label: 'PTS', icon: '📈' },
  { href: '/realtime', label: 'リアルタイム', icon: '⚡' },
  { href: '/earnings', label: '決算', icon: '📊' },
  { href: '/orders', label: '受注', icon: '📋' },
  { href: '/takapi', label: 'たかぴー情報', icon: '💡' },
  { href: '/settings', label: '設定', icon: '⚙️' },
];

export function Navigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="bg-white shadow-sm border-b sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          {/* ロゴ/タイトル */}
          <Link href="/" className="text-lg font-bold text-gray-900 shrink-0">
            株スクリーナー
          </Link>

          {/* デスクトップナビ */}
          <div className="hidden md:flex space-x-1">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'px-3 py-2 text-sm font-medium transition-colors rounded-md',
                    isActive
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* モバイルハンバーガー */}
          <button
            className="md:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="メニュー"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* モバイルメニュー */}
        {isOpen && (
          <div className="md:hidden pb-3 border-t mt-1">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-3 text-sm font-medium transition-colors rounded-md',
                    isActive
                      ? 'text-blue-600 bg-blue-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  )}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
}
