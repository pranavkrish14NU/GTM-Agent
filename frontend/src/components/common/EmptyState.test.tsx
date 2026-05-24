import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from './EmptyState.js';

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders default icon', () => {
    render(<EmptyState title="Test" />);
    expect(screen.getByText('📭')).toBeInTheDocument();
  });

  it('renders custom icon', () => {
    render(<EmptyState title="Test" icon="🚀" />);
    expect(screen.getByText('🚀')).toBeInTheDocument();
  });

  it('renders optional description', () => {
    render(<EmptyState title="T" description="Some description" />);
    expect(screen.getByText('Some description')).toBeInTheDocument();
  });

  it('renders action button and calls onClick', () => {
    const onClick = vi.fn();
    render(<EmptyState title="T" action={{ label: 'Connect', onClick }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('omits action button when action not provided', () => {
    render(<EmptyState title="T" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has role=status and aria-label', () => {
    render(<EmptyState title="Empty" />);
    const el = screen.getByTestId('empty-state');
    expect(el).toHaveAttribute('role', 'status');
    expect(el).toHaveAttribute('aria-label', 'Empty');
  });
});
