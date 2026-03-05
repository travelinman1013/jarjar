/**
 * AudioWorklet processor for capturing mic input as 16-bit PCM.
 *
 * The AudioContext is created with { sampleRate: 16000 } so the browser
 * handles resampling natively. This processor only converts Float32 to
 * Int16 and buffers to ~100ms chunks before posting to the main thread.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buffer = new Int16Array(1600) // 100ms at 16kHz
    this._offset = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const samples = input[0] // Float32Array, mono channel

    for (let i = 0; i < samples.length; i++) {
      // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
      const s = Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767)))
      this._buffer[this._offset++] = s

      if (this._offset >= 1600) {
        // Post the filled buffer as a transferable
        const chunk = this._buffer.slice().buffer
        this.port.postMessage(chunk, [chunk])
        this._offset = 0
      }
    }

    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)
