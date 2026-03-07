import { useState } from 'react'

interface PhaseForm {
  name: string
  display_name: string
  objective: string
  prompt_injection: string
  max_turns: number
  min_turns: number
  transition_hint: string
}

interface ScenarioForm {
  name: string
  type: string
  difficulty: string
  duration_minutes: number
  system_prompt: string
  focus_areas: string[]
  evaluation_criteria: string[]
  phases: PhaseForm[]
  whiteboard_enabled: boolean
}

const API_BASE = 'http://localhost:8000'

const emptyPhase: PhaseForm = {
  name: '',
  display_name: '',
  objective: '',
  prompt_injection: '',
  max_turns: 6,
  min_turns: 1,
  transition_hint: '',
}

const defaultForm: ScenarioForm = {
  name: '',
  type: 'technical',
  difficulty: 'medium',
  duration_minutes: 20,
  system_prompt: '',
  focus_areas: [],
  evaluation_criteria: [],
  phases: [],
  whiteboard_enabled: false,
}

export function ScenarioBuilder({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [mode, setMode] = useState<'generate' | 'edit'>('generate')
  const [description, setDescription] = useState('')
  const [genType, setGenType] = useState('technical')
  const [genDifficulty, setGenDifficulty] = useState('medium')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<ScenarioForm>(defaultForm)
  const [focusInput, setFocusInput] = useState('')
  const [criteriaInput, setCriteriaInput] = useState('')

  const handleGenerate = async () => {
    if (!description.trim()) return
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/scenarios/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          type: genType,
          difficulty: genDifficulty,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Generation failed' }))
        throw new Error(data.detail || 'Generation failed')
      }
      const data = await res.json()
      setForm({
        name: data.name || '',
        type: data.type || genType,
        difficulty: data.difficulty || genDifficulty,
        duration_minutes: data.duration_minutes || 20,
        system_prompt: data.system_prompt || '',
        focus_areas: data.focus_areas || [],
        evaluation_criteria: data.evaluation_criteria || [],
        phases: (data.phases || []).map((p: PhaseForm) => ({
          name: p.name || '',
          display_name: p.display_name || '',
          objective: p.objective || '',
          prompt_injection: p.prompt_injection || '',
          max_turns: p.max_turns || 6,
          min_turns: p.min_turns || 1,
          transition_hint: p.transition_hint || '',
        })),
        whiteboard_enabled: data.whiteboard_enabled || false,
      })
      setMode('edit')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.system_prompt.trim()) {
      setError('Name and system prompt are required')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const payload = {
        ...form,
        name: form.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
        phases: form.phases.map((p, i) => ({
          ...p,
          name: p.name || `phase_${i + 1}`,
          display_name: p.display_name || `Phase ${i + 1}`,
          next_phases: i < form.phases.length - 1 ? [form.phases[i + 1].name || `phase_${i + 2}`] : [],
        })),
        rubrics: {},
        phase_exemplars: {},
        knowledge_collections: [],
      }
      const res = await fetch(`${API_BASE}/api/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Save failed' }))
        throw new Error(data.detail || 'Save failed')
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  const addFocusArea = () => {
    if (focusInput.trim() && !form.focus_areas.includes(focusInput.trim())) {
      setForm({ ...form, focus_areas: [...form.focus_areas, focusInput.trim()] })
      setFocusInput('')
    }
  }

  const addCriteria = () => {
    if (criteriaInput.trim()) {
      setForm({ ...form, evaluation_criteria: [...form.evaluation_criteria, criteriaInput.trim()] })
      setCriteriaInput('')
    }
  }

  const updatePhase = (idx: number, field: keyof PhaseForm, value: string | number) => {
    const updated = [...form.phases]
    updated[idx] = { ...updated[idx], [field]: value }
    setForm({ ...form, phases: updated })
  }

  return (
    <div className="fixed inset-0 bg-gray-950/90 z-50 overflow-y-auto">
      <div className="max-w-3xl mx-auto py-8 px-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-100">Create Scenario</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg"
          >
            Close
          </button>
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-4 bg-red-400/10 px-4 py-2 rounded">{error}</p>
        )}

        {/* Tab switcher */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode('generate')}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              mode === 'generate'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            AI Generate
          </button>
          <button
            onClick={() => setMode('edit')}
            className={`px-4 py-2 text-sm rounded-lg transition-colors ${
              mode === 'edit'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            Manual Edit
          </button>
        </div>

        {mode === 'generate' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Describe the interview scenario
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full h-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm resize-none focus:outline-none focus:border-blue-500"
                placeholder="e.g., A system design interview about building a real-time chat application with presence indicators, message persistence, and group chats..."
              />
            </div>
            <div className="flex gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Type</label>
                <select
                  value={genType}
                  onChange={(e) => setGenType(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm"
                >
                  <option value="technical">Technical</option>
                  <option value="behavioral">Behavioral</option>
                  <option value="system_design">System Design</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Difficulty</label>
                <select
                  value={genDifficulty}
                  onChange={(e) => setGenDifficulty(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !description.trim()}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {isGenerating ? 'Generating...' : 'Generate Scenario'}
            </button>
          </div>
        )}

        {mode === 'edit' && (
          <div className="space-y-6">
            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="my_scenario"
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm"
                  >
                    <option value="technical">Technical</option>
                    <option value="behavioral">Behavioral</option>
                    <option value="system_design">System Design</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-gray-400 mb-1">Difficulty</label>
                  <select
                    value={form.difficulty}
                    onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="w-32">
                <label className="block text-sm text-gray-400 mb-1">Duration (min)</label>
                <input
                  type="number"
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: parseInt(e.target.value) || 20 })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                  min={5}
                  max={60}
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.whiteboard_enabled}
                    onChange={(e) => setForm({ ...form, whiteboard_enabled: e.target.checked })}
                    className="rounded"
                  />
                  Whiteboard enabled
                </label>
              </div>
            </div>

            {/* System prompt */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">System Prompt</label>
              <textarea
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                className="w-full h-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm resize-none focus:outline-none focus:border-blue-500"
                placeholder="You are a senior engineer conducting..."
              />
            </div>

            {/* Focus areas */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Focus Areas</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.focus_areas.map((area) => (
                  <span
                    key={area}
                    className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded flex items-center gap-1"
                  >
                    {area}
                    <button
                      onClick={() =>
                        setForm({ ...form, focus_areas: form.focus_areas.filter((a) => a !== area) })
                      }
                      className="text-gray-500 hover:text-gray-300"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={focusInput}
                  onChange={(e) => setFocusInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFocusArea())}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Add focus area..."
                />
                <button
                  onClick={addFocusArea}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Evaluation criteria */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Evaluation Criteria</label>
              <div className="space-y-1 mb-2">
                {form.evaluation_criteria.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-300">
                    <span className="flex-1">{c}</span>
                    <button
                      onClick={() =>
                        setForm({
                          ...form,
                          evaluation_criteria: form.evaluation_criteria.filter((_, j) => j !== i),
                        })
                      }
                      className="text-gray-600 hover:text-gray-400 text-xs"
                    >
                      remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={criteriaInput}
                  onChange={(e) => setCriteriaInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCriteria())}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                  placeholder="Add evaluation criteria..."
                />
                <button
                  onClick={addCriteria}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-sm"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Phases */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm text-gray-400">Phases</label>
                <button
                  onClick={() => setForm({ ...form, phases: [...form.phases, { ...emptyPhase }] })}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  + Add Phase
                </button>
              </div>
              <div className="space-y-3">
                {form.phases.map((phase, i) => (
                  <div key={i} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-300">Phase {i + 1}</span>
                      <button
                        onClick={() =>
                          setForm({ ...form, phases: form.phases.filter((_, j) => j !== i) })
                        }
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        value={phase.name}
                        onChange={(e) => updatePhase(i, 'name', e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                        placeholder="phase_name"
                      />
                      <input
                        value={phase.display_name}
                        onChange={(e) => updatePhase(i, 'display_name', e.target.value)}
                        className="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                        placeholder="Display Name"
                      />
                    </div>
                    <textarea
                      value={phase.objective}
                      onChange={(e) => updatePhase(i, 'objective', e.target.value)}
                      className="w-full h-16 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-gray-100 text-sm resize-none focus:outline-none focus:border-blue-500"
                      placeholder="Objective..."
                    />
                    <textarea
                      value={phase.prompt_injection}
                      onChange={(e) => updatePhase(i, 'prompt_injection', e.target.value)}
                      className="w-full h-16 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-gray-100 text-sm resize-none focus:outline-none focus:border-blue-500"
                      placeholder="Prompt injection for this phase..."
                    />
                    <div className="flex gap-4">
                      <div className="w-24">
                        <label className="block text-xs text-gray-500 mb-0.5">Max turns</label>
                        <input
                          type="number"
                          value={phase.max_turns}
                          onChange={(e) => updatePhase(i, 'max_turns', parseInt(e.target.value) || 6)}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-sm"
                          min={1}
                          max={20}
                        />
                      </div>
                      <div className="w-24">
                        <label className="block text-xs text-gray-500 mb-0.5">Min turns</label>
                        <input
                          type="number"
                          value={phase.min_turns}
                          onChange={(e) => updatePhase(i, 'min_turns', parseInt(e.target.value) || 1)}
                          className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-sm"
                          min={1}
                          max={10}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Save */}
            <div className="flex gap-3 pt-4 border-t border-gray-800">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Scenario'}
              </button>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
