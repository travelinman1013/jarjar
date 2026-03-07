import { lazy, Suspense, useRef, useState } from 'react'
import type { OrbUniforms } from './OrbEntity'
import { AttributePanel } from './AttributePanel'
import { SoulPreview } from './SoulPreview'
import { WizardPanel } from './WizardPanel'
import { useAgentCreatorStore } from '../../stores/agentCreatorStore'
import { useAgentLibraryStore } from '../../stores/agentLibraryStore'
import { compileConfig, deriveSilenceMs } from '../../lib/agentCompiler'
import { useSessionStore } from '../../stores/sessionStore'

const OrbCanvas = lazy(() =>
  import('./OrbCanvas').then((m) => ({ default: m.OrbCanvas }))
)

const API_BASE = 'http://localhost:8000'

interface AgentCreatorProps {
  onClose: () => void
  editingAgent?: string | null
}

type Tab = 'attributes' | 'preview'

function captureCanvasThumbnail(): string {
  try {
    const canvas = document.querySelector('canvas')
    if (canvas) return canvas.toDataURL('image/png')
  } catch {
    // CORS or security restrictions
  }
  return ''
}

export function AgentCreator({ onClose, editingAgent }: AgentCreatorProps) {
  const uniformsRef = useRef<OrbUniforms | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('attributes')
  const [isStarting, setIsStarting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setSession = useSessionStore((s) => s.setSession)
  const fetchAgents = useAgentLibraryStore((s) => s.fetchAgents)
  const wizardMode = useAgentCreatorStore((s) => s.wizardMode)

  const saveAgent = async () => {
    const state = useAgentCreatorStore.getState()

    if (!state.agentName.trim()) {
      setError('Give your agent a name first')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const config = compileConfig(state)
      const thumbnail = captureCanvasThumbnail()

      if (editingAgent) {
        // Update existing agent
        const res = await fetch(`${API_BASE}/api/agents/${editingAgent}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: state.agentName,
            attribute_values: state.attributes,
            scenario_type: state.scenarioType,
            scenario_config: config,
            visual_thumbnail: thumbnail,
          }),
        })
        if (!res.ok) throw new Error('Failed to update agent')
      } else {
        // Create new agent
        const res = await fetch(`${API_BASE}/api/agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: config.name,
            display_name: state.agentName,
            attribute_values: state.attributes,
            scenario_type: state.scenarioType,
            scenario_config: config,
            visual_thumbnail: thumbnail,
          }),
        })
        if (!res.ok) {
          const body = await res.text()
          throw new Error(`Failed to save agent: ${body}`)
        }
      }

      await fetchAgents()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleStartSession = async () => {
    const state = useAgentCreatorStore.getState()

    if (!state.agentName.trim()) {
      setError('Give your agent a name first')
      return
    }

    setIsStarting(true)
    setError(null)

    try {
      const config = compileConfig(state)
      const silenceMs = deriveSilenceMs(state.attributes.behavior.patience)
      const thumbnail = captureCanvasThumbnail()

      // Save agent + scenario together
      const agentRes = await fetch(`${API_BASE}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: config.name,
          display_name: state.agentName,
          attribute_values: state.attributes,
          scenario_type: state.scenarioType,
          scenario_config: config,
          visual_thumbnail: thumbnail,
        }),
      })
      // 409 is OK — agent already exists (re-use)
      if (!agentRes.ok && agentRes.status !== 409) {
        const body = await agentRes.text()
        throw new Error(`Failed to save agent: ${body}`)
      }

      // Create a session
      const sessionRes = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_name: config.name }),
      })
      if (!sessionRes.ok) throw new Error('Failed to create session')
      const sessionData = await sessionRes.json()

      // Store silence_ms in sessionStorage so useWebSocket can include it in session.start
      sessionStorage.setItem('agent_silence_ms', String(silenceMs))

      // Transition to session view
      await fetchAgents()
      setSession(sessionData.session_id, sessionData.scenario_name, config.whiteboard_enabled)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setIsStarting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">
            Agent Creation Studio
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {editingAgent ? 'Edit your interviewer' : 'Shape your interviewer'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={saveAgent}
            disabled={isSaving}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleStartSession}
            disabled={isStarting}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded transition-colors disabled:opacity-50 disabled:cursor-wait"
          >
            {isStarting ? 'Starting...' : 'Save & Start'}
          </button>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-2xl leading-none px-2"
          >
            &times;
          </button>
        </div>
      </header>

      {error && (
        <div className="px-6 py-2 bg-red-900/30 border-b border-red-800/50">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full h-full">
            <Suspense
              fallback={
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-gray-600 text-sm">Loading canvas...</div>
                </div>
              }
            >
              <OrbCanvas uniformsRef={uniformsRef} />
            </Suspense>
          </div>
        </div>

        <div className="w-96 border-l border-gray-800 flex flex-col">
          {wizardMode ? (
            <div className="flex-1 overflow-y-auto">
              <WizardPanel />
            </div>
          ) : (
            <>
              {/* Tab switcher */}
              <div className="flex border-b border-gray-800">
                <button
                  onClick={() => setActiveTab('attributes')}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    activeTab === 'attributes'
                      ? 'text-indigo-400 border-b-2 border-indigo-400'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Attributes
                </button>
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    activeTab === 'preview'
                      ? 'text-indigo-400 border-b-2 border-indigo-400'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  Soul Preview
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'attributes' ? <AttributePanel /> : <SoulPreview />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
