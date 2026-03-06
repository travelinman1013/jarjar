import { useState, useEffect } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useProfileStore } from '../../stores/profileStore'
import { SkillOverview } from './SkillOverview'
import { RecommendationBadge } from './RecommendationBadge'

interface Scenario {
  name: string
  type: string
  difficulty: string
  duration_minutes: number
  system_prompt: string
  focus_areas: string[]
  evaluation_criteria: string[]
  whiteboard_enabled?: boolean
}

const API_BASE = 'http://localhost:8000'

const difficultyColor: Record<string, string> = {
  easy: 'bg-green-700 text-green-100',
  medium: 'bg-yellow-700 text-yellow-100',
  hard: 'bg-red-700 text-red-100',
}

function formatName(name: string) {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function SessionSetup() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState<string | null>(null)
  const setSession = useSessionStore((s) => s.setSession)
  const { dimensions, recommendations, fetchProfile } = useProfileStore()

  useEffect(() => {
    fetch(`${API_BASE}/api/scenarios`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load scenarios')
        return r.json()
      })
      .then(setScenarios)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
    fetchProfile()
  }, [])

  const handleSelect = async (scenario: Scenario) => {
    setStarting(scenario.name)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_name: scenario.name }),
      })
      if (!res.ok) throw new Error('Failed to create session')
      const data = await res.json()
      setSession(data.session_id, data.scenario_name, scenario.whiteboard_enabled ?? false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStarting(null)
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="px-6 py-4 border-b border-gray-800">
        <h1 className="text-xl font-semibold text-gray-100">
          Voice Interview Coach
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Choose a scenario to begin your practice session
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <p className="text-gray-400 text-center mt-20">
            Loading scenarios...
          </p>
        )}

        {error && (
          <p className="text-red-400 text-center mt-4">{error}</p>
        )}

        <div className="max-w-3xl mx-auto">
          <SkillOverview dimensions={dimensions} />
        </div>

        <div className="grid gap-4 max-w-3xl mx-auto">
          {[...scenarios]
            .sort((a, b) => {
              const ua = recommendations.find((r) => r.scenario_name === a.name)?.urgency ?? 0
              const ub = recommendations.find((r) => r.scenario_name === b.name)?.urgency ?? 0
              return ub - ua
            })
            .map((s) => (
            <button
              key={s.name}
              onClick={() => handleSelect(s)}
              disabled={starting !== null}
              className="text-left rounded-lg border border-gray-700 bg-gray-800 p-5 hover:bg-gray-700 hover:border-gray-600 transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-medium text-gray-100">
                  {formatName(s.name)}
                </h2>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${difficultyColor[s.difficulty] ?? 'bg-gray-700 text-gray-300'}`}>
                    {s.difficulty}
                  </span>
                  <span className="text-xs text-gray-400">
                    {s.duration_minutes} min
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {s.focus_areas.map((area) => (
                  <span
                    key={area}
                    className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded"
                  >
                    {area}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-400">
                  {s.type.charAt(0).toUpperCase() + s.type.slice(1)} interview
                </p>
                <RecommendationBadge
                  recommendation={recommendations.find((r) => r.scenario_name === s.name)}
                />
              </div>

              {starting === s.name && (
                <p className="text-sm text-blue-400 mt-2">Starting session...</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
