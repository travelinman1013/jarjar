import { useSessionStore } from './stores/sessionStore'
import { LiveSession } from './components/LiveSession'
import { SessionSetup } from './components/SessionSetup'
import { Review } from './components/Review'

function App() {
  const view = useSessionStore((s) => s.view)

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {view === 'setup' && <SessionSetup />}
      {view === 'session' && <LiveSession />}
      {view === 'review' && <Review />}
    </div>
  )
}

export default App
