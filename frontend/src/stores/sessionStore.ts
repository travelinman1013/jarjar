import { create } from 'zustand'

export interface TranscriptEntry {
  turnId: number
  text: string
  isFinal: boolean
  timestamp: number
  speaker: 'user' | 'bot'
  phase?: string
}

export interface DimensionScore {
  dimension: string
  score: number
  rubric_level: string
  evidence_quote: string
  suggestion: string
}

export interface PhaseScoreData {
  phase_name: string
  phase_display_name: string
  phase_order: number
  dimension_scores: DimensionScore[]
  phase_summary: string
  stronger_answer: string
}

export interface DiagramSnapshotData {
  phase_name: string
  phase_display_name: string
  snapshot_json: string
  serialized_text: string
  shape_count: number
}

export interface FeedbackData {
  overall_score: number
  clarity_score: number
  structure_score: number
  depth_score: number
  best_moment: string
  biggest_opportunity: string
  filler_word_count: number
  phase_scores?: PhaseScoreData[]
  dimensions?: string[]
  technical_accuracy_notes?: string
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
  whiteboardEnabled: boolean
  diagramSnapshots: DiagramSnapshotData[]
  isBotThinking: boolean
  phaseList: { name: string; display_name: string }[]
  scenarioDuration: number | null
  error: string | null

  setSession: (id: number, scenario: string, whiteboardEnabled?: boolean) => void
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
  setDiagramSnapshots: (snapshots: DiagramSnapshotData[]) => void
  setBotThinking: (v: boolean) => void
  setPhaseList: (phases: { name: string; display_name: string }[]) => void
  setScenarioDuration: (minutes: number | null) => void
  setError: (msg: string | null) => void
  loadPastSession: (
    id: number,
    scenario: string,
    transcripts: TranscriptEntry[],
    feedback: FeedbackData | null,
    diagramSnapshots: DiagramSnapshotData[],
  ) => void
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
  whiteboardEnabled: false,
  diagramSnapshots: [],
  isBotThinking: false,
  phaseList: [],
  scenarioDuration: null,
  error: null,

  setSession: (id, scenario, whiteboardEnabled = false) =>
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
      whiteboardEnabled,
      diagramSnapshots: [],
      isBotThinking: false,
      phaseList: [],
      scenarioDuration: null,
      error: null,
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
      whiteboardEnabled: false,
      diagramSnapshots: [],
      isBotThinking: false,
      phaseList: [],
      scenarioDuration: null,
      error: null,
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
  setDiagramSnapshots: (snapshots) => set({ diagramSnapshots: snapshots }),
  setBotThinking: (v) => set({ isBotThinking: v }),
  setPhaseList: (phases) => set({ phaseList: phases }),
  setScenarioDuration: (minutes) => set({ scenarioDuration: minutes }),
  setError: (msg) => set({ error: msg }),
  loadPastSession: (id, scenario, transcripts, feedback, diagramSnapshots) =>
    set({
      sessionId: id,
      scenarioName: scenario,
      view: 'review',
      transcripts,
      feedback,
      diagramSnapshots,
      isAnalyzing: false,
    }),
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
      const lastBotIdx = state.transcripts.findLastIndex(
        (t) => t.speaker === 'bot',
      )
      const lastBot = lastBotIdx >= 0 ? state.transcripts[lastBotIdx] : null

      // Check if a user message arrived after the last bot message — if so, this is a new response
      const hasUserSinceLast =
        lastBotIdx >= 0 &&
        state.transcripts.slice(lastBotIdx + 1).some((t) => t.speaker === 'user')

      if (lastBot && state.isBotSpeaking && !hasUserSinceLast) {
        // Append to existing bot message (continuation of current response)
        const updated = [...state.transcripts]
        updated[lastBotIdx] = {
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
      whiteboardEnabled: false,
      diagramSnapshots: [],
      isBotThinking: false,
      phaseList: [],
      scenarioDuration: null,
      error: null,
    }),
}))
