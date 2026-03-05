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

export function LiveSession() {
  const isRecording = useSessionStore((s) => s.isRecording)
  const scenarioName = useSessionStore((s) => s.scenarioName)
  const setRecording = useSessionStore((s) => s.setRecording)
  const setReady = useSessionStore((s) => s.setReady)
  const clearSession = useSessionStore((s) => s.clearSession)

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

  const handleStop = useCallback(() => {
    stopCapture()
    flush()
    sendControl({ type: 'session.stop' })
    setRecording(false)
    setReady(false)
    readyRef.current = false
    // Small delay to let final transcript arrive before disconnect
    setTimeout(() => {
      disconnect()
      clearSession()
    }, 1000)
  }, [stopCapture, flush, sendControl, disconnect, setRecording, setReady, clearSession])

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">
            Voice Interview Coach
          </h1>
          {scenarioName && (
            <span className="text-sm text-gray-400">
              {scenarioName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          )}
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
          {isRecording ? 'Stop Recording' : 'Start Recording'}
        </button>
      </footer>
    </div>
  )
}
