import type { AgentAttributes, ScenarioType } from '../stores/agentCreatorStore'

interface PhaseConfig {
  name: string
  display_name: string
  objective: string
  prompt_injection: string
  max_turns: number
  min_turns: number
  transition_hint: string
  next_phases: string[]
}

export interface CompiledScenarioConfig {
  name: string
  type: string
  difficulty: string
  duration_minutes: number
  system_prompt: string
  focus_areas: string[]
  evaluation_criteria: string[]
  phases: PhaseConfig[]
  knowledge_collections: string[]
  rubrics: Record<string, Record<string, string>>
  phase_exemplars: Record<string, Record<string, string>>
  whiteboard_enabled: boolean
}

const AUDIO_INSTRUCTION = 'You are speaking over audio. Do NOT use emojis, asterisks, or markdown formatting. Use plain, conversational text.'

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * (t / 100)
}

function buildSystemPrompt(attrs: AgentAttributes): string {
  const parts: string[] = []

  // Role opener
  parts.push('You are an interviewer conducting a practice interview session.')

  // Warmth
  const w = attrs.demeanor.warmth
  if (w <= 30) {
    parts.push('Be direct and clinical in tone. Do not offer encouragement or pleasantries unless the candidate excels.')
  } else if (w >= 70) {
    parts.push('Be warm and encouraging. Acknowledge good answers with genuine praise and create a supportive atmosphere.')
  } else {
    parts.push('Balance professionalism with occasional encouragement when the candidate makes good points.')
  }

  // Directness
  const d = attrs.demeanor.directness
  if (d <= 30) {
    parts.push('Be diplomatic. Frame criticism as suggestions and use softening language like "you might consider" or "one approach could be".')
  } else if (d >= 70) {
    parts.push('Be blunt and direct. Point out weaknesses clearly without sugar-coating. Say exactly what was wrong and why.')
  } else {
    parts.push('Give honest feedback that balances directness with tact.')
  }

  // Formality
  const f = attrs.demeanor.formality
  if (f <= 30) {
    parts.push('Use casual, conversational language. Be a peer, not a panel. First names, contractions, and natural speech patterns.')
  } else if (f >= 70) {
    parts.push('Maintain a professional, corporate register. Formal tone, structured questions, and industry-standard terminology.')
  }

  // Probe Depth
  const pd = attrs.behavior.probeDepth
  if (pd >= 70) {
    parts.push('Ask relentless follow-up questions. When the candidate gives an answer, dig deeper. Ask "why", "how", and "what if" until you reach the limits of their knowledge.')
  } else if (pd <= 30) {
    parts.push('Ask one or two clarifying questions per topic, then move on. Do not dwell on any single point.')
  }

  // Patience
  const p = attrs.behavior.patience
  if (p >= 70) {
    parts.push('Be patient. Allow the candidate time to think. Do not rush or interrupt their thought process.')
  } else if (p <= 30) {
    parts.push('Keep the pace brisk. If the candidate pauses too long or rambles, redirect them to move forward.')
  }

  // Scaffolding
  const sc = attrs.behavior.scaffolding
  if (sc >= 70) {
    parts.push('Provide hints and guidance when the candidate is stuck. Offer frameworks, suggest starting points, and help them structure their thinking.')
  } else if (sc <= 30) {
    parts.push('Sink or swim. Do not provide hints or guidance. Let the candidate figure things out on their own. Only clarify the problem statement if asked.')
  }

  // Challenge Style
  const cs = attrs.behavior.challengeStyle
  if (cs >= 70) {
    parts.push('Play devil\'s advocate. Challenge assumptions aggressively. Push back on proposals and force the candidate to defend their choices with evidence.')
  } else if (cs <= 30) {
    parts.push('Be supportive of the candidate\'s ideas. Ask gentle clarifying questions rather than challenging their approach directly.')
  }

  // Technical Depth
  const td = attrs.expertise.technicalDepth
  if (td >= 70) {
    parts.push('Focus on implementation details. Ask about specific data structures, algorithms, failure modes, concrete numbers, and code-level decisions.')
  } else if (td <= 30) {
    parts.push('Keep the discussion at a conceptual level. Focus on architecture, trade-offs, and high-level design rather than implementation specifics.')
  }

  // Scope
  const scp = attrs.expertise.scope
  if (scp >= 70) {
    parts.push('Explore cross-cutting concerns. Ask about monitoring, deployment, security, cost, team structure, and how the system fits into the broader organization.')
  } else if (scp <= 30) {
    parts.push('Stay focused on the core problem. Do not branch into tangential concerns unless the candidate brings them up.')
  }

  parts.push(AUDIO_INSTRUCTION)

  return parts.join(' ')
}

