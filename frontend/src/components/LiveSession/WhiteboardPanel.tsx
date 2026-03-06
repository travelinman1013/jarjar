import { useCallback, useRef } from 'react'
import { Tldraw, Editor } from 'tldraw'
import 'tldraw/tldraw.css'

interface Props {
  onDiagramChange: (snapshot: object, shapeCount: number) => void
}

const DEBOUNCE_MS = 2000

export function WhiteboardPanel({ onDiagramChange }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editorRef = useRef<Editor | null>(null)

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor

      const sendSnapshot = () => {
        const snapshot = editor.getSnapshot()
        const shapes = editor.getCurrentPageShapes()
        onDiagramChange(snapshot, shapes.length)
      }

      editor.store.listen(
        () => {
          if (timerRef.current) clearTimeout(timerRef.current)
          timerRef.current = setTimeout(sendSnapshot, DEBOUNCE_MS)
        },
        { scope: 'document', source: 'user' },
      )
    },
    [onDiagramChange],
  )

  return (
    <div className="whiteboard-panel h-full">
      <style>{`
        .whiteboard-panel .tl-background { background: #030712 !important; }
      `}</style>
      <Tldraw onMount={handleMount} inferDarkMode />
    </div>
  )
}
