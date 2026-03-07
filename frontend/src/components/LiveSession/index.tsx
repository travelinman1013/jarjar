import { useEffect, useRef, useCallback, useState, Suspense, lazy } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useAudio } from '../../hooks/useAudio'
import { useWebSocket } from '../../hooks/useWebSocket'
import { usePlayback } from '../../hooks/usePlayback'

const WhiteboardPanel = lazy(() =>
  import('./WhiteboardPanel').then(m => ({ default: m.WhiteboardPanel }))
)

// Subscribe to slices individually to avoid re-renders from vadActive changes
function VadIndicator() {
  const vadActive = useSessionStore((s) => s.vadActive)
  const isRecording = useSessionStore((s) => s.isRecording)

  if (!isRecording) return null

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-3 h-3 rounded-full transition-colors ${
          vadActive ? 'bg-red-500 animate-pulse' : 'bg-red-900'
        }`}
      />
      <span className="text-sm text-gray-400">
        {vadActive ? 'Listening...' : 'Waiting for speech...'}
      </span>
    </div>
  )
}

function BotSpeakingIndicator() {
  const isBotSpeaking = useSessionStore((s) => s.isBotSpeaking)
  const isRecording = useSessionStore((s) => s.isRecording)

  if (!isRecording || !isBotSpeaking) return null

  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
      <span className="text-sm text-gray-400">Bot speaking...</span>
    </div>
  )
}

function BotThinkingIndicator() {
  const isBotThinking = useSessionStore((s) => s.isBotThinking)
  const isRecording = useSessionStore((s) => s.isRecording)

  if (!isRecording || !isBotThinking) return null

  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse" />
      <span className="text-sm text-gray-400">Thinking...</span>
    </div>
  )
}

function SessionTimer() {
  const isRecording = useSessionStore((s) => s.isRecording)
  const scenarioDuration = useSessionStore((s) => s.scenarioDuration)
  const spanRef = useRef<HTMLSpanElement>(null)
  const startTimeRef = useRef<number>(0)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null)

  useEffect(() => {
    if (isRecording) {
      startTimeRef.current = Date.now()
      intervalRef.current = setInterval(() => {
        if (!spanRef.current) return
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        const min = Math.floor(elapsed / 60)
        const sec = elapsed % 60
        const formatted = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`

        if (scenarioDuration) {
          const totalSec = scenarioDuration * 60
          const remaining = Math.max(0, totalSec - elapsed)
          const rMin = Math.floor(remaining / 60)
          const rSec = remaining % 60
          const rFormatted = `${String(rMin).padStart(2, '0')}:${String(rSec).padStart(2, '0')}`
          spanRef.current.textContent = `${formatted} / ${rFormatted} left`
          spanRef.current.className = remaining < 120
            ? 'text-sm font-mono text-red-400'
            : 'text-sm font-mono text-gray-400'
        } else {
          spanRef.current.textContent = formatted
        }
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRecording, scenarioDuration])

  if (!isRecording) return null

  return <span ref={spanRef} className="text-sm font-mono text-gray-400">00:00</span>
}

