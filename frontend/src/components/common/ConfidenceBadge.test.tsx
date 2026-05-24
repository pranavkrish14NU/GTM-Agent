import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfidenceBadge } from './ConfidenceBadge.js';

describe('ConfidenceBadge', () => {
  it('renders High label for high level', () => {
    render(<ConfidenceBadge level="high" />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveTextContent('High');
    expect(badge).toHaveAttribute('data-level', 'high');
  });

  it('renders Medium label for medium level', () => {
    render(<ConfidenceBadge level="medium" />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveTextContent('Medium');
    expect(badge).toHaveAttribute('data-level', 'medium');
  });

  it('renders Low label for low level', () => {
    render(<ConfidenceBadge level="low" />);
    const badge = screen.getByTestId('confidence-badge');
    expect(badge).toHaveTextContent('Low');
    expect(badge).toHaveAttribute('data-level', 'low');
  });

  it('has aria-label with confidence level', () => {
    render(<ConfidenceBadge level="high" />);
    expect(screen.getByTestId('confidence-badge')).toHaveAttribute(
      'aria-label',
      'Confidence: High',
    );
  });

  it('applies extra className', () => {
    render(<ConfidenceBadge level="high" className="extra" />);
    expect(screen.getByTestId('confidence-badge').className).toContain('extra');
  });
});
