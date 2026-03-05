import { useRef, useState, useCallback } from 'react'

interface UseAudioOptions {
  onAudioChunk: (chunk: ArrayBuffer) => void
}

export function useAudio({ onAudioChunk }: UseAudioOptions) {
  const [isCapturing, setIsCapturing] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onAudioChunkRef = useRef(onAudioChunk)
  onAudioChunkRef.current = onAudioChunk

  const startCapture = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
    streamRef.current = stream

    // Create AudioContext at 16kHz — browser resamples natively (no aliasing)
    const audioContext = new AudioContext({ sampleRate: 16000 })
    audioContextRef.current = audioContext

    await audioContext.audioWorklet.addModule('/audio-processor.js')

    const source = audioContext.createMediaStreamSource(stream)
    const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor')
    workletNodeRef.current = workletNode

    workletNode.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      onAudioChunkRef.current(event.data)
    }

    // Connect source -> worklet (not to destination — no feedback)
    source.connect(workletNode)

    setIsCapturing(true)
  }, [])

  const stopCapture = useCallback(() => {
    workletNodeRef.current?.disconnect()
    workletNodeRef.current = null

    audioContextRef.current?.close()
    audioContextRef.current = null

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null

    setIsCapturing(false)
  }, [])

  return { startCapture, stopCapture, isCapturing }
}
