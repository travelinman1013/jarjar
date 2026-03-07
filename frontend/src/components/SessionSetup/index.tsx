import { useState, useEffect } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useProfileStore } from '../../stores/profileStore'
import { useHistoryStore, type PastSession } from '../../stores/historyStore'
import { SkillOverview } from './SkillOverview'
import { RecommendationBadge } from './RecommendationBadge'
import { ScenarioBuilder } from './ScenarioBuilder'
import { Settings } from './Settings'

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
  const [showBuilder, setShowBuilder] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const setSession = useSessionStore((s) => s.setSession)
  const { dimensions, recommendations, fetchProfile } = useProfileStore()
  const { pastSessions, fetchPastSessions } = useHistoryStore()
  const setFeedback = useSessionStore((s) => s.setFeedback)
  const setView = useSessionStore((s) => s.setView)

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
    fetchPastSessions()
  }, [])

  const reloadScenarios = () => {
    fetch(`${API_BASE}/api/scenarios`)
      .then((r) => r.json())
      .then(setScenarios)
      .catch(() => {})
  }

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
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">
            Voice Interview Coach
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Choose a scenario to begin your practice session
          </p>
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="p-2 text-gray-500 hover:text-gray-300 transition-colors"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
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
          {showSettings && <Settings onClose={() => setShowSettings(false)} />}
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

          {/* Create Scenario card */}
          <button
            onClick={() => setShowBuilder(true)}
            className="text-left rounded-lg border-2 border-dashed border-gray-700 p-5 hover:border-gray-500 hover:bg-gray-800/50 transition-colors flex items-center justify-center gap-2 min-h-[100px]"
          >
            <span className="text-2xl text-gray-600">+</span>
            <span className="text-sm text-gray-500">Create Scenario</span>
          </button>
        </div>

        {showBuilder && (
          <ScenarioBuilder
            onClose={() => setShowBuilder(false)}
            onSaved={() => {
              setShowBuilder(false)
              reloadScenarios()
            }}
          />
        )}

          {/* Session History */}
          <SessionHistory
            sessions={pastSessions}
            onView={async (session) => {
              try {
                const res = await fetch(
                  `${API_BASE}/api/sessions/${session.id}`,
                )
                if (!res.ok) return
                const data = await res.json()
                setSession(session.id, session.scenario_name, false)
                if (data.score) {
                  const feedback = {
                    ...data.score,
                    phase_scores: data.phase_scores,
                    dimensions: data.score.dimension_names,
                  }
                  setFeedback(feedback)
                }
                setView('review')
              } catch {
                // Silent failure
              }
            }}
          />
      </div>
    </div>
  )
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m ${s}s`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const days = Math.max(0, Math.floor(
    (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24),
  ))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString()
}

function scoreColor(score: number | null): string {
  if (score === null) return 'text-gray-500'
  if (score >= 8) return 'text-green-400'
  if (score >= 6) return 'text-blue-400'
  if (score >= 4) return 'text-yellow-400'
  return 'text-red-400'
}

function SessionHistory({
  sessions,
  onView,
}: {
  sessions: PastSession[]
  onView: (session: PastSession) => void
}) {
  if (sessions.length === 0) return null

  return (
    <div className="max-w-3xl mx-auto mt-8">
      <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wide mb-3">
        Past Sessions
      </h2>
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 divide-y divide-gray-700/50 max-h-80 overflow-y-auto">
        {sessions.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between px-4 py-3 hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <span className="text-sm text-gray-200 truncate w-48">
                {formatName(s.scenario_name)}
              </span>
              <span className="text-xs text-gray-500 w-20">
                {formatDate(s.created_at)}
              </span>
              <span className="text-xs text-gray-500 w-16">
                {formatDuration(s.duration_seconds)}
              </span>
              <span className={`text-sm font-medium w-8 ${scoreColor(s.overall_score)}`}>
                {s.overall_score ?? '--'}
              </span>
            </div>
            <button
              onClick={() => onView(s)}
              className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-400/10 transition-colors"
            >
              View
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
