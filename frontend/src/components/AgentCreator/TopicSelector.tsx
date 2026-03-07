import { useState } from 'react'
import { useAgentCreatorStore, type ScenarioType } from '../../stores/agentCreatorStore'

const SCENARIO_TYPES: { value: ScenarioType; label: string }[] = [
  { value: 'system_design', label: 'System Design' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'technical', label: 'Technical' },
]

const KNOWLEDGE_COLLECTIONS = [
  { value: 'system_design', label: 'System Design' },
  { value: 'distributed_systems', label: 'Distributed Systems' },
]

const SUGGESTED_FOCUS_AREAS: Record<ScenarioType, string[]> = {
  system_design: [
    'Requirements gathering',
    'High-level architecture',
    'Trade-off analysis',
    'Scalability considerations',
    'Data modeling',
    'API design',
  ],
  behavioral: [
    'Leadership',
    'Teamwork',
    'Conflict resolution',
    'Problem-solving',
    'Communication',
    'Adaptability',
  ],
  technical: [
    'Problem analysis',
    'Solution design',
    'Code quality',
    'Communication',
    'Edge cases',
    'Complexity analysis',
  ],
}

export function TopicSelector() {
  const agentName = useAgentCreatorStore((s) => s.agentName)
  const scenarioType = useAgentCreatorStore((s) => s.scenarioType)
  const focusAreas = useAgentCreatorStore((s) => s.focusAreas)
  const knowledgeCollections = useAgentCreatorStore((s) => s.knowledgeCollections)
  const durationMinutes = useAgentCreatorStore((s) => s.durationMinutes)
  const whiteboardEnabled = useAgentCreatorStore((s) => s.whiteboardEnabled)
  const setAgentName = useAgentCreatorStore((s) => s.setAgentName)
  const setScenarioType = useAgentCreatorStore((s) => s.setScenarioType)
  const setFocusAreas = useAgentCreatorStore((s) => s.setFocusAreas)
  const setKnowledgeCollections = useAgentCreatorStore((s) => s.setKnowledgeCollections)
  const setDurationMinutes = useAgentCreatorStore((s) => s.setDurationMinutes)
  const setWhiteboardEnabled = useAgentCreatorStore((s) => s.setWhiteboardEnabled)
  const [customFocus, setCustomFocus] = useState('')

  const suggestions = SUGGESTED_FOCUS_AREAS[scenarioType]

  const toggleFocusArea = (area: string) => {
    if (focusAreas.includes(area)) {
      setFocusAreas(focusAreas.filter((a) => a !== area))
    } else {
      setFocusAreas([...focusAreas, area])
    }
  }

  const addCustomFocus = () => {
    const trimmed = customFocus.trim()
    if (trimmed && !focusAreas.includes(trimmed)) {
      setFocusAreas([...focusAreas, trimmed])
      setCustomFocus('')
    }
  }

  const toggleCollection = (col: string) => {
    if (knowledgeCollections.includes(col)) {
      setKnowledgeCollections(knowledgeCollections.filter((c) => c !== col))
    } else {
      setKnowledgeCollections([...knowledgeCollections, col])
    }
  }

  return (
    <div className="space-y-4">
      {/* Agent Name */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">Agent Name</label>
        <input
          type="text"
          value={agentName}
          onChange={(e) => setAgentName(e.target.value)}
          placeholder="My Custom Interviewer"
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Scenario Type */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">Interview Type</label>
        <div className="flex gap-1">
          {SCENARIO_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setScenarioType(t.value)}
              className={`flex-1 text-xs py-1.5 px-2 rounded transition-colors ${
                scenarioType === t.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Duration */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">Duration: {durationMinutes} min</label>
        <input
          type="range"
          min={5}
          max={30}
          step={5}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value))}
          className="w-full accent-indigo-500"
        />
        <div className="flex justify-between text-[10px] text-gray-600">
          <span>5 min</span>
          <span>30 min</span>
        </div>
      </div>

      {/* Focus Areas */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">
          Focus Areas ({focusAreas.length})
        </label>
        <div className="flex flex-wrap gap-1">
          {suggestions.map((area) => (
            <button
              key={area}
              onClick={() => toggleFocusArea(area)}
              className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                focusAreas.includes(area)
                  ? 'bg-indigo-600/60 text-indigo-200 border border-indigo-500/40'
                  : 'bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-600'
              }`}
            >
              {area}
            </button>
          ))}
          {focusAreas
            .filter((a) => !suggestions.includes(a))
            .map((area) => (
              <button
                key={area}
                onClick={() => toggleFocusArea(area)}
                className="text-[11px] px-2 py-0.5 rounded bg-indigo-600/60 text-indigo-200 border border-indigo-500/40"
              >
                {area}
              </button>
            ))}
        </div>
        <div className="flex gap-1 mt-1.5">
          <input
            type="text"
            value={customFocus}
            onChange={(e) => setCustomFocus(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomFocus()}
            placeholder="Custom area..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={addCustomFocus}
            className="text-[11px] px-2 py-1 bg-gray-800 text-gray-400 border border-gray-700 rounded hover:bg-gray-700"
          >
            +
          </button>
        </div>
      </div>

      {/* Knowledge Collections */}
      <div>
        <label className="text-xs text-gray-400 block mb-1">RAG Knowledge Base</label>
        <div className="flex flex-wrap gap-1">
          {KNOWLEDGE_COLLECTIONS.map((col) => (
            <button
              key={col.value}
              onClick={() => toggleCollection(col.value)}
              className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                knowledgeCollections.includes(col.value)
                  ? 'bg-emerald-600/60 text-emerald-200 border border-emerald-500/40'
                  : 'bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-600'
              }`}
            >
              {col.label}
            </button>
          ))}
        </div>
      </div>

      {/* Whiteboard */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={whiteboardEnabled}
          onChange={(e) => setWhiteboardEnabled(e.target.checked)}
          className="accent-indigo-500"
        />
        <span className="text-xs text-gray-400">Enable whiteboard</span>
      </label>
    </div>
  )
}
