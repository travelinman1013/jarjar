import { useSessionStore } from '../../stores/sessionStore'
import { OverallSummary } from './OverallSummary'
import { PhaseTimeline } from './PhaseTimeline'
import { TranscriptReplay } from './TranscriptReplay'

export function Review() {
  const feedback = useSessionStore((s) => s.feedback)
  const transcripts = useSessionStore((s) => s.transcripts)
  const scenarioName = useSessionStore((s) => s.scenarioName)
  const clearSession = useSessionStore((s) => s.clearSession)

  if (!feedback) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-gray-400">No feedback available for this session.</p>
        <button
          onClick={clearSession}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          Start New Session
        </button>
      </div>
    )
  }

  const hasPhaseScores = feedback.phase_scores && feedback.phase_scores.length > 0

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">
            Session Review
          </h1>
          {scenarioName && (
            <span className="text-sm text-gray-400">
              {scenarioName
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          )}
        </div>
        <button
          onClick={clearSession}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
        >
          New Session
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <OverallSummary feedback={feedback} />

        {hasPhaseScores && (
          <PhaseTimeline phaseScores={feedback.phase_scores!} />
        )}

        <TranscriptReplay transcripts={transcripts} />
      </div>
    </div>
  )
}