function deriveDifficulty(attrs: AgentAttributes): string {
  const avg = (attrs.expertise.seniorityLens + attrs.evaluation.strictness + attrs.behavior.probeDepth) / 3
  if (avg >= 65) return 'hard'
  if (avg >= 35) return 'medium'
  return 'easy'
}

function deriveMaxTurns(baseMax: number, probeDepth: number): number {
  // probeDepth 0 → 60% of base, probeDepth 100 → 140% of base
  const factor = lerp(0.6, 1.4, probeDepth)
  return Math.max(2, Math.round(baseMax * factor))
}

const SYSTEM_DESIGN_PHASES: PhaseConfig[] = [
  {
    name: 'opening',
    display_name: 'Opening',
    objective: 'Present the system design problem clearly and set expectations.',
    prompt_injection: 'You are in the opening phase. Present a system design problem to the candidate in two to three sentences. Ask them how they would like to approach it. Do not start designing yet.',
    max_turns: 2,
    min_turns: 1,
    transition_hint: 'The candidate has acknowledged the problem and is ready to begin.',
    next_phases: ['requirements'],
  },
  {
    name: 'requirements',
    display_name: 'Requirements Gathering',
    objective: 'Guide the candidate to clarify functional and non-functional requirements.',
    prompt_injection: 'You are in the requirements gathering phase. The candidate should be asking clarifying questions about scale, users, latency, and feature priorities. Answer their questions honestly. If they jump straight to design without asking questions, gently redirect them to gather requirements first.',
    max_turns: 6,
    min_turns: 2,
    transition_hint: 'The candidate has identified at least three key requirements or constraints.',
    next_phases: ['high_level_design'],
  },
  {
    name: 'high_level_design',
    display_name: 'High-Level Design',
    objective: 'Have the candidate propose an overall architecture with major components.',
    prompt_injection: 'You are in the high-level design phase. Ask the candidate to walk through the main components of their system and how data flows between them. Probe on choices of databases, caches, queues, and APIs.',
    max_turns: 6,
    min_turns: 2,
    transition_hint: 'The candidate has described major components and their interactions.',
    next_phases: ['deep_dive'],
  },
  {
    name: 'deep_dive',
    display_name: 'Deep Dive',
    objective: 'Drill into one component with specifics on data structures, algorithms, and edge cases.',
    prompt_injection: 'Pick one component from the candidate\'s design and go deep. Ask about specific data structures, algorithms, failure modes, and scaling limits. Challenge their assumptions with follow-up questions.',
    max_turns: 8,
    min_turns: 3,
    transition_hint: 'The component has been explored in sufficient depth or the candidate is struggling.',
    next_phases: ['curveball', 'wrap_up'],
  },
  {
    name: 'curveball',
    display_name: 'Failure Scenarios',
    objective: 'Present a realistic failure scenario to test resilience thinking.',
    prompt_injection: 'Present a failure scenario related to the design. For example, a node crashes, traffic spikes tenfold, or a region goes down. See how the candidate adapts their design to handle it.',
    max_turns: 4,
    min_turns: 1,
    transition_hint: 'The candidate has addressed the failure scenario.',
    next_phases: ['wrap_up'],
  },
  {
    name: 'wrap_up',
    display_name: 'Wrap Up',
    objective: 'Summarize what was covered and close the interview warmly.',
    prompt_injection: 'Wrap up the interview. Briefly summarize the main topics you covered. Ask the candidate if they have any questions. Give one sentence of encouragement about their performance.',
    max_turns: 2,
    min_turns: 1,
    transition_hint: 'Always terminal.',
    next_phases: [],
  },
]

