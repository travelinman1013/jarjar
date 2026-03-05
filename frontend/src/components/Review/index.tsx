import { useSessionStore } from '../../stores/sessionStore'
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts'

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

  const radarData = [
    { dimension: 'Clarity', score: feedback.clarity_score },
    { dimension: 'Structure', score: feedback.structure_score },
    { dimension: 'Depth', score: feedback.depth_score },
  ]

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
        {/* Overall Score */}
        <div className="text-center">
          <div className="text-6xl font-bold text-gray-100">
            {feedback.overall_score}
          </div>
          <p className="text-gray-400 mt-1">Overall Score</p>
        </div>

        {/* Radar Chart */}
        <div className="h-72 max-w-md mx-auto">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="#374151" />
              <PolarAngleAxis
                dataKey="dimension"
                tick={{ fill: '#9ca3af', fontSize: 14 }}
              />
              <PolarRadiusAxis
                domain={[0, 10]}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                axisLine={false}
              />
              <Radar
                dataKey="score"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.3}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Filler Word Count */}
        <div className="text-center">
          <span className="inline-block bg-gray-800 text-gray-300 px-4 py-2 rounded-full text-sm">
            Filler Words: {feedback.filler_word_count}
          </span>
        </div>

        {/* Feedback Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-green-900/30 border border-green-800/50 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-green-400 mb-2">
              Best Moment
            </h3>
            <p className="text-gray-200">{feedback.best_moment}</p>
          </div>
          <div className="bg-amber-900/30 border border-amber-800/50 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-amber-400 mb-2">
              Biggest Opportunity
            </h3>
            <p className="text-gray-200">{feedback.biggest_opportunity}</p>
          </div>
        </div>

        {/* Full Transcript */}
        <div>
          <h3 className="text-lg font-semibold text-gray-200 mb-4">
            Full Transcript
          </h3>
          <div className="space-y-3">
            {transcripts.map((t) => (
              <div
                key={`${t.speaker}-${t.turnId}`}
                className={`rounded-lg p-4 max-w-[80%] ${
                  t.speaker === 'bot'
                    ? 'bg-blue-900/40 mr-auto'
                    : 'bg-gray-800 ml-auto'
                }`}
              >
                <p className="text-gray-100">{t.text}</p>
                <span className="text-xs text-gray-500 mt-1 block">
                  {t.speaker === 'bot' ? 'Coach' : `Turn ${t.turnId}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
