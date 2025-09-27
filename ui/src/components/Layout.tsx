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
  { name: 'Overview', href: '/', icon: LayoutDashboard },
  { name: 'Sources', href: '/sources', icon: Database },
  { name: 'Destinations', href: '/destinations', icon: Send },
  { name: 'Live Events', href: '/events', icon: Activity },
  { name: 'Transformations', href: '/transformations', icon: Code },
  { name: 'Users', href: '/users', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Mobile sidebar */}
      <div className={cn(
        "fixed inset-0 flex z-40 md:hidden",
        sidebarOpen ? "block" : "hidden"
      )}>
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
        <div className="relative flex-1 flex flex-col max-w-xs w-full bg-background border-r border-border/50">
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
        <div className="flex flex-col w-60">
          <div className="flex flex-col flex-grow bg-background border-r border-border/50 overflow-y-auto">
            <SidebarContent />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/* Minimal top bar */}
        <div className="relative z-10 flex-shrink-0 flex h-12 bg-background/95 backdrop-blur-sm border-b border-border/50">
          <button
            className="px-4 text-muted-foreground hover:text-foreground focus:outline-none md:hidden transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex-1 px-6 flex justify-end items-center">
            <div className="flex items-center space-x-1">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 focus:outline-none transition-all duration-200"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Main content area */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none bg-background">
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
      <div className="flex items-center px-6 py-6">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-semibold text-sm">C</span>
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Cairo CDP</h1>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3">
        <div className="space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  'group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200 ease-in-out',
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <item.icon
                  className={cn(
                    'mr-3 flex-shrink-0 h-4 w-4 transition-colors',
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground group-hover:text-foreground'
                  )}
                />
                <span className="truncate">{item.name}</span>
                {isActive && (
                  <ChevronRight className="ml-auto h-3 w-3 text-muted-foreground" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border/50">
        <div className="text-xs text-muted-foreground">
          <p className="font-medium">Cairo CDP</p>
          <p className="mt-1">v1.0.0 • Open Source</p>
        </div>
      </div>
    </div>
  );
}