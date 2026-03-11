import { cn } from '../lib/utils';

interface CardProps {
  title?: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}

export default function Card({ title, subtitle, className, children }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-zinc-800 bg-zinc-800/50 p-5 shadow-sm',
        className
      )}
    >
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="text-base font-semibold text-white">{title}</h3>}
          {subtitle && (
            <p className="mt-0.5 text-sm text-zinc-400">{subtitle}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
