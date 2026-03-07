import { create } from 'zustand'

const API_BASE = 'http://localhost:8000'

export interface AgentData {
  name: string
  display_name: string
  attribute_values: Record<string, Record<string, number>>
  scenario_type: string
  visual_thumbnail: string
  created_at: string
  last_used: string | null
  forked_from: string | null
}

interface AgentLibraryState {
  agents: AgentData[]
  isLoading: boolean
  fetchAgents: () => Promise<void>
  deleteAgent: (name: string) => Promise<void>
}

export const useAgentLibraryStore = create<AgentLibraryState>()((set) => ({
  agents: [],
  isLoading: false,

  fetchAgents: async () => {
    set({ isLoading: true })
    try {
      const res = await fetch(`${API_BASE}/api/agents`)
      if (res.ok) {
        const agents = await res.json()
        set({ agents })
      }
    } catch {
      // silent
    } finally {
      set({ isLoading: false })
    }
  },

  deleteAgent: async (name: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/agents/${name}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        set((state) => ({
          agents: state.agents.filter((a) => a.name !== name),
        }))
      }
    } catch {
      // silent
    }
  },
}))
