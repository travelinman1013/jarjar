import { useEffect, useState } from 'react'
import { useProfileStore } from '../../stores/profileStore'
import { useSettingsStore } from '../../stores/settingsStore'

export function Settings({ onClose }: { onClose: () => void }) {
  const { settings, isLoading, fetchSettings, updateSettings } = useSettingsStore()
  const { dimensions, resetFullProfile, resetDimensions } = useProfileStore()
  const [localVad, setLocalVad] = useState(800)
  const [localVoice, setLocalVoice] = useState('')
  const [localModel, setLocalModel] = useState('')
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
