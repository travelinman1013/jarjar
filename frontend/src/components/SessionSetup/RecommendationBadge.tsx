import type { RecommendationData } from '../../stores/profileStore'

export function RecommendationBadge({
  recommendation,
}: {
  recommendation: RecommendationData | undefined
}) {
  if (!recommendation || recommendation.urgency < 0.3) return null

  const isHigh = recommendation.urgency >= 0.6
  const label = isHigh ? 'Recommended' : 'Review soon'
  const colors = isHigh
    ? 'bg-amber-900/50 text-amber-300 border-amber-700/50'
    : 'bg-blue-900/50 text-blue-300 border-blue-700/50'

  const weakest =
    recommendation.weak_dimensions[0] || recommendation.due_dimensions[0]

  return (
    <div className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded border ${colors}`}>
      <span>{label}</span>
      {weakest && (
        <span className="opacity-70 capitalize">· {weakest}</span>
      )}
    </div>
  )
}
