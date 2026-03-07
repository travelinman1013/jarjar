import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const MAX_PARTICLES = 200

// Pre-computed at module load — stable across renders
const PARTICLE_POSITIONS = new Float32Array(MAX_PARTICLES * 3)
const PARTICLE_SEEDS = new Float32Array(MAX_PARTICLES * 3)
for (let i = 0; i < MAX_PARTICLES; i++) {
  const theta = Math.random() * Math.PI * 2
  const phi = Math.acos(2 * Math.random() - 1)
  const r = 1.6 + (Math.random() - 0.5) * 0.5
  PARTICLE_POSITIONS[i * 3] = r * Math.sin(phi) * Math.cos(theta)
  PARTICLE_POSITIONS[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
  PARTICLE_POSITIONS[i * 3 + 2] = r * Math.cos(phi)
  PARTICLE_SEEDS[i * 3] = Math.random() * Math.PI * 2
  PARTICLE_SEEDS[i * 3 + 1] = (Math.random() - 0.5) * 2
  PARTICLE_SEEDS[i * 3 + 2] = 0.5 + Math.random() * 1.5
}

interface OrbParticlesProps {
  count: number
  chaos: number
  orbitRadius: number
  color: THREE.Color
  speed: number
}

export function OrbParticles({ count, chaos, orbitRadius, color, speed }: OrbParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null)

  useFrame(({ clock }) => {
    if (!pointsRef.current) return
    const geo = pointsRef.current.geometry
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
    const t = clock.elapsedTime * speed

    for (let i = 0; i < count; i++) {
      const seedPhase = PARTICLE_SEEDS[i * 3]
      const seedY = PARTICLE_SEEDS[i * 3 + 1]
      const seedSpeed = PARTICLE_SEEDS[i * 3 + 2]

      const angle = seedPhase + t * seedSpeed
      const chaosOffset = chaos * Math.sin(t * 3 * seedSpeed + seedPhase) * 0.4
      const r = orbitRadius + chaosOffset
      const y = seedY * 0.8 + Math.sin(t * 0.5 + seedPhase) * 0.3

      posAttr.setXYZ(i, r * Math.cos(angle), y, r * Math.sin(angle))
    }
    for (let i = count; i < MAX_PARTICLES; i++) {
      posAttr.setXYZ(i, 0, 100, 0)
    }
    posAttr.needsUpdate = true
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[PARTICLE_POSITIONS, 3]}
          count={MAX_PARTICLES}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.03}
        color={color}
        transparent
        opacity={0.7}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}
