import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Card from '../Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card><p>Content</p></Card>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders title when provided', () => {
    render(<Card title="My Title"><span>body</span></Card>);
    expect(screen.getByText('My Title')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(<Card title="T" subtitle="Sub"><span>body</span></Card>);
    expect(screen.getByText('Sub')).toBeInTheDocument();
  });

  it('does not render header section when neither title nor subtitle given', () => {
    const { container } = render(<Card><span>just body</span></Card>);
    // No <div className="mb-4"> should appear
    expect(container.querySelector('.mb-4')).toBeNull();
  });

  it('applies custom className to outer div', () => {
    const { container } = render(<Card className="extra-class"><span>x</span></Card>);
    expect(container.firstChild).toHaveClass('extra-class');
  });
});
