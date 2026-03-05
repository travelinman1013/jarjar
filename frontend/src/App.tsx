import { useSessionStore } from './stores/sessionStore'
import { LiveSession } from './components/LiveSession'
import { SessionSetup } from './components/SessionSetup'

function App() {
  const sessionId = useSessionStore((s) => s.sessionId)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {sessionId ? <LiveSession /> : <SessionSetup />}
    </div>
  )
}

export default App
