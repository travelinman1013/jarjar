import type { TranscriptEntry } from '../../stores/sessionStore'

interface Props {
  transcripts: TranscriptEntry[]
}

export function TranscriptReplay({ transcripts }: Props) {
  // Group by phase if phase info is available
  const hasPhases = transcripts.some((t) => t.phase)

  if (!hasPhases) {
    return (
      <div>
        <h3 className="text-lg font-semibold text-gray-200 mb-4">
          Full Transcript
        </h3>
        <div className="space-y-3">
          {transcripts.map((t) => (
            <TranscriptBubble key={`${t.speaker}-${t.turnId}`} entry={t} />
          ))}
        </div>
      </div>
    )
  }

  // Group transcripts by phase
  const groups: { phase: string; entries: TranscriptEntry[] }[] = []
  let currentPhase = ''
  for (const t of transcripts) {
    const phase = t.phase || 'Unknown'
    if (phase !== currentPhase) {
      groups.push({ phase, entries: [] })
      currentPhase = phase
    }
    groups[groups.length - 1].entries.push(t)
  }

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-200 mb-4">
        Full Transcript
      </h3>
      <div className="space-y-6">
        {groups.map((group, i) => (
          <div key={`${group.phase}-${i}`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-gray-700" />
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {group.phase.replace(/_/g, ' ')}
              </span>
              <div className="h-px flex-1 bg-gray-700" />
            </div>
            <div className="space-y-3">
              {group.entries.map((t) => (
                <TranscriptBubble
                  key={`${t.speaker}-${t.turnId}`}
                  entry={t}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TranscriptBubble({ entry: t }: { entry: TranscriptEntry }) {
  return (
    <div
      className={`rounded-lg p-4 max-w-[80%] ${
        t.speaker === 'bot' ? 'bg-blue-900/40 mr-auto' : 'bg-gray-800 ml-auto'
      }`}
    >
      <p className="text-gray-100">{t.text}</p>
      <span className="text-xs text-gray-500 mt-1 block">
        {t.speaker === 'bot' ? 'Coach' : `Turn ${t.turnId}`}
      </span>
    </div>
  )
}
