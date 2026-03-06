import { create } from 'zustand'

export interface TranscriptEntry {
  turnId: number
  text: string
  isFinal: boolean
  timestamp: number
  speaker: 'user' | 'bot'
}

export interface FeedbackData {
  overall_score: number
  clarity_score: number
  structure_score: number
  depth_score: number
  best_moment: string
  biggest_opportunity: string
  filler_word_count: number
}

interface SessionState {
  sessionId: number | null
  scenarioName: string | null
  view: 'setup' | 'session' | 'review'
  isRecording: boolean
  isConnected: boolean
  isReady: boolean
  vadActive: boolean
  isBotSpeaking: boolean
  isAnalyzing: boolean
  transcripts: TranscriptEntry[]
  botMessageCounter: number
  feedback: FeedbackData | null
  currentPhase: string | null
  phaseDisplayName: string | null

  setSession: (id: number, scenario: string) => void
  clearSession: () => void
  setRecording: (v: boolean) => void
  setConnected: (v: boolean) => void
  setReady: (v: boolean) => void
  setVadActive: (v: boolean) => void
  setBotSpeaking: (v: boolean) => void
  setAnalyzing: (v: boolean) => void
  setFeedback: (f: FeedbackData) => void
  setView: (v: 'setup' | 'session' | 'review') => void
  setPhase: (phase: string, displayName: string) => void
  addTranscript: (entry: TranscriptEntry) => void
  addBotSentence: (text: string, timestamp: number) => void
  reset: () => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  sessionId: null,
  scenarioName: null,
  view: 'setup',
  isRecording: false,
  isConnected: false,
  isReady: false,
  vadActive: false,
  isBotSpeaking: false,
  isAnalyzing: false,
  transcripts: [],
  botMessageCounter: 0,
  feedback: null,
  currentPhase: null,
  phaseDisplayName: null,

  setSession: (id, scenario) =>
    set({
      sessionId: id,
      scenarioName: scenario,
      view: 'session',
      isRecording: false,
      isReady: false,
      vadActive: false,
      isBotSpeaking: false,
      isAnalyzing: false,
      transcripts: [],
      botMessageCounter: 0,
      feedback: null,
      currentPhase: null,
      phaseDisplayName: null,
    }),
  clearSession: () =>
    set({
      sessionId: null,
      scenarioName: null,
      view: 'setup',
      isRecording: false,
      isReady: false,
      vadActive: false,
      isBotSpeaking: false,
      isAnalyzing: false,
      transcripts: [],
      botMessageCounter: 0,
      feedback: null,
      currentPhase: null,
      phaseDisplayName: null,
    }),
  setRecording: (v) => set({ isRecording: v }),
  setConnected: (v) => set({ isConnected: v }),
  setReady: (v) => set({ isReady: v }),
  setVadActive: (v) => set({ vadActive: v }),
  setBotSpeaking: (v) => set({ isBotSpeaking: v }),
  setAnalyzing: (v) => set({ isAnalyzing: v }),
  setFeedback: (f) => set({ feedback: f }),
  setView: (v) => set({ view: v }),
  setPhase: (phase, displayName) => set({ currentPhase: phase, phaseDisplayName: displayName }),
  addTranscript: (entry) =>
    set((state) => {
      // Replace existing entry with same turnId, or append
      const idx = state.transcripts.findIndex(
        (t) => t.turnId === entry.turnId && t.speaker === entry.speaker,
      )
      if (idx >= 0) {
        const updated = [...state.transcripts]
        updated[idx] = entry
        return { transcripts: updated }
      }
      return { transcripts: [...state.transcripts, entry] }
    }),
  addBotSentence: (text, timestamp) =>
    set((state) => {
      // Accumulate bot sentences into a single transcript entry per response
      const lastBot = [...state.transcripts]
        .reverse()
        .find((t) => t.speaker === 'bot')
      if (lastBot && state.isBotSpeaking) {
        // Append to existing bot message
        const idx = state.transcripts.indexOf(lastBot)
        const updated = [...state.transcripts]
        updated[idx] = {
          ...lastBot,
          text: lastBot.text + ' ' + text,
          timestamp,
        }
        return { transcripts: updated }
      }
      // New bot message
      const counter = state.botMessageCounter - 1
      return {
        botMessageCounter: counter,
        transcripts: [
          ...state.transcripts,
          {
            turnId: counter,
            text,
            isFinal: false,
            timestamp,
            speaker: 'bot',
          },
        ],
      }
    }),
  reset: () =>
    set({
      sessionId: null,
      scenarioName: null,
      view: 'setup',
      isRecording: false,
      isReady: false,
      vadActive: false,
      isBotSpeaking: false,
      isAnalyzing: false,
      transcripts: [],
      botMessageCounter: 0,
      feedback: null,
      currentPhase: null,
      phaseDisplayName: null,
    }),
}))
