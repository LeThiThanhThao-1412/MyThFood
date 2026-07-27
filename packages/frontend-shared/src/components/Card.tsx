'use client';

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  padding?: 'sm' | 'md' | 'lg';
  hover?: boolean;
  className?: string;
  onClick?: () => void;
}

const paddingStyles = { sm: 'p-3', md: 'p-4', lg: 'p-6' };

export default function Card({ children, padding = 'md', hover = false, className = '', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-[var(--color-surface)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)]
        ${paddingStyles[padding]}
        ${hover ? 'cursor-pointer hover:shadow-[var(--shadow-lg)] transition-shadow' : ''}
        ${onClick ? 'cursor-pointer' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}