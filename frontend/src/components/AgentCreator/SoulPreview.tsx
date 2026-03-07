import { useState, useEffect, useRef } from 'react'
import { useAgentCreatorStore } from '../../stores/agentCreatorStore'
import { compileConfig, type CompiledScenarioConfig } from '../../lib/agentCompiler'

export function SoulPreview() {
  const [config, setConfig] = useState<CompiledScenarioConfig | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const update = () => {
      const state = useAgentCreatorStore.getState()
      setConfig(compileConfig(state))
    }

    // Initial compile
    update()

    // Debounced subscribe
    const unsub = useAgentCreatorStore.subscribe(() => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(update, 300)
    })

    return () => {
      unsub()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  if (!config) return null

  return (
    <div className="h-full flex flex-col text-xs font-mono">
      {/* System Prompt */}
      <div className="mb-4">
        <h4 className="text-indigo-400 font-semibold mb-1 font-sans text-[11px] uppercase tracking-wider">
          System Prompt
        </h4>
        <div className="bg-gray-900/80 rounded p-3 text-gray-300 leading-relaxed whitespace-pre-wrap border border-gray-800">
          {config.system_prompt}
        </div>
      </div>

      {/* Meta */}
      <div className="flex gap-3 mb-4 text-[11px]">
        <span className="text-gray-500">
          Type: <span className="text-gray-300">{config.type}</span>
        </span>
        <span className="text-gray-500">
          Difficulty: <span className="text-gray-300">{config.difficulty}</span>
        </span>
        <span className="text-gray-500">
          Duration: <span className="text-gray-300">{config.duration_minutes}m</span>
        </span>
      </div>

      {/* Phases */}
      <div className="mb-4">
        <h4 className="text-indigo-400 font-semibold mb-1 font-sans text-[11px] uppercase tracking-wider">
          Phases ({config.phases.length})
        </h4>
        <div className="space-y-1">
          {config.phases.map((phase, i) => (
            <div key={phase.name} className="bg-gray-900/80 rounded px-3 py-1.5 border border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-gray-200">
                  {i + 1}. {phase.display_name}
                </span>
                <span className="text-gray-600">
                  max {phase.max_turns} turns
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Focus Areas */}
      <div className="mb-4">
        <h4 className="text-indigo-400 font-semibold mb-1 font-sans text-[11px] uppercase tracking-wider">
          Focus Areas
        </h4>
        <div className="flex flex-wrap gap-1">
          {config.focus_areas.map((area) => (
            <span
              key={area}
              className="bg-gray-900/80 text-gray-300 px-2 py-0.5 rounded border border-gray-800"
            >
              {area}
            </span>
          ))}
        </div>
      </div>

      {/* Rubrics Summary */}
      {Object.keys(config.rubrics).length > 0 && (
        <div>
          <h4 className="text-indigo-400 font-semibold mb-1 font-sans text-[11px] uppercase tracking-wider">
            Rubric Anchors
          </h4>
          <div className="space-y-2">
            {Object.entries(config.rubrics).map(([area, levels]) => (
              <div key={area} className="bg-gray-900/80 rounded p-2 border border-gray-800">
                <div className="text-gray-200 mb-1">{area}</div>
                <div className="space-y-0.5 text-[10px] text-gray-500">
                  {Object.entries(levels).map(([level, desc]) => (
                    <div key={level}>
                      <span className="text-gray-400 font-semibold">{level}:</span>{' '}
                      {desc}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
