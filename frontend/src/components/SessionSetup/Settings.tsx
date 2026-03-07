import { useEffect, useRef, useState } from 'react'
import { useProfileStore } from '../../stores/profileStore'
import { useSettingsStore } from '../../stores/settingsStore'

const CUSTOM_MODEL_VALUE = '__custom__'

interface MlxStatus {
  running: boolean
  model: string | null
  port: number
  pid: number | null
  uptime_seconds: number | null
}

function MlxStatusPanel() {
  const [status, setStatus] = useState<MlxStatus | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let active = true
    const poll = async () => {
      try {
        const [sRes, lRes] = await Promise.all([
          fetch('http://localhost:8000/api/mlx/status'),
          fetch('http://localhost:8000/api/mlx/logs'),
        ])
        if (!active) return
        if (sRes.ok) setStatus(await sRes.json())
        if (lRes.ok) {
          const d = await lRes.json()
          setLogs(d.lines)
        }
      } catch {
        // Server unreachable
      }
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => { active = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo(0, logRef.current.scrollHeight)
  }, [logs])

  const formatUptime = (s: number) => {
    const min = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return min > 0 ? `${min}m ${sec}s` : `${sec}s`
  }

  return (
    <div className="rounded border border-gray-700 bg-gray-900/50 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div
          className={`w-2.5 h-2.5 rounded-full ${
            status === null
              ? 'bg-yellow-500 animate-pulse'
              : status.running
                ? 'bg-green-500'
                : 'bg-red-500'
          }`}
        />
        <span className="text-sm text-gray-300">
          {status === null
            ? 'Checking...'
            : status.running
              ? 'MLX Server Running'
              : 'MLX Server Stopped'}
        </span>
      </div>

      {status?.running && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          {status.model && <span title="Model">{status.model}</span>}
          {status.pid && <span>PID {status.pid}</span>}
          {status.uptime_seconds != null && (
            <span>Up {formatUptime(status.uptime_seconds)}</span>
          )}
        </div>
      )}

      {logs.length > 0 && (
        <pre
          ref={logRef}
          className="max-h-32 overflow-y-auto text-xs text-gray-500 font-mono bg-gray-950 rounded p-2 whitespace-pre-wrap"
        >
          {logs.join('\n')}
        </pre>
      )}
    </div>
  )
}

