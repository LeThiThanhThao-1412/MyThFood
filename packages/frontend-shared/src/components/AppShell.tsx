"use client";

import { DesktopSidebar, type NavItem } from "./DesktopSidebar";

export interface AppShellProps {
  appName: string;
  appIcon: string;
  navItems: NavItem[];
  onLogout?: () => void;
  children: React.ReactNode;
}

export function AppShell({
  appName,
  appIcon,
  navItems,
  onLogout,
  children,
}: AppShellProps) {
  return (
    <div className="lg:pl-64">
      <DesktopSidebar
        appName={appName}
        appIcon={appIcon}
        navItems={navItems}
        onLogout={onLogout}
      />
      <div className="w-full">{children}</div>
    </div>
  );
}
