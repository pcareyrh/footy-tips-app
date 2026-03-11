import Badge from './Badge';

const confidenceConfig = {
  low: { label: 'Low', variant: 'danger' as const },
  medium: { label: 'Medium', variant: 'warning' as const },
  high: { label: 'High', variant: 'success' as const },
};

interface ConfidenceBadgeProps {
  level: 'low' | 'medium' | 'high';
}

export default function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  const config = confidenceConfig[level];
  return <Badge variant={config.variant}>{config.label} Confidence</Badge>;
}
