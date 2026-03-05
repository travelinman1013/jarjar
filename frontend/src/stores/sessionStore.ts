import { create } from 'zustand'

export interface TranscriptEntry {
  turnId: number
  text: string
  isFinal: boolean
  timestamp: number
}

interface SessionState {
  isRecording: boolean
  isConnected: boolean
  isReady: boolean
  vadActive: boolean
  transcripts: TranscriptEntry[]

  setRecording: (v: boolean) => void
  setConnected: (v: boolean) => void
  setReady: (v: boolean) => void
  setVadActive: (v: boolean) => void
  addTranscript: (entry: TranscriptEntry) => void
  reset: () => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  isRecording: false,
  isConnected: false,
  isReady: false,
  vadActive: false,
  transcripts: [],

  setRecording: (v) => set({ isRecording: v }),
  setConnected: (v) => set({ isConnected: v }),
  setReady: (v) => set({ isReady: v }),
  setVadActive: (v) => set({ vadActive: v }),
  addTranscript: (entry) =>
    set((state) => {
      // Replace existing entry with same turnId, or append
      const idx = state.transcripts.findIndex((t) => t.turnId === entry.turnId)
      if (idx >= 0) {
        const updated = [...state.transcripts]
        updated[idx] = entry
        return { transcripts: updated }
      }
      return { transcripts: [...state.transcripts, entry] }
    }),
  reset: () =>
    set({
      isRecording: false,
      isReady: false,
      vadActive: false,
      transcripts: [],
    }),
}))
