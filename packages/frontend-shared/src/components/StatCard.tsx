'use client';

import React from 'react';
import Card from './Card';

interface StatCardProps {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down';
  className?: string;
}

export default function StatCard({ icon, label, value, change, trend, className = '' }: StatCardProps) {
  return (
    <Card padding="md" className={className}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-[var(--color-text-secondary)] text-sm mb-1">{label}</p>
          <p className="text-[var(--font-size-xl)] font-bold text-[var(--color-text)]">{value}</p>
          {change !== undefined && (
            <p className={`text-sm mt-1 ${trend === 'up' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
              {trend === 'up' ? '↑' : '↓'} {Math.abs(change)}%
            </p>
          )}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center text-[var(--color-primary)]">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}