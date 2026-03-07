import { create } from 'zustand'

export interface DemeanorAttributes {
  warmth: number        // 0-100: Clinical → Encouraging
  directness: number    // 0-100: Diplomatic → Blunt
  formality: number     // 0-100: Casual Peer → Corporate Panel
}

export interface BehaviorAttributes {
  probeDepth: number    // 0-100: Surface → Relentless
  patience: number      // 0-100: Rushes You → Infinite
  scaffolding: number   // 0-100: Sink or Swim → Full Guidance
  challengeStyle: number // 0-100: Gentle Nudge → Devil's Advocate
}

export interface ExpertiseAttributes {
  technicalDepth: number // 0-100: Conceptual → Implementation
  scope: number          // 0-100: Narrow Focus → Cross-cutting
  seniorityLens: number  // 0-100: Junior Bar → Staff+ Bar
}

export interface EvaluationAttributes {
  strictness: number     // 0-100: Generous → Unforgiving
  feedbackDetail: number // 0-100: Big Picture → Microscopic
}

export interface AgentAttributes {
  demeanor: DemeanorAttributes
  behavior: BehaviorAttributes
  expertise: ExpertiseAttributes
  evaluation: EvaluationAttributes
}

export type ScenarioType = 'system_design' | 'technical' | 'behavioral'

export interface AgentCreatorState {
  attributes: AgentAttributes
  agentName: string
  scenarioType: ScenarioType
  focusAreas: string[]
  knowledgeCollections: string[]
  durationMinutes: number
  whiteboardEnabled: boolean
  wizardMode: boolean
  wizardStep: number
  setAttribute: (category: keyof AgentAttributes, key: string, value: number) => void
  setAgentName: (name: string) => void
  setScenarioType: (type: ScenarioType) => void
  setFocusAreas: (areas: string[]) => void
  setKnowledgeCollections: (collections: string[]) => void
  setDurationMinutes: (minutes: number) => void
  setWhiteboardEnabled: (enabled: boolean) => void
  setWizardMode: (mode: boolean) => void
  setWizardStep: (step: number) => void
  resetAttributes: () => void
  resetAll: () => void
}

const DEFAULT_ATTRIBUTES: AgentAttributes = {
  demeanor: {
    warmth: 50,
    directness: 50,
    formality: 50,
  },
  behavior: {
    probeDepth: 50,
    patience: 50,
    scaffolding: 50,
    challengeStyle: 50,
  },
  expertise: {
    technicalDepth: 50,
    scope: 50,
    seniorityLens: 50,
  },
  evaluation: {
    strictness: 50,
    feedbackDetail: 50,
  },
}

const DEFAULT_CONFIG = {
  agentName: '',
  scenarioType: 'system_design' as ScenarioType,
  focusAreas: [] as string[],
  knowledgeCollections: [] as string[],
  durationMinutes: 15,
  whiteboardEnabled: false,
  wizardMode: false,
  wizardStep: 0,
}

export const useAgentCreatorStore = create<AgentCreatorState>()((set) => ({
  attributes: { ...DEFAULT_ATTRIBUTES },
  ...DEFAULT_CONFIG,
  setAttribute: (category, key, value) =>
    set((state) => ({
      attributes: {
        ...state.attributes,
        [category]: {
          ...state.attributes[category],
          [key]: value,
        },
      },
    })),
  setAgentName: (agentName) => set({ agentName }),
  setScenarioType: (scenarioType) => set({ scenarioType }),
  setFocusAreas: (focusAreas) => set({ focusAreas }),
  setKnowledgeCollections: (knowledgeCollections) => set({ knowledgeCollections }),
  setDurationMinutes: (durationMinutes) => set({ durationMinutes }),
  setWhiteboardEnabled: (whiteboardEnabled) => set({ whiteboardEnabled }),
  setWizardMode: (wizardMode) => set({ wizardMode }),
  setWizardStep: (wizardStep) => set({ wizardStep }),
  resetAttributes: () => set({ attributes: { ...DEFAULT_ATTRIBUTES } }),
  resetAll: () => set({ attributes: { ...DEFAULT_ATTRIBUTES }, ...DEFAULT_CONFIG }),
}))
