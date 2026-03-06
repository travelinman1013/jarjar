import { useEffect, useRef, useCallback } from 'react'
import { useSessionStore } from '../../stores/sessionStore'
import { useAudio } from '../../hooks/useAudio'
import { useWebSocket } from '../../hooks/useWebSocket'
import { usePlayback } from '../../hooks/usePlayback'

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

function PhaseIndicator() {
  const phaseDisplayName = useSessionStore((s) => s.phaseDisplayName)

  if (!phaseDisplayName) return null

  return (
    <span className="text-xs font-medium text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded">
      {phaseDisplayName}
    </span>
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
  const setRecording = useSessionStore((s) => s.setRecording)
  const setReady = useSessionStore((s) => s.setReady)

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

  const handleStart = useCallback(() => {
    readyRef.current = false
    setRecording(true)
    connect()
  }, [connect, setRecording])

  const handleStop = useCallback(async () => {
    stopCapture()
    flush()
    sendControl({ type: 'session.stop' })
    setRecording(false)
    setReady(false)
    readyRef.current = false

    // Wait for final transcripts to arrive
    await new Promise((r) => setTimeout(r, 1000))
    disconnect()

    const { sessionId, setAnalyzing, setFeedback, setView } =
      useSessionStore.getState()
    if (!sessionId) return

    setAnalyzing(true)
    try {
      const res = await fetch(
        `http://localhost:8000/api/sessions/${sessionId}/analyze`,
        { method: 'POST' },
      )
      if (!res.ok) throw new Error('Analysis failed')
      const data = await res.json()
      setFeedback(data)
      setView('review')
    } catch (err) {
      console.error('Failed to analyze session:', err)
      setView('review')
    } finally {
      setAnalyzing(false)
    }
  }, [stopCapture, flush, sendControl, disconnect, setRecording, setReady])

  return (
    <div className="flex flex-col h-screen">
      <AnalyzingOverlay />

      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">
            Voice Interview Coach
          </h1>
          <div className="flex items-center gap-2">
            {scenarioName && (
              <span className="text-sm text-gray-400">
                {scenarioName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </span>
            )}
            <PhaseIndicator />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <BotSpeakingIndicator />
          <VadIndicator />
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

      <TranscriptList />

      <footer className="px-6 py-4 border-t border-gray-800">
        <button
          onClick={isRecording ? handleStop : handleStart}
          className={`w-full py-3 rounded-lg font-medium transition-colors ${
            isRecording
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isRecording ? 'End & Review' : 'Start Recording'}
        </button>
      </footer>
    </div>
  )
}
