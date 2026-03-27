import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '../Badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Hello</Badge>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('applies default variant styles', () => {
    render(<Badge>Test</Badge>);
    const el = screen.getByText('Test');
    expect(el.className).toContain('bg-zinc-700');
    expect(el.className).toContain('text-zinc-200');
  });

  it('applies success variant styles', () => {
    render(<Badge variant="success">Success</Badge>);
    const el = screen.getByText('Success');
    expect(el.className).toContain('text-emerald-400');
  });

  it('applies warning variant styles', () => {
    render(<Badge variant="warning">Warn</Badge>);
    const el = screen.getByText('Warn');
    expect(el.className).toContain('text-amber-400');
  });

  it('applies danger variant styles', () => {
    render(<Badge variant="danger">Danger</Badge>);
    const el = screen.getByText('Danger');
    expect(el.className).toContain('text-red-400');
  });

  it('applies info variant styles', () => {
    render(<Badge variant="info">Info</Badge>);
    const el = screen.getByText('Info');
    expect(el.className).toContain('text-sky-400');
  });

  it('merges custom className', () => {
    render(<Badge className="my-custom-class">Custom</Badge>);
    const el = screen.getByText('Custom');
    expect(el.className).toContain('my-custom-class');
  });
});
