import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkeletonLoader, CardSkeleton } from './SkeletonLoader.js';

describe('SkeletonLoader', () => {
  it('renders with default dimensions', () => {
    render(<SkeletonLoader />);
    const el = screen.getByTestId('skeleton-loader');
    expect(el).toBeInTheDocument();
    expect(el).toHaveStyle({ width: '100%', height: '1rem', borderRadius: '4px' });
  });

  it('applies custom width, height, borderRadius', () => {
    render(<SkeletonLoader width="50%" height="2rem" borderRadius="8px" />);
    const el = screen.getByTestId('skeleton-loader');
    expect(el).toHaveStyle({ width: '50%', height: '2rem', borderRadius: '8px' });
  });

  it('has accessibility attributes', () => {
    render(<SkeletonLoader />);
    const el = screen.getByTestId('skeleton-loader');
    expect(el).toHaveAttribute('role', 'status');
    expect(el).toHaveAttribute('aria-label', 'Loading');
    expect(el).toHaveAttribute('aria-busy', 'true');
  });

  it('applies extra className', () => {
    render(<SkeletonLoader className="extra" />);
    expect(screen.getByTestId('skeleton-loader').className).toContain('extra');
  });
});

describe('CardSkeleton', () => {
  it('renders with card-skeleton test id', () => {
    render(<CardSkeleton />);
    expect(screen.getByTestId('card-skeleton')).toBeInTheDocument();
  });

  it('contains multiple skeleton loaders', () => {
    render(<CardSkeleton />);
    const loaders = screen.getAllByTestId('skeleton-loader');
    expect(loaders.length).toBeGreaterThanOrEqual(3);
  });

  it('has correct accessibility attributes', () => {
    render(<CardSkeleton />);
    const card = screen.getByTestId('card-skeleton');
    expect(card).toHaveAttribute('aria-label', 'Loading card');
    expect(card).toHaveAttribute('aria-busy', 'true');
  });
});
