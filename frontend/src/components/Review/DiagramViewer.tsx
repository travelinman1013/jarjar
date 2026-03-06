import { useCallback } from 'react'
import { Tldraw, Editor } from 'tldraw'
import type { TLEditorSnapshot } from '@tldraw/editor'
import 'tldraw/tldraw.css'

interface Props {
  snapshotJson: string
}

export function DiagramViewer({ snapshotJson }: Props) {
  const snapshot = JSON.parse(snapshotJson) as TLEditorSnapshot

  const handleMount = useCallback((editor: Editor) => {
    editor.updateInstanceState({ isReadonly: true })
    editor.setCurrentTool('hand')
    // Zoom to fit content
    requestAnimationFrame(() => {
      editor.zoomToFit({ animation: { duration: 0 } })
    })
  }, [])

  return (
    <div className="h-64 border border-gray-700 rounded-lg overflow-hidden mt-4 diagram-viewer">
      <style>{`
        .diagram-viewer .tl-background { background: #030712 !important; }
      `}</style>
      <Tldraw
        snapshot={snapshot}
        onMount={handleMount}
        components={{
          Toolbar: null,
          PageMenu: null,
          NavigationPanel: null,
          HelpMenu: null,
          MainMenu: null,
          StylePanel: null,
          DebugPanel: null,
          ActionsMenu: null,
        }}
      />
    </div>
  )
}
