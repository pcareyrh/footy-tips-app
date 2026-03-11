import { cn } from '../lib/utils';

function hashColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

interface TeamLogoProps {
  shortName: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
};

export default function TeamLogo({ shortName, className, size = 'md' }: TeamLogoProps) {
  const bg = hashColor(shortName);

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full font-bold text-white shrink-0',
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: bg }}
    >
      {shortName.slice(0, 3).toUpperCase()}
    </div>
  );
}
