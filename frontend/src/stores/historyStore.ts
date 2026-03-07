import { create } from 'zustand'

export interface PastSession {
  id: number
  scenario_name: string
  created_at: string
  duration_seconds: number | null
  overall_score: number | null
  transcript_count: number
}

export interface TrendPoint {
  session_id: number
  created_at: string
  score: number
}

interface HistoryState {
  pastSessions: PastSession[]
  total: number
  trends: Record<string, TrendPoint[]>
  isLoading: boolean
  trendsLoaded: boolean
  fetchPastSessions: (limit?: number, offset?: number) => Promise<void>
  fetchTrends: () => Promise<void>
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  pastSessions: [],
  total: 0,
  trends: {},
  isLoading: false,
  trendsLoaded: false,

  fetchPastSessions: async (limit = 50, offset = 0) => {
    set({ isLoading: true })
    try {
      const res = await fetch(
        `http://localhost:8000/api/sessions?limit=${limit}&offset=${offset}`,
      )
      if (!res.ok) return
      const data = await res.json()
      set({ pastSessions: data.sessions, total: data.total })
    } catch {
      // Silent failure
    } finally {
      set({ isLoading: false })
    }
  },

  fetchTrends: async () => {
    if (get().trendsLoaded) return
    try {
      const res = await fetch('http://localhost:8000/api/trends')
      if (!res.ok) return
      const data: { dimension_name: string; data_points: TrendPoint[] }[] =
        await res.json()
      const trends: Record<string, TrendPoint[]> = {}
      for (const t of data) {
        trends[t.dimension_name] = t.data_points
      }
      set({ trends, trendsLoaded: true })
    } catch {
      // Silent failure
    }
  },
}))
