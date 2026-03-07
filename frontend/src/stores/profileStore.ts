import { create } from 'zustand'

const API_BASE = 'http://localhost:8000'

export interface SkillDimensionData {
  name: string
  current_score: number
  session_count: number
  last_practiced: string | null
  retrievability: number
}

export interface RecommendationData {
  scenario_name: string
  urgency: number
  weak_dimensions: string[]
  due_dimensions: string[]
}

interface ProfileState {
  dimensions: SkillDimensionData[]
  recommendations: RecommendationData[]
  isLoading: boolean
  fetchProfile: () => Promise<void>
  resetFullProfile: () => Promise<void>
  resetDimensions: (names: string[]) => Promise<void>
}

export const useProfileStore = create<ProfileState>()((set, get) => ({
  dimensions: [],
  recommendations: [],
  isLoading: false,

  fetchProfile: async () => {
    set({ isLoading: true })
    try {
      const res = await fetch(`${API_BASE}/api/profile`)
      if (!res.ok) return
      const data = await res.json()
      set({
        dimensions: data.dimensions ?? [],
        recommendations: data.recommendations ?? [],
      })
    } catch {
      // Profile is optional — silently fail
    } finally {
      set({ isLoading: false })
    }
  },

  resetFullProfile: async () => {
    await fetch(`${API_BASE}/api/profile`, { method: 'DELETE' })
    get().fetchProfile()
  },

  resetDimensions: async (names: string[]) => {
    await fetch(`${API_BASE}/api/profile/dimensions`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dimension_names: names }),
    })
    get().fetchProfile()
  },
}))
