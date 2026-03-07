import { useEffect, useState } from 'react'
import { useSettingsStore } from '../../stores/settingsStore'

export function Settings({ onClose }: { onClose: () => void }) {
  const { settings, isLoading, fetchSettings, updateSettings } = useSettingsStore()
  const [localVad, setLocalVad] = useState(800)
  const [localVoice, setLocalVoice] = useState('')
  const [localModel, setLocalModel] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    if (settings) {
      setLocalVad(settings.vad_silence_ms)
      setLocalVoice(settings.kokoro_voice)
      setLocalModel(settings.llm_model)
    }
  }, [settings])

  const handleSave = async () => {
    await updateSettings({
      vad_silence_ms: localVad,
      kokoro_voice: localVoice,
      llm_model: localModel,
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

        {/* LLM Model */}
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
      </div>
    </div>
  )
}
