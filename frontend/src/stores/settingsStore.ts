import { create } from 'zustand'

export interface MlxModelPreset {
  id: string
  label: string
  size: string
}

export interface LocalMlxModel {
  id: string
  label: string
  path: string
  source: 'local' | 'cache'
}

export interface Settings {
  vad_silence_ms: number
  llm_provider: string
  llm_model: string
  llm_base_url: string
  mlx_model: string
  kokoro_voice: string
  available_voices: string[]
  available_models: string[]
  available_mlx_models: MlxModelPreset[]
  local_mlx_models: LocalMlxModel[]
  mlx_model_dirs: string[]
}

interface SettingsState {
  settings: Settings | null
  isLoading: boolean
  fetchSettings: () => Promise<void>
  updateSettings: (patch: Partial<Pick<Settings, 'vad_silence_ms' | 'llm_model' | 'llm_provider' | 'mlx_model' | 'mlx_model_dirs' | 'kokoro_voice'>>) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  isLoading: false,

  fetchSettings: async () => {
    set({ isLoading: true })
    try {
      const res = await fetch('http://localhost:8000/api/settings')
      if (!res.ok) return
      const data = await res.json()
      set({ settings: data })
    } catch {
      // Silent failure
    } finally {
      set({ isLoading: false })
    }
  },

  updateSettings: async (patch) => {
    set({ isLoading: true })
    try {
      const res = await fetch('http://localhost:8000/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      if (!res.ok) return
      const data = await res.json()
      set({ settings: data })
    } catch {
      // Silent failure
    } finally {
      set({ isLoading: false })
    }
  },
}))