const BEHAVIORAL_PHASES: PhaseConfig[] = [
  {
    name: 'opening',
    display_name: 'Opening',
    objective: 'Warm greeting and set expectations for the behavioral interview.',
    prompt_injection: 'You are in the opening phase. Greet the candidate and explain that you will be asking behavioral questions using the STAR method. Ask them to share a brief overview of their recent experience to get started.',
    max_turns: 2,
    min_turns: 1,
    transition_hint: 'The candidate has introduced themselves and is ready for questions.',
    next_phases: ['star_situation'],
  },
  {
    name: 'star_situation',
    display_name: 'Situation and Task',
    objective: 'Get the candidate to clearly describe a specific situation and their role.',
    prompt_injection: 'Ask a behavioral question. Focus on getting the candidate to describe a specific situation and their task or responsibility in it. If they are vague, ask follow-up questions to get concrete details about context and stakes.',
    max_turns: 5,
    min_turns: 2,
    transition_hint: 'The candidate has described a clear situation with specific context.',
    next_phases: ['star_action'],
  },
  {
    name: 'star_action',
    display_name: 'Action',
    objective: 'Understand exactly what actions the candidate took and why.',
    prompt_injection: 'Probe deeper into the actions the candidate took. Ask what specifically they did, what alternatives they considered, and why they chose their approach. If the candidate uses "we" too much, ask what they personally did.',
    max_turns: 5,
    min_turns: 2,
    transition_hint: 'The candidate has described their specific actions with clear reasoning.',
    next_phases: ['star_result'],
  },
  {
    name: 'star_result',
    display_name: 'Result and Reflection',
    objective: 'Get measurable outcomes and reflections on the experience.',
    prompt_injection: 'Ask about the results and outcomes. Push for specific metrics or measurable impact. Ask what they learned and what they would do differently.',
    max_turns: 4,
    min_turns: 2,
    transition_hint: 'The candidate has shared outcomes and reflections.',
    next_phases: ['wrap_up'],
  },
  {
    name: 'wrap_up',
    display_name: 'Wrap Up',
    objective: 'Summarize feedback and close with encouragement.',
    prompt_injection: 'Wrap up the interview. Give a brief summary of what went well and one area to improve. Ask if the candidate has any questions. End on an encouraging note.',
    max_turns: 2,
    min_turns: 1,
    transition_hint: 'Always terminal.',
    next_phases: [],
  },
]

const TECHNICAL_PHASES: PhaseConfig[] = [
  {
    name: 'opening',
    display_name: 'Opening',
    objective: 'Present the technical problem and set expectations.',
    prompt_injection: 'You are in the opening phase. Present a technical problem to the candidate. Explain what you expect from them and ask if they have any clarifying questions before starting.',
    max_turns: 2,
    min_turns: 1,
    transition_hint: 'The candidate understands the problem and is ready to begin.',
    next_phases: ['problem_exploration'],
  },
  {
    name: 'problem_exploration',
    display_name: 'Problem Exploration',
    objective: 'Have the candidate break down the problem and identify key challenges.',
    prompt_injection: 'Ask the candidate to break down the problem. What are the key challenges? What approaches are they considering? Probe their understanding of the problem space.',
    max_turns: 5,
    min_turns: 2,
    transition_hint: 'The candidate has identified the key challenges and has an approach in mind.',
    next_phases: ['solution'],
  },
  {
    name: 'solution',
    display_name: 'Solution',
    objective: 'Have the candidate walk through their solution in detail.',
    prompt_injection: 'Ask the candidate to walk through their solution step by step. Challenge their choices. Ask about edge cases, time complexity, and alternative approaches.',
    max_turns: 8,
    min_turns: 3,
    transition_hint: 'The candidate has presented a complete solution.',
    next_phases: ['wrap_up'],
  },
  {
    name: 'wrap_up',
    display_name: 'Wrap Up',
    objective: 'Summarize and close the interview.',
    prompt_injection: 'Wrap up the interview. Briefly summarize the solution discussed. Ask if the candidate has any questions. Give one sentence of encouragement.',
    max_turns: 2,
    min_turns: 1,
    transition_hint: 'Always terminal.',
    next_phases: [],
  },
]

function getPhaseTemplate(type: ScenarioType): PhaseConfig[] {
  switch (type) {
    case 'system_design': return SYSTEM_DESIGN_PHASES
    case 'behavioral': return BEHAVIORAL_PHASES
    case 'technical': return TECHNICAL_PHASES
  }
}

function applyAttributesToPhases(phases: PhaseConfig[], attrs: AgentAttributes): PhaseConfig[] {
  const { probeDepth, challengeStyle, scaffolding } = attrs.behavior

  return phases.map((phase) => {
    const injections: string[] = [phase.prompt_injection]

    if (challengeStyle >= 70 && phase.name !== 'opening' && phase.name !== 'wrap_up') {
      injections.push('Play devil\'s advocate. Push back on the candidate\'s assumptions and force them to defend their choices.')
    }

    if (scaffolding >= 70 && phase.name !== 'wrap_up') {
      injections.push('If the candidate seems stuck, provide a hint or suggest a framework to help them organize their thinking.')
    }

    if (probeDepth >= 70 && phase.name !== 'opening' && phase.name !== 'wrap_up') {
      injections.push('Ask follow-up questions to dig deeper. Do not accept surface-level answers.')
    }

    return {
      ...phase,
      prompt_injection: injections.join(' '),
      max_turns: deriveMaxTurns(phase.max_turns, probeDepth),
    }
  })
}

