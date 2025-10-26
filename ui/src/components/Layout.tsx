import React, { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  Send,
  Settings,
  Activity,
  Users,
  Code,
  Menu,
  X,
  Moon,
  Sun,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { useTheme } from '@/hooks/useTheme';

const navigation = [
  { name: 'System Status', href: '/', icon: LayoutDashboard },
  { name: 'Integrations', href: '/integrations', icon: Send },
  { name: 'Database', href: '/database', icon: Database },
  { name: 'Live Events', href: '/events', icon: Activity },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  return (
    <div className="h-screen flex overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Mobile sidebar */}
      <div className={cn(
        "fixed inset-0 flex z-50 md:hidden",
        sidebarOpen ? "block" : "hidden"
      )}>
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        <div className="relative flex-1 flex flex-col max-w-xs w-full backdrop-blur-xl bg-slate-950/90 border-r border-white/10">
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5 text-white" />
            </button>
          </div>
          <SidebarContent />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex flex-col flex-grow backdrop-blur-xl bg-slate-950/90 border-r border-white/10 overflow-y-auto">
            <SidebarContent />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Top bar */}
        <div className="relative z-10 flex-shrink-0 flex h-14 backdrop-blur-xl bg-slate-950/90 border-b border-white/10 shadow-sm">
          <button
            className="px-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none md:hidden transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex-1 px-6 flex justify-end items-center">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Main content area */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <div className="min-h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function SidebarContent() {
  const location = useLocation();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center px-6 py-6 border-b border-gray-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/50">
            <span className="text-white font-bold text-lg">C</span>
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">Cairo CDP</h1>
            <p className="text-xs text-gray-500">System Monitor</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200',
                  isActive
                    ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                )}
              >
                <item.icon
                  className={cn(
                    'mr-3 flex-shrink-0 h-5 w-5 transition-colors',
                    isActive
                      ? 'text-cyan-400'
                      : 'text-gray-500 group-hover:text-white'
                  )}
                />
                <span className="truncate">{item.name}</span>
                {isActive && (
                  <ChevronRight className="ml-auto h-4 w-4 text-cyan-400" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-white/10">
        <div className="text-xs text-gray-500">
          <p className="font-medium text-gray-400">Cairo CDP</p>
          <p className="mt-1">v1.0.0 • System Monitor</p>
        </div>
      </div>
    </div>
  );
}