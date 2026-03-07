import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { SkillDimensionData } from '../../stores/profileStore'
import { useHistoryStore } from '../../stores/historyStore'

function formatDaysAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const days = Math.max(0, Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  ))
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
  const [expandedDim, setExpandedDim] = useState<string | null>(null)
  const { trends, fetchTrends } = useHistoryStore()

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
        <div className="mt-3 space-y-1">
          {sorted.map((d) => (
            <div key={d.name}>
              <button
                onClick={() => {
                  const next = expandedDim === d.name ? null : d.name
                  setExpandedDim(next)
                  if (next) fetchTrends()
                }}
                className="flex items-center gap-3 w-full text-left py-1 hover:bg-gray-700/30 rounded px-1 -mx-1 transition-colors"
              >
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
              </button>
              {expandedDim === d.name && (
                <TrendChart data={trends[d.name]} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TrendChart({ data }: { data?: { created_at: string; score: number }[] }) {
  if (!data || data.length === 0) {
    return (
      <p className="text-xs text-gray-600 py-2 pl-2">
        No trend data yet
      </p>
    )
  }

  const chartData = data.map((d) => ({
    date: new Date(d.created_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    }),
    score: d.score,
  }))

  return (
    <div className="h-24 mt-1 mb-2 ml-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 10]}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            width={24}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1f2937',
              border: '1px solid #374151',
              borderRadius: '6px',
              fontSize: '12px',
            }}
            labelStyle={{ color: '#9ca3af' }}
            itemStyle={{ color: '#60a5fa' }}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3, fill: '#3b82f6' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
