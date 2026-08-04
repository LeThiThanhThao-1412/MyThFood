// Stores
export { useAuthStore } from './stores/auth.store';
export { useCartStore } from './stores/cart.store';
export type { CartItem } from './stores/cart.store';

// Hooks
export { useAuth } from './hooks/use-auth';

// Providers
export { default as AuthProvider } from './providers/AuthProvider';

// Components
export { default as Button } from './components/Button';
export { default as Card } from './components/Card';
export { default as Badge } from './components/Badge';
export { default as StatCard } from './components/StatCard';
export { default as Input } from './components/Input';
export { Skeleton, StatCardSkeleton, TableRowSkeleton, CardSkeleton, EmptyState, ErrorState } from './components/Input';
// MapView is NOT re-exported here because it imports leaflet (which accesses `window`)
// and would break SSR for ALL pages that import anything from this package.
// Import directly from '@mythfood/frontend-shared/components/MapView' with next/dynamic + ssr:false.
export type { MapLocation } from './components/MapView';
export { ErrorBoundary } from './components/ErrorBoundary';
