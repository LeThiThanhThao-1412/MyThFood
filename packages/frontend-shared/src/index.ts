// Stores
export { useAuthStore } from "./stores/auth.store";
export {
  useCartStore,
  computeUnitPrice,
  buildVariantKey,
} from "./stores/cart.store";
export type { CartItem, AddCartItemInput } from "./stores/cart.store";
export { useLocationStore } from "./stores/location.store";
export type { UserLocation } from "./stores/location.store";

// Utils
export { haversineKm, formatDistance } from "./utils/distance";
export { canAccessApp, APP_ALLOWED_ROLES } from "./utils/role-access";
export type { AppKey } from "./utils/role-access";

// Hooks
export { useAuth } from "./hooks/use-auth";
export { useNotifications } from "./hooks/use-notifications";

// Providers
export { default as AuthProvider } from "./providers/AuthProvider";

// Components
export { default as Button } from "./components/Button";
export { default as Card } from "./components/Card";
export { default as Badge } from "./components/Badge";
export { default as StatCard } from "./components/StatCard";
export { default as Input } from "./components/Input";
export {
  Skeleton,
  StatCardSkeleton,
  TableRowSkeleton,
  CardSkeleton,
  EmptyState,
  ErrorState,
} from "./components/Input";
export { DesktopSidebar } from "./components/DesktopSidebar";
export type { NavItem } from "./components/DesktopSidebar";
export { AppShell } from "./components/AppShell";
export type { AppShellProps } from "./components/AppShell";
export { default as LocationGate } from "./components/LocationGate";
export { default as NotificationBell } from "./components/NotificationBell";
export { default as Drawer } from "./components/Drawer";
export type { DrawerProps } from "./components/Drawer";
// MapView is NOT re-exported here because it imports leaflet (which accesses `window`)
// and would break SSR for ALL pages that import anything from this package.
// Import directly from '@mythfood/frontend-shared/components/MapView' with next/dynamic + ssr:false.
export type { MapLocation } from "./components/MapView";
export { ErrorBoundary } from "./components/ErrorBoundary";
