import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from './ErrorState.js';

describe('ErrorState', () => {
  it('renders default message', () => {
    render(<ErrorState />);
    expect(screen.getByText('Something went wrong. Please try again.')).toBeInTheDocument();
  });

  it('renders custom message', () => {
    render(<ErrorState message="Custom error" />);
    expect(screen.getByText('Custom error')).toBeInTheDocument();
  });

  it('renders retry button when onRetry provided', () => {
    render(<ErrorState onRetry={vi.fn()} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('calls onRetry when button clicked', () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits retry button when onRetry not provided', () => {
    render(<ErrorState />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('has role=alert', () => {
    render(<ErrorState />);
    expect(screen.getByTestId('error-state')).toHaveAttribute('role', 'alert');
  });
});
