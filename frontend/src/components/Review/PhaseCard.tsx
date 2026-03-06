import { useState } from 'react'
import type { PhaseScoreData } from '../../stores/sessionStore'

interface Props {
  phase: PhaseScoreData
}

const scoreColor = (score: number) => {
  if (score >= 8) return 'bg-green-500'
  if (score >= 6) return 'bg-blue-500'
  if (score >= 4) return 'bg-amber-500'
  return 'bg-red-500'
}

export function PhaseCard({ phase }: Props) {
  const [expanded, setExpanded] = useState(false)

  const avgScore =
    phase.dimension_scores.length > 0
      ? Math.round(
          phase.dimension_scores.reduce((s, d) => s + d.score, 0) /
            phase.dimension_scores.length,
        )
      : 0

  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-800/80 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="text-lg font-medium text-gray-100">
            {phase.phase_display_name}
          </div>
          <span className="text-sm text-gray-400">avg {avgScore}/10</span>
        </div>
        <span className="text-gray-400 text-sm">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* Phase Summary */}
          <p className="text-sm text-gray-300">{phase.phase_summary}</p>

          {/* Dimension Score Bars */}
          <div className="space-y-3">
            {phase.dimension_scores.map((dim) => (
              <div key={dim.dimension}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-300">{dim.dimension}</span>
                  <span className="text-sm font-medium text-gray-200">
                    {dim.score}/10
                  </span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${scoreColor(dim.score)}`}
                    style={{ width: `${dim.score * 10}%` }}
                  />
                </div>
                {/* Evidence Quote */}
                <div className="mt-2 pl-3 border-l-2 border-gray-600">
                  <p className="text-xs text-gray-400 italic">
                    &ldquo;{dim.evidence_quote}&rdquo;
                  </p>
                </div>
                {/* Suggestion */}
                <p className="mt-1 text-xs text-blue-400">
                  {dim.suggestion}
                </p>
              </div>
            ))}
          </div>

          {/* Stronger Answer */}
          {phase.stronger_answer && (
            <div className="bg-gray-900/50 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">
                Stronger Answer Example
              </h4>
              <p className="text-sm text-gray-300">{phase.stronger_answer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
