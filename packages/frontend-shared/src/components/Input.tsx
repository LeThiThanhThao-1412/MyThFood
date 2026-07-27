'use client';

import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <input
        className={`w-full px-3 py-2 border rounded-lg text-base outline-none transition-colors
          ${error ? 'border-[var(--color-error)] focus:ring-2 focus:ring-red-200' : 'border-gray-300 focus:border-[var(--color-primary)] focus:ring-2 focus:ring-orange-100'}
          disabled:bg-gray-50 disabled:text-gray-500 ${className}`}
        {...props}
      />
      {error && <p className="text-[var(--color-error)] text-sm mt-1">{error}</p>}
    </div>
  );
}

// Skeleton
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

export function StatCardSkeleton() {
  return <div className="bg-white rounded-xl shadow-md p-4"><Skeleton className="h-4 w-20 mb-3" /><Skeleton className="h-8 w-24 mb-2" /><Skeleton className="h-3 w-12" /></div>;
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b border-gray-100">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
      ))}
    </tr>
  );
}

export function CardSkeleton() {
  return <div className="bg-white rounded-xl shadow-md overflow-hidden"><Skeleton className="h-32 w-full" /><div className="p-4"><Skeleton className="h-4 w-2/3 mb-2" /><Skeleton className="h-3 w-1/2" /></div></div>;
}

// EmptyState
interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <span className="text-5xl mb-4">{icon}</span>
      <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">{title}</h3>
      {description && <p className="text-[var(--color-text-secondary)] text-center mb-4">{description}</p>}
      {action && (
        <button onClick={action.onClick} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-dark)] transition-colors">
          {action.label}
        </button>
      )}
    </div>
  );
}

// ErrorState
interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = 'Có lỗi xảy ra', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <span className="text-5xl mb-4">⚠️</span>
      <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">Đã có lỗi</h3>
      <p className="text-[var(--color-text-secondary)] text-center mb-4">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-dark)] transition-colors">
          Thử lại
        </button>
      )}
    </div>
  );
}