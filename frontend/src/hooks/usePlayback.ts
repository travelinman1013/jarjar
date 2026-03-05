import { useRef, useCallback, useEffect } from 'react'

class AudioPlaybackQueue {
  private ctx: AudioContext
  private queue: AudioBufferSourceNode[] = []
  private nextTime = 0
  private sampleRate: number

  constructor(sampleRate = 24000) {
    this.ctx = new AudioContext()
    this.sampleRate = sampleRate
  }

  enqueue(pcmBytes: ArrayBuffer) {
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    const int16 = new Int16Array(pcmBytes)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768
    }

    const buf = this.ctx.createBuffer(1, float32.length, this.sampleRate)
    buf.getChannelData(0).set(float32)

    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.connect(this.ctx.destination)

    const now = this.ctx.currentTime
    // If nextTime fell behind, reset to slightly in the future to allow buffer time
    if (this.nextTime < now) {
      this.nextTime = now + 0.05
    }
    const start = this.nextTime
    src.start(start)
    this.nextTime = start + buf.duration

    this.queue.push(src)
    src.onended = () => {
      const i = this.queue.indexOf(src)
      if (i >= 0) this.queue.splice(i, 1)
    }
  }

  flush() {
    for (const s of this.queue) {
      try {
        s.stop()
      } catch {
        /* already stopped */
      }
    }
    this.queue = []
    this.nextTime = 0
  }

  destroy() {
    this.flush()
    this.ctx.close()
  }
}

export function usePlayback(sampleRate = 24000) {
  const queueRef = useRef<AudioPlaybackQueue | null>(null)

  // Lazy-init to avoid creating AudioContext before user gesture
  const getQueue = useCallback(() => {
    if (!queueRef.current) {
      queueRef.current = new AudioPlaybackQueue(sampleRate)
    }
    return queueRef.current
  }, [sampleRate])

  const enqueue = useCallback(
    (data: ArrayBuffer) => {
      getQueue().enqueue(data)
    },
    [getQueue],
  )

  const flush = useCallback(() => {
    queueRef.current?.flush()
  }, [])

  useEffect(() => {
    return () => {
      queueRef.current?.destroy()
      queueRef.current = null
    }
  }, [])

  return { enqueue, flush }
}
