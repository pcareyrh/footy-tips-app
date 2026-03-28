import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConfidenceBadge from '../ConfidenceBadge';

describe('ConfidenceBadge', () => {
  it('renders "Low Confidence" for level=low', () => {
    render(<ConfidenceBadge level="low" />);
    expect(screen.getByText('Low Confidence')).toBeInTheDocument();
  });

  it('renders "Medium Confidence" for level=medium', () => {
    render(<ConfidenceBadge level="medium" />);
    expect(screen.getByText('Medium Confidence')).toBeInTheDocument();
  });

  it('renders "High Confidence" for level=high', () => {
    render(<ConfidenceBadge level="high" />);
    expect(screen.getByText('High Confidence')).toBeInTheDocument();
  });

  it('uses danger (red) variant for low', () => {
    render(<ConfidenceBadge level="low" />);
    const el = screen.getByText('Low Confidence');
    expect(el.className).toContain('text-red-400');
  });

  it('uses warning (amber) variant for medium', () => {
    render(<ConfidenceBadge level="medium" />);
    const el = screen.getByText('Medium Confidence');
    expect(el.className).toContain('text-amber-400');
  });

  it('uses success (emerald) variant for high', () => {
    render(<ConfidenceBadge level="high" />);
    const el = screen.getByText('High Confidence');
    expect(el.className).toContain('text-emerald-400');
  });

  it('renders "Very High Confidence" for level="very high"', () => {
    render(<ConfidenceBadge level="very high" />);
    expect(screen.getByText('Very High Confidence')).toBeInTheDocument();
  });

  it('uses success (emerald) variant for "very high"', () => {
    render(<ConfidenceBadge level="very high" />);
    const el = screen.getByText('Very High Confidence');
    expect(el.className).toContain('text-emerald-400');
  });

  it('does not crash when level is "very high" (regression: blank screen bug)', () => {
    // confidence="very high" is stored by itipfooty.ts via VERY_HIGH.toLowerCase()
    // and was missing from confidenceConfig, causing a TypeError that blanked the Matches page
    expect(() => render(<ConfidenceBadge level="very high" />)).not.toThrow();
  });
});
