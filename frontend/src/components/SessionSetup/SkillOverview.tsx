import { useState } from 'react'
import type { SkillDimensionData } from '../../stores/profileStore'

function formatDaysAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  )
  if (days === 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function retrievabilityColor(r: number): string {
  if (r >= 0.8) return 'bg-green-500'
  if (r >= 0.5) return 'bg-yellow-500'
  return 'bg-red-500'
}

function scoreLabel(score: number): string {
  if (score >= 8) return 'Strong'
  if (score >= 6) return 'Solid'
  if (score >= 4) return 'Developing'
  return 'Weak'
}

export function SkillOverview({
  dimensions,
}: {
  dimensions: SkillDimensionData[]
}) {
  const [collapsed, setCollapsed] = useState(false)

  if (dimensions.length === 0) return null

  const sorted = [...dimensions].sort(
    (a, b) => a.retrievability - b.retrievability,
  )

  return (
    <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wide">
          Skill Profile
        </h2>
        <span className="text-xs text-gray-500">
          {collapsed ? 'Show' : 'Hide'}
        </span>
      </button>

      {!collapsed && (
        <div className="mt-3 space-y-2">
          {sorted.map((d) => (
            <div key={d.name} className="flex items-center gap-3">
              <span className="w-44 truncate text-sm text-gray-300 capitalize">
                {d.name}
              </span>
              <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${retrievabilityColor(d.retrievability)}`}
                  style={{ width: `${(d.current_score / 10) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right text-xs text-gray-400">
                {d.current_score.toFixed(1)}
              </span>
              <span className="w-20 text-xs text-gray-500">
                {scoreLabel(d.current_score)}
              </span>
              <span className="w-24 text-right text-xs text-gray-600">
                {formatDaysAgo(d.last_practiced)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
