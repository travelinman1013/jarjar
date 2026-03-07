import { useRef, useState, useCallback, useEffect } from 'react'
import { useSessionStore } from '../stores/sessionStore'

const WS_URL = 'ws://localhost:8000/ws'

interface UseWebSocketOptions {
  onAudioData?: (data: ArrayBuffer) => void
  onInterrupt?: () => void
}

export function useWebSocket(options?: UseWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      const { sessionId } = useSessionStore.getState()
      const silenceMs = sessionStorage.getItem('agent_silence_ms')
      const startMsg: Record<string, unknown> = { type: 'session.start' }
      if (sessionId != null) startMsg.session_id = sessionId
      if (silenceMs) {
        startMsg.silence_ms = Number(silenceMs)
        sessionStorage.removeItem('agent_silence_ms')
      }
      ws.send(JSON.stringify(startMsg))
    }

    ws.onmessage = (event: MessageEvent) => {
      // Binary frame = bot audio PCM
      if (event.data instanceof ArrayBuffer) {
        optionsRef.current?.onAudioData?.(event.data)
        return
      }

      if (typeof event.data !== 'string') return

      try {
        const data = JSON.parse(event.data)
        const store = useSessionStore.getState()

        switch (data.type) {
          case 'transcript':
            store.addTranscript({
              turnId: data.turn_id,
              text: data.text,
              isFinal: data.is_final,
              timestamp: data.timestamp,
              speaker: 'user',
            })
            break
          case 'vad':
            store.setVadActive(data.is_speech)
            break
          case 'session.ready':
            store.setReady(true)
            if (data.phase_list) store.setPhaseList(data.phase_list)
            if (data.duration_minutes) store.setScenarioDuration(data.duration_minutes)
            break
          case 'bot_thinking':
            store.setBotThinking(true)
            break
          case 'bot_speech_start':
            store.setBotSpeaking(true)
            store.setBotThinking(false)
            break
          case 'bot_speech_stop':
            store.setBotSpeaking(false)
            break
          case 'bot_transcript':
            store.addBotSentence(data.text, data.timestamp)
            break
          case 'interrupt_ack':
            store.setBotSpeaking(false)
            store.setBotThinking(false)
            optionsRef.current?.onInterrupt?.()
            break
          case 'phase_change':
            store.setPhase(data.phase, data.display_name)
            break
          case 'error':
            console.error('Server error:', data.message)
            break
        }
      } catch {
        console.error('Failed to parse WebSocket message')
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      wsRef.current = null
    }

    ws.onerror = () => {
      // onclose will fire after this
    }
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
    wsRef.current = null
    setIsConnected(false)
  }, [])

  const sendAudioChunk = useCallback((chunk: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(chunk)
    }
  }, [])

  const sendControl = useCallback((msg: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close()
    }
  }, [])

  return { connect, disconnect, sendAudioChunk, sendControl, isConnected }
}
