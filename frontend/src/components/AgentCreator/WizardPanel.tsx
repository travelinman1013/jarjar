import { useState, useRef, useCallback, useEffect } from 'react'
import { useAgentCreatorStore } from '../../stores/agentCreatorStore'
import { WIZARD_QUESTIONS, type WizardOption } from './wizardQuestions'

const TOTAL_QUESTIONS = WIZARD_QUESTIONS.length

export function WizardPanel() {
  const store = useAgentCreatorStore()
  const { wizardStep, setWizardStep, setWizardMode } = store
  const [selections, setSelections] = useState<Record<number, number>>({})
  const [selectedFlash, setSelectedFlash] = useState<number | null>(null)
  const advancingRef = useRef(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [defaultName, setDefaultName] = useState('')

  const isNameStep = wizardStep >= TOTAL_QUESTIONS

  useEffect(() => {
    if (isNameStep && nameInputRef.current) {
      nameInputRef.current.focus()
    }
  }, [isNameStep])

  const applyMappings = useCallback((option: WizardOption) => {
    const s = useAgentCreatorStore.getState()
    for (const m of option.attributeMappings) {
      s.setAttribute(m.category, m.key, m.value)
    }
    const c = option.configMappings
    if (c.scenarioType) s.setScenarioType(c.scenarioType)
    if (c.focusAreas) s.setFocusAreas(c.focusAreas)
    if (c.knowledgeCollections) s.setKnowledgeCollections(c.knowledgeCollections)
    if (c.whiteboardEnabled !== undefined) s.setWhiteboardEnabled(c.whiteboardEnabled)
    if (c.durationMinutes) s.setDurationMinutes(c.durationMinutes)
  }, [])

  const handleSelect = useCallback((optionIndex: number) => {
    if (advancingRef.current) return
    advancingRef.current = true

    const question = WIZARD_QUESTIONS[wizardStep]
    if (!question) return
    const option = question.options[optionIndex]

    setSelections((prev) => ({ ...prev, [wizardStep]: optionIndex }))
    setSelectedFlash(optionIndex)
    applyMappings(option)

    if (option.defaultName) {
      setDefaultName(option.defaultName)
    }

    const timeout = setTimeout(() => {
      setSelectedFlash(null)
      setWizardStep(wizardStep + 1)
      advancingRef.current = false
    }, 400)

    return () => clearTimeout(timeout)
  }, [wizardStep, setWizardStep, applyMappings])

  const handleBack = useCallback(() => {
    if (wizardStep > 0) {
      setWizardStep(wizardStep - 1)
    }
  }, [wizardStep, setWizardStep])

  const handleSwitchToAdvanced = useCallback(() => {
    setWizardMode(false)
  }, [setWizardMode])

  if (isNameStep) {
    return (
      <div className="flex flex-col h-full p-6">
        <button
          onClick={handleBack}
          className="text-gray-500 hover:text-gray-300 text-sm mb-6 self-start transition-colors"
        >
          &larr; Back
        </button>

        <div className="flex-1 flex flex-col justify-center">
          <p className="text-lg text-gray-100 font-medium mb-2">
            Name your agent
          </p>
          <p className="text-sm text-gray-400 mb-6">
            Give your interviewer a memorable name
          </p>

          <input
            ref={nameInputRef}
            type="text"
            value={store.agentName || defaultName}
            onChange={(e) => {
              useAgentCreatorStore.getState().setAgentName(e.target.value)
            }}
            onFocus={() => {
              if (!store.agentName && defaultName) {
                useAgentCreatorStore.getState().setAgentName(defaultName)
              }
            }}
            placeholder={defaultName || 'My Interviewer'}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        <button
          onClick={handleSwitchToAdvanced}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors mt-6 self-center"
        >
          Switch to Advanced Mode
        </button>
      </div>
    )
  }

  const question = WIZARD_QUESTIONS[wizardStep]

  return (
    <div className="flex flex-col h-full p-6">
      {/* Header: back + step counter */}
      <div className="flex items-center justify-between mb-6">
        {wizardStep > 0 ? (
          <button
            onClick={handleBack}
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            &larr; Back
          </button>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL_QUESTIONS }, (_, i) => (
            <div
              key={i}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                i < wizardStep
                  ? 'bg-indigo-500'
                  : i === wizardStep
                    ? 'bg-indigo-400'
                    : 'bg-gray-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Question */}
      <div className="mb-6">
        <p className="text-xs text-gray-500 mb-2">
          {wizardStep + 1} of {TOTAL_QUESTIONS}
        </p>
        <p className="text-lg text-gray-100 font-medium">
          {question.question}
        </p>
        {question.description && (
          <p className="text-sm text-gray-400 mt-1">{question.description}</p>
        )}
      </div>

      {/* Options */}
      <div className="flex-1 flex flex-col gap-3">
        {question.options.map((option, i) => {
          const isSelected = selections[wizardStep] === i
          const isFlashing = selectedFlash === i

          return (
            <button
              key={option.label}
              onClick={() => handleSelect(i)}
              className={`text-left rounded-lg p-4 transition-all duration-200 ${
                isFlashing
                  ? 'border border-indigo-500 bg-indigo-950/30'
                  : isSelected
                    ? 'border border-indigo-500/50 bg-gray-800'
                    : 'border border-gray-700 bg-gray-800/50 hover:border-indigo-500/50 hover:bg-gray-800'
              }`}
            >
              <span className="text-sm text-gray-200">{option.label}</span>
              {option.description && (
                <span className="block text-xs text-gray-500 mt-0.5">
                  {option.description}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Advanced mode escape hatch */}
      <button
        onClick={handleSwitchToAdvanced}
        className="text-xs text-gray-600 hover:text-gray-400 transition-colors mt-6 self-center"
      >
        Switch to Advanced Mode
      </button>
    </div>
  )
}