function PhaseProgress() {
  const phaseList = useSessionStore((s) => s.phaseList)
  const currentPhase = useSessionStore((s) => s.currentPhase)

  if (phaseList.length === 0) return null

  const currentIdx = phaseList.findIndex((p) => p.name === currentPhase)

  return (
    <div className="flex items-center gap-1">
      {phaseList.map((phase, i) => {
        const isCurrent = phase.name === currentPhase
        const isCompleted = currentIdx >= 0 && i < currentIdx
        return (
          <div key={phase.name} className="flex items-center gap-1">
            {i > 0 && <div className="w-3 h-px bg-gray-600" />}
            <div
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                isCurrent
                  ? 'bg-blue-500/20 text-blue-400 font-medium'
                  : isCompleted
                    ? 'bg-green-500/10 text-green-600'
                    : 'bg-gray-800 text-gray-600'
              }`}
              title={phase.display_name}
            >
              {phase.display_name}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PreSessionBrief({ onStart }: { onStart: () => void }) {
  const scenarioName = useSessionStore((s) => s.scenarioName)
  const scenarioDuration = useSessionStore((s) => s.scenarioDuration)
  const phaseList = useSessionStore((s) => s.phaseList)

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-6">
        {scenarioName && (
          <h2 className="text-2xl font-semibold text-gray-100">
            {scenarioName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </h2>
        )}

        <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
          {scenarioDuration && <span>{scenarioDuration} min</span>}
          {phaseList.length > 0 && <span>{phaseList.length} phases</span>}
        </div>

        {phaseList.length > 0 && (
          <div className="text-left bg-gray-800/50 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Phases</p>
            <div className="space-y-1">
              {phaseList.map((p, i) => (
                <div key={p.name} className="text-sm text-gray-400">
                  <span className="text-gray-600 mr-2">{i + 1}.</span>
                  {p.display_name}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-sm text-gray-500">
          Speak naturally — the coach will ask follow-up questions.
        </p>

        <button
          onClick={onStart}
          className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-lg"
        >
          Start Recording
        </button>
      </div>
    </div>
  )
}

function TranscriptList() {
  const transcripts = useSessionStore((s) => s.transcripts)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcripts])

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {transcripts.length === 0 && (
        <p className="text-gray-500 text-center mt-20">
          Transcripts will appear here as you speak...
        </p>
      )}
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
      <div ref={bottomRef} />
    </div>
  )
}

function AnalyzingOverlay() {
  const isAnalyzing = useSessionStore((s) => s.isAnalyzing)

  if (!isAnalyzing) return null

  return (
    <div className="fixed inset-0 bg-gray-950/80 flex items-center justify-center z-50">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-300">Analyzing your interview...</p>
      </div>
    </div>
  )
}

export function LiveSession() {
  const isRecording = useSessionStore((s) => s.isRecording)
  const scenarioName = useSessionStore((s) => s.scenarioName)
  const whiteboardEnabled = useSessionStore((s) => s.whiteboardEnabled)
  const setRecording = useSessionStore((s) => s.setRecording)
  const setReady = useSessionStore((s) => s.setReady)
  const [showWhiteboard, setShowWhiteboard] = useState(whiteboardEnabled)

  const { enqueue, flush } = usePlayback(24000)

  const { connect, disconnect, sendAudioChunk, sendControl, isConnected } =
    useWebSocket({
      onAudioData: enqueue,
      onInterrupt: flush,
    })

  const { startCapture, stopCapture } = useAudio({
    onAudioChunk: sendAudioChunk,
  })

  const readyRef = useRef(false)
  const analyzingRef = useRef(false)

  // Listen for session.ready to start capture
  useEffect(() => {
    return useSessionStore.subscribe((state) => {
      if (state.isReady && !readyRef.current) {
        readyRef.current = true
        startCapture()
      }
    })
  }, [startCapture])

  // Flush playback when user starts speaking (client-side immediate interruption)
  useEffect(() => {
    return useSessionStore.subscribe((state, prevState) => {
      if (state.vadActive && !prevState.vadActive) {
        flush()
      }
    })
  }, [flush])

  const handleDiagramChange = useCallback(
    (snapshot: object, shapeCount: number) => {
      sendControl({ type: 'diagram_state', snapshot, shape_count: shapeCount })
    },
    [sendControl],
  )

  const handleStart = useCallback(() => {
    readyRef.current = false
    setRecording(true)
    connect()
  }, [connect, setRecording])

  const handleStop = useCallback(async () => {
    if (analyzingRef.current) return
    analyzingRef.current = true

    stopCapture()
    flush()
    sendControl({ type: 'session.stop' })
    setRecording(false)
    setReady(false)
    readyRef.current = false

    // Wait for final transcripts to arrive
    await new Promise((r) => setTimeout(r, 1000))
    disconnect()

    const { sessionId, setAnalyzing, setFeedback, setView, setDiagramSnapshots } =
      useSessionStore.getState()
    if (!sessionId) {
      analyzingRef.current = false
      return
    }

    setAnalyzing(true)
    try {
      const res = await fetch(
        `http://localhost:8000/api/sessions/${sessionId}/analyze`,
        { method: 'POST' },
      )
      if (!res.ok) throw new Error('Analysis failed')
      const data = await res.json()
      setFeedback(data)

      // Fetch diagram snapshots for review
      try {
        const diagRes = await fetch(
          `http://localhost:8000/api/sessions/${sessionId}/diagrams`,
        )
        if (diagRes.ok) {
          setDiagramSnapshots(await diagRes.json())
        }
      } catch {
        // Diagram fetch is non-critical
      }

      setView('review')
    } catch (err) {
      console.error('Failed to analyze session:', err)
      setView('review')
    } finally {
      setAnalyzing(false)
      analyzingRef.current = false
    }
  }, [stopCapture, flush, sendControl, disconnect, setRecording, setReady])

  return (
    <div className="flex h-screen">
      <AnalyzingOverlay />

      <div className={`flex flex-col ${showWhiteboard ? 'w-1/2 border-r border-gray-800' : 'w-full'}`}>
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-100">
                Voice Interview Coach
              </h1>
              <SessionTimer />
            </div>
            <div className="flex items-center gap-2 mt-1">
              {scenarioName && (
                <span className="text-sm text-gray-400">
                  {scenarioName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <BotThinkingIndicator />
            <BotSpeakingIndicator />
            <VadIndicator />
            {whiteboardEnabled && (
              <button
                onClick={() => setShowWhiteboard(v => !v)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  showWhiteboard
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {showWhiteboard ? 'Hide Board' : 'Show Board'}
              </button>
            )}
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-gray-600'
                }`}
              />
              <span className="text-xs text-gray-500">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </header>

        {isRecording && <PhaseProgress />}

        {!isRecording ? (
          <PreSessionBrief onStart={handleStart} />
        ) : (
          <TranscriptList />
        )}

        {isRecording && (
          <footer className="px-6 py-4 border-t border-gray-800">
            <button
              onClick={handleStop}
              className="w-full py-3 rounded-lg font-medium transition-colors bg-red-600 hover:bg-red-700 text-white"
            >
              End & Review
            </button>
          </footer>
        )}
      </div>

      {showWhiteboard && (
        <div className="w-1/2">
          <Suspense fallback={<div className="flex items-center justify-center h-full text-gray-500">Loading whiteboard...</div>}>
            <WhiteboardPanel onDiagramChange={handleDiagramChange} />
          </Suspense>
        </div>
      )}
    </div>
  )
}
