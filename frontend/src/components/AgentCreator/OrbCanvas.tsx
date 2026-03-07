import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbUniforms } from './OrbEntity'
import { OrbScene } from './OrbScene'

interface OrbCanvasProps {
  uniformsRef: React.MutableRefObject<OrbUniforms | null>
}

export function OrbCanvas({ uniformsRef }: OrbCanvasProps) {
  return (
    <div className="w-full h-full min-h-[300px]">
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.2} />
          <pointLight position={[5, 5, 5]} intensity={0.5} />
          <OrbScene uniformsRef={uniformsRef} />
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate
            autoRotateSpeed={0.5}
            minPolarAngle={Math.PI / 3}
            maxPolarAngle={(2 * Math.PI) / 3}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
