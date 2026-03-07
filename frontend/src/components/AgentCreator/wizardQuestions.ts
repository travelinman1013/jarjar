import type { ScenarioType } from '../../stores/agentCreatorStore'

export interface AttributeMapping {
  category: 'demeanor' | 'behavior' | 'expertise' | 'evaluation'
  key: string
  value: number
}

export interface ConfigMapping {
  scenarioType?: ScenarioType
  focusAreas?: string[]
  knowledgeCollections?: string[]
  whiteboardEnabled?: boolean
  durationMinutes?: number
}

export interface WizardOption {
  label: string
  description?: string
  attributeMappings: AttributeMapping[]
  configMappings: ConfigMapping
  defaultName?: string
}

export interface WizardQuestion {
  id: string
  question: string
  description?: string
  options: WizardOption[]
}

export const WIZARD_QUESTIONS: WizardQuestion[] = [
  {
    id: 'interview_type',
    question: 'What are you preparing for?',
    options: [
      {
        label: 'System design interview',
        description: 'Architecture, scalability, trade-offs',
        attributeMappings: [],
        configMappings: {
          scenarioType: 'system_design',
          focusAreas: ['Requirements gathering', 'High-level architecture', 'Trade-off analysis', 'Scalability considerations'],
          knowledgeCollections: ['system_design', 'distributed_systems'],
          whiteboardEnabled: true,
        },
        defaultName: 'System Design Coach',
      },
      {
        label: 'Behavioral interview',
        description: 'Leadership, teamwork, conflict resolution',
        attributeMappings: [],
        configMappings: {
          scenarioType: 'behavioral',
          focusAreas: ['Leadership', 'Teamwork', 'Problem-solving', 'Conflict resolution'],
          knowledgeCollections: [],
          whiteboardEnabled: false,
        },
        defaultName: 'Behavioral Practice',
      },
      {
        label: 'Technical deep-dive',
        description: 'Problem analysis, solution design',
        attributeMappings: [],
        configMappings: {
          scenarioType: 'technical',
          focusAreas: ['Problem analysis', 'Solution design', 'Communication'],
          knowledgeCollections: [],
          whiteboardEnabled: false,
        },
        defaultName: 'Technical Deep-dive',
      },
    ],
  },
  {
    id: 'experience',
    question: 'How experienced are you?',
    options: [
      {
        label: 'Early career (0-2 years)',
        attributeMappings: [
          { category: 'expertise', key: 'seniorityLens', value: 15 },
          { category: 'expertise', key: 'technicalDepth', value: 30 },
          { category: 'expertise', key: 'scope', value: 30 },
        ],
        configMappings: {},
      },
      {
        label: 'Mid-level (3-5 years)',
        attributeMappings: [
          { category: 'expertise', key: 'seniorityLens', value: 45 },
          { category: 'expertise', key: 'technicalDepth', value: 50 },
          { category: 'expertise', key: 'scope', value: 50 },
        ],
        configMappings: {},
      },
      {
        label: 'Senior (5-10 years)',
        attributeMappings: [
          { category: 'expertise', key: 'seniorityLens', value: 70 },
          { category: 'expertise', key: 'technicalDepth', value: 65 },
          { category: 'expertise', key: 'scope', value: 65 },
        ],
        configMappings: {},
      },
      {
        label: 'Staff+ (10+ years)',
        attributeMappings: [
          { category: 'expertise', key: 'seniorityLens', value: 90 },
          { category: 'expertise', key: 'technicalDepth', value: 80 },
          { category: 'expertise', key: 'scope', value: 85 },
        ],
        configMappings: {},
      },
    ],
  },
  {
    id: 'toughness',
    question: 'How tough should the feedback be?',
    options: [
      {
        label: 'Go easy on me',
        attributeMappings: [
          { category: 'evaluation', key: 'strictness', value: 20 },
          { category: 'demeanor', key: 'directness', value: 25 },
          { category: 'evaluation', key: 'feedbackDetail', value: 40 },
        ],
        configMappings: {},
      },
      {
        label: 'Balanced -- honest but fair',
        attributeMappings: [
          { category: 'evaluation', key: 'strictness', value: 50 },
          { category: 'demeanor', key: 'directness', value: 50 },
          { category: 'evaluation', key: 'feedbackDetail', value: 55 },
        ],
        configMappings: {},
      },
      {
        label: "Don't hold back",
        attributeMappings: [
          { category: 'evaluation', key: 'strictness', value: 80 },
          { category: 'demeanor', key: 'directness', value: 80 },
          { category: 'evaluation', key: 'feedbackDetail', value: 75 },
        ],
        configMappings: {},
      },
      {
        label: 'Destroy me (Staff+ panel)',
        attributeMappings: [
          { category: 'evaluation', key: 'strictness', value: 95 },
          { category: 'demeanor', key: 'directness', value: 90 },
          { category: 'evaluation', key: 'feedbackDetail', value: 90 },
        ],
        configMappings: {},
      },
    ],
  },
  {
    id: 'hints',
    question: 'Should they give hints when you\'re stuck?',
    options: [
      {
        label: 'Yes, guide me through it',
        attributeMappings: [
          { category: 'behavior', key: 'scaffolding', value: 85 },
          { category: 'behavior', key: 'challengeStyle', value: 25 },
        ],
        configMappings: {},
      },
      {
        label: 'A nudge in the right direction',
        attributeMappings: [
          { category: 'behavior', key: 'scaffolding', value: 55 },
          { category: 'behavior', key: 'challengeStyle', value: 45 },
        ],
        configMappings: {},
      },
      {
        label: 'No hints -- sink or swim',
        attributeMappings: [
          { category: 'behavior', key: 'scaffolding', value: 15 },
          { category: 'behavior', key: 'challengeStyle', value: 75 },
        ],
        configMappings: {},
      },
    ],
  },
  {
    id: 'duration',
    question: 'How much time do you have?',
    options: [
      {
        label: 'Quick practice (5-10 min)',
        attributeMappings: [
          { category: 'behavior', key: 'probeDepth', value: 30 },
        ],
        configMappings: { durationMinutes: 10 },
      },
      {
        label: 'Standard session (15-20 min)',
        attributeMappings: [
          { category: 'behavior', key: 'probeDepth', value: 55 },
        ],
        configMappings: { durationMinutes: 20 },
      },
      {
        label: 'Full mock (25-30 min)',
        attributeMappings: [
          { category: 'behavior', key: 'probeDepth', value: 80 },
        ],
        configMappings: { durationMinutes: 30 },
      },
    ],
  },
  {
    id: 'personality',
    question: 'What kind of personality?',
    options: [
      {
        label: 'Warm and casual',
        attributeMappings: [
          { category: 'demeanor', key: 'warmth', value: 80 },
          { category: 'demeanor', key: 'formality', value: 20 },
        ],
        configMappings: {},
      },
      {
        label: 'Friendly but professional',
        attributeMappings: [
          { category: 'demeanor', key: 'warmth', value: 60 },
          { category: 'demeanor', key: 'formality', value: 50 },
        ],
        configMappings: {},
      },
      {
        label: 'Formal corporate panel',
        attributeMappings: [
          { category: 'demeanor', key: 'warmth', value: 25 },
          { category: 'demeanor', key: 'formality', value: 85 },
        ],
        configMappings: {},
      },
    ],
  },
  {
    id: 'patience',
    question: 'How patient should they be?',
    options: [
      {
        label: 'Move fast, keep me on my toes',
        attributeMappings: [
          { category: 'behavior', key: 'patience', value: 20 },
        ],
        configMappings: {},
      },
      {
        label: 'Normal pace',
        attributeMappings: [
          { category: 'behavior', key: 'patience', value: 50 },
        ],
        configMappings: {},
      },
      {
        label: 'Very patient -- let me think',
        attributeMappings: [
          { category: 'behavior', key: 'patience', value: 85 },
        ],
        configMappings: {},
      },
    ],
  },
]