export function Settings({ onClose }: { onClose: () => void }) {
  const { settings, isLoading, fetchSettings, updateSettings } = useSettingsStore()
  const { dimensions, resetFullProfile, resetDimensions } = useProfileStore()
  const [localVad, setLocalVad] = useState(800)
  const [localVoice, setLocalVoice] = useState('')
  const [localModel, setLocalModel] = useState('')
  const [localProvider, setLocalProvider] = useState('lmstudio')
  const [localMlxModel, setLocalMlxModel] = useState('')
  const [customMlxModel, setCustomMlxModel] = useState('')
  const [localModelDirs, setLocalModelDirs] = useState<string[]>([])
  const [newDirPath, setNewDirPath] = useState('')
  const [showDirs, setShowDirs] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [confirmFullReset, setConfirmFullReset] = useState(false)
  const [selectedDims, setSelectedDims] = useState<Set<string>>(new Set())
  const [confirmSelectiveReset, setConfirmSelectiveReset] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    if (settings) {
      setLocalVad(settings.vad_silence_ms)
      setLocalVoice(settings.kokoro_voice)
      setLocalModel(settings.llm_model)
      setLocalProvider(settings.llm_provider)
      setLocalModelDirs(settings.mlx_model_dirs)
      // Check if current mlx_model matches a local or preset model
      const isLocal = settings.local_mlx_models.some(m => m.id === settings.mlx_model)
      const isPreset = settings.available_mlx_models.some(p => p.id === settings.mlx_model)
      if (isLocal || isPreset) {
        setLocalMlxModel(settings.mlx_model)
        setCustomMlxModel('')
      } else {
        setLocalMlxModel(CUSTOM_MODEL_VALUE)
        setCustomMlxModel(settings.mlx_model)
      }
    }
  }, [settings])

  const handleSave = async () => {
    const mlxModel = localMlxModel === CUSTOM_MODEL_VALUE ? customMlxModel : localMlxModel
    await updateSettings({
      vad_silence_ms: localVad,
      kokoro_voice: localVoice,
      llm_model: localModel,
      llm_provider: localProvider,
      mlx_model: mlxModel,
      mlx_model_dirs: localModelDirs,
    })
    setDirty(false)
  }

  if (!settings) {
    return (
      <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 mb-6">
        <p className="text-sm text-gray-500">
          {isLoading ? 'Loading settings...' : 'Settings unavailable'}
        </p>
      </div>
    )
  }

  const isCustomMlx = localMlxModel === CUSTOM_MODEL_VALUE
  const hasLocalModels = settings.local_mlx_models.length > 0
  const hasPresets = settings.available_mlx_models.length > 0

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-300 uppercase tracking-wide">
          Settings
        </h2>
        <button
          onClick={onClose}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          Hide
        </button>
      </div>

      <div className="space-y-5">
        {/* Voice selection */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">TTS Voice</label>
          <select
            value={localVoice}
            onChange={(e) => {
              setLocalVoice(e.target.value)
              setDirty(true)
            }}
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm"
          >
            {settings.available_voices.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {/* VAD sensitivity */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Response Delay
            <span className="text-gray-600 ml-2">{localVad}ms</span>
          </label>
          <input
            type="range"
            min={300}
            max={2000}
            step={50}
            value={localVad}
            onChange={(e) => {
              setLocalVad(parseInt(e.target.value))
              setDirty(true)
            }}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-1">
            <span>Responsive</span>
            <span>Patient</span>
          </div>
        </div>

        {/* LLM Provider */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">LLM Provider</label>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setLocalProvider('lmstudio')
                setDirty(true)
              }}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                localProvider === 'lmstudio'
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
              }`}
            >
              LM Studio
            </button>
            <button
              onClick={() => {
                setLocalProvider('mlx')
                setDirty(true)
              }}
              className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                localProvider === 'mlx'
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600'
              }`}
            >
              MLX (Local)
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {localProvider === 'mlx'
              ? 'Runs models locally — no external server needed'
              : 'Requires LM Studio running on port 1234'}
          </p>
        </div>

        {/* LLM Model (LM Studio) */}
        {localProvider === 'lmstudio' && (
          <div>
            <label className="block text-sm text-gray-400 mb-1">LLM Model</label>
            <select
              value={localModel}
              onChange={(e) => {
                setLocalModel(e.target.value)
                setDirty(true)
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm"
            >
              {settings.available_models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* MLX Model */}
        {localProvider === 'mlx' && (
          <div>
            <label className="block text-sm text-gray-400 mb-1">MLX Model</label>
            <select
              value={localMlxModel}
              onChange={(e) => {
                setLocalMlxModel(e.target.value)
                setDirty(true)
              }}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm"
            >
              {hasLocalModels && (
                <optgroup label="Local Models">
                  {settings.local_mlx_models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </optgroup>
              )}
              {hasPresets && (
                <optgroup label="Download from HuggingFace">
                  {settings.available_mlx_models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.size})
                    </option>
                  ))}
                </optgroup>
              )}
              <option value={CUSTOM_MODEL_VALUE}>Custom...</option>
            </select>
            {isCustomMlx && (
              <input
                type="text"
                value={customMlxModel}
                onChange={(e) => {
                  setCustomMlxModel(e.target.value)
                  setDirty(true)
                }}
                placeholder="mlx-community/Model-Name-4bit or /path/to/model"
                className="w-full mt-2 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-gray-100 text-sm placeholder-gray-600"
              />
            )}
          </div>
        )}

        {/* MLX Server Status */}
        {localProvider === 'mlx' && <MlxStatusPanel />}

        {/* Model Directories (MLX only) */}
        {localProvider === 'mlx' && (
          <div>
            <button
              onClick={() => setShowDirs(!showDirs)}
              className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
            >
              <span className={`transition-transform ${showDirs ? 'rotate-90' : ''}`}>
                &#9654;
              </span>
              Model Directories
            </button>
            {showDirs && (
              <div className="mt-2 space-y-2">
                {localModelDirs.map((dir, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex-1 text-xs text-gray-400 font-mono truncate" title={dir}>
                      {dir}
                    </span>
                    <button
                      onClick={() => {
                        setLocalModelDirs(localModelDirs.filter((_, j) => j !== i))
                        setDirty(true)
                      }}
                      className="text-gray-600 hover:text-red-400 text-xs px-1"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newDirPath}
                    onChange={(e) => setNewDirPath(e.target.value)}
                    placeholder="/path/to/models"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-gray-100 text-xs font-mono placeholder-gray-600"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newDirPath.trim()) {
                        setLocalModelDirs([...localModelDirs, newDirPath.trim()])
                        setNewDirPath('')
                        setDirty(true)
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      if (newDirPath.trim()) {
                        setLocalModelDirs([...localModelDirs, newDirPath.trim()])
                        setNewDirPath('')
                        setDirty(true)
                      }
                    }}
                    className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded"
                  >
                    Add
                  </button>
                </div>
                <p className="text-xs text-gray-600">
                  Directories are scanned for MLX models (config.json + safetensors)
                </p>
              </div>
            )}
          </div>
        )}

        {/* Save */}
        {dirty && (
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Save Settings'}
          </button>
        )}

        {/* Skill Profile Reset */}
        <div className="border-t border-gray-700 pt-5">
          <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wide mb-3">
            Skill Profile
          </h3>

          {dimensions.length > 0 ? (
            <>
              {/* Selective reset */}
              <div className="space-y-2 mb-4">
                <label className="block text-sm text-gray-400 mb-1">
                  Select dimensions to reset
                </label>
                {dimensions.map((d) => (
                  <label
                    key={d.name}
                    className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDims.has(d.name)}
                      onChange={(e) => {
                        const next = new Set(selectedDims)
                        if (e.target.checked) next.add(d.name)
                        else next.delete(d.name)
                        setSelectedDims(next)
                        setConfirmSelectiveReset(false)
                      }}
                      className="accent-blue-500"
                    />
                    <span>{d.name}</span>
                    <span className="text-gray-500 ml-auto">
                      {d.current_score.toFixed(1)}
                    </span>
                  </label>
                ))}
                {selectedDims.size > 0 && (
                  !confirmSelectiveReset ? (
                    <button
                      onClick={() => setConfirmSelectiveReset(true)}
                      disabled={isResetting}
                      className="mt-2 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                    >
                      Reset Selected ({selectedDims.size})
                    </button>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={async () => {
                          setIsResetting(true)
                          await resetDimensions([...selectedDims])
                          setSelectedDims(new Set())
                          setConfirmSelectiveReset(false)
                          setIsResetting(false)
                        }}
                        disabled={isResetting}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isResetting ? 'Resetting...' : 'Confirm Reset'}
                      </button>
                      <button
                        onClick={() => setConfirmSelectiveReset(false)}
                        className="px-3 py-1.5 text-gray-400 hover:text-gray-200 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )
                )}
              </div>

              {/* Full reset */}
              <div className="border-t border-gray-700/50 pt-3">
                {!confirmFullReset ? (
                  <button
                    onClick={() => setConfirmFullReset(true)}
                    disabled={isResetting}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors disabled:opacity-50"
                  >
                    Reset All Skill Data
                  </button>
                ) : (
                  <div>
                    <p className="text-sm text-red-400 mb-2">
                      This clears all skill tracking data. Past sessions are not affected.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          setIsResetting(true)
                          await resetFullProfile()
                          setConfirmFullReset(false)
                          setSelectedDims(new Set())
                          setIsResetting(false)
                        }}
                        disabled={isResetting}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isResetting ? 'Resetting...' : 'Confirm Full Reset'}
                      </button>
                      <button
                        onClick={() => setConfirmFullReset(false)}
                        className="px-3 py-1.5 text-gray-400 hover:text-gray-200 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">No skill data to reset.</p>
          )}
        </div>
      </div>
    </div>
  )
}
