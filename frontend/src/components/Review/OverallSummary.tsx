import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
} from 'recharts'
import type { FeedbackData } from '../../stores/sessionStore'

interface Props {
  feedback: FeedbackData
}

export function OverallSummary({ feedback }: Props) {
  const radarData = feedback.dimensions && feedback.phase_scores?.length
    ? feedback.dimensions.map((dim) => {
        const scores = (feedback.phase_scores || [])
          .flatMap((ps) => ps.dimension_scores)
          .filter((ds) => ds.dimension === dim)
        const avg =
          scores.length > 0
            ? Math.round(
                scores.reduce((s, d) => s + d.score, 0) / scores.length,
              )
            : 5
        return { dimension: dim, score: avg }
      })
    : [
        { dimension: 'Clarity', score: feedback.clarity_score },
        { dimension: 'Structure', score: feedback.structure_score },
        { dimension: 'Depth', score: feedback.depth_score },
      ]

  return (
    <>
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
              tick={{ fill: '#9ca3af', fontSize: 12 }}
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

      {/* Technical Accuracy Notes */}
      {feedback.technical_accuracy_notes && (
        <div className="bg-red-900/20 border border-red-800/40 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-red-400 mb-2">
            Technical Accuracy Notes
          </h3>
          <p className="text-gray-200">{feedback.technical_accuracy_notes}</p>
        </div>
      )}

      {/* Profile Updated Confirmation */}
      {feedback.phase_scores && feedback.phase_scores.length > 0 && (
        <div className="bg-indigo-900/20 border border-indigo-800/40 rounded-lg p-4">
          <p className="text-sm text-indigo-300">
            Your skill profile has been updated with scores from this session.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {[...new Set(
              feedback.phase_scores.flatMap((ps) =>
                ps.dimension_scores.map((ds) => ds.dimension),
              ),
            )].map((dim) => (
              <span
                key={dim}
                className="text-xs bg-indigo-900/40 text-indigo-200 px-2 py-0.5 rounded capitalize"
              >
                {dim}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
