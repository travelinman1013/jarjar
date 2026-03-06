import type { PhaseScoreData } from '../../stores/sessionStore'
import { PhaseCard } from './PhaseCard'

interface Props {
  phaseScores: PhaseScoreData[]
}

export function PhaseTimeline({ phaseScores }: Props) {
  const sorted = [...phaseScores].sort((a, b) => a.phase_order - b.phase_order)

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-200 mb-4">
        Phase-by-Phase Breakdown
      </h3>
      <div className="space-y-3">
        {sorted.map((phase) => (
          <PhaseCard key={phase.phase_name} phase={phase} />
        ))}
      </div>
    </div>
  )
}