function buildRubrics(focusAreas: string[], seniorityLens: number): Record<string, Record<string, string>> {
  const rubrics: Record<string, Record<string, string>> = {}
  const seniority = seniorityLens / 100

  for (const area of focusAreas) {
    if (seniority >= 0.7) {
      // Staff+ bar
      rubrics[area] = {
        '3': `Fails to demonstrate basic competence in ${area.toLowerCase()}. Missing foundational understanding that would be expected at any level.`,
        '5': `Shows basic understanding of ${area.toLowerCase()} but lacks depth. Would need significant mentoring to operate independently.`,
        '7': `Solid grasp of ${area.toLowerCase()} with good practical examples. Identifies trade-offs and can defend choices with evidence.`,
        '9': `Expert-level ${area.toLowerCase()}. Demonstrates quantitative reasoning, considers second-order effects, and shows strategic thinking beyond the immediate problem.`,
      }
    } else if (seniority >= 0.3) {
      // Mid-level bar
      rubrics[area] = {
        '3': `Struggles to address ${area.toLowerCase()}. Needs significant prompting to engage with the topic.`,
        '5': `Basic awareness of ${area.toLowerCase()} but explanations are vague or incomplete.`,
        '7': `Good understanding of ${area.toLowerCase()}. Provides clear examples and reasoning.`,
        '9': `Strong command of ${area.toLowerCase()}. Proactively addresses nuances and demonstrates depth beyond what was asked.`,
      }
    } else {
      // Junior bar
      rubrics[area] = {
        '3': `Does not attempt to address ${area.toLowerCase()}.`,
        '5': `Shows some awareness of ${area.toLowerCase()} but cannot elaborate when asked.`,
        '7': `Demonstrates clear understanding of ${area.toLowerCase()} with at least one concrete example.`,
        '9': `Impressive grasp of ${area.toLowerCase()} for their level. Communicates clearly and shows genuine curiosity.`,
      }
    }
  }

  return rubrics
}

function buildEvaluationCriteria(focusAreas: string[]): string[] {
  return focusAreas.map((area) => `Demonstrates competence in ${area.toLowerCase()}`)
}

function toSnakeCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
}

export function compileConfig(state: {
  attributes: AgentAttributes
  agentName: string
  scenarioType: ScenarioType
  focusAreas: string[]
  knowledgeCollections: string[]
  durationMinutes: number
  whiteboardEnabled: boolean
}): CompiledScenarioConfig {
  const { attributes, agentName, scenarioType, focusAreas, knowledgeCollections, durationMinutes, whiteboardEnabled } = state
  const name = toSnakeCase(agentName || 'custom_agent')
  const phases = applyAttributesToPhases(getPhaseTemplate(scenarioType), attributes)

  return {
    name,
    type: scenarioType === 'system_design' ? 'technical' : scenarioType,
    difficulty: deriveDifficulty(attributes),
    duration_minutes: durationMinutes,
    system_prompt: buildSystemPrompt(attributes),
    focus_areas: focusAreas.length > 0 ? focusAreas : getDefaultFocusAreas(scenarioType),
    evaluation_criteria: buildEvaluationCriteria(focusAreas.length > 0 ? focusAreas : getDefaultFocusAreas(scenarioType)),
    phases,
    knowledge_collections: knowledgeCollections,
    rubrics: buildRubrics(focusAreas.length > 0 ? focusAreas : getDefaultFocusAreas(scenarioType), attributes.expertise.seniorityLens),
    phase_exemplars: {},
    whiteboard_enabled: whiteboardEnabled,
  }
}

function getDefaultFocusAreas(type: ScenarioType): string[] {
  switch (type) {
    case 'system_design':
      return ['Requirements gathering', 'High-level architecture', 'Trade-off analysis', 'Scalability considerations']
    case 'behavioral':
      return ['Leadership', 'Teamwork', 'Problem-solving']
    case 'technical':
      return ['Problem analysis', 'Solution design', 'Communication']
  }
}

export function deriveSilenceMs(patience: number): number {
  return Math.round(lerp(300, 2000, patience))
}
