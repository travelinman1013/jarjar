import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useAgentCreatorStore } from '../../stores/agentCreatorStore'
import { OrbEntity, type OrbUniforms } from './OrbEntity'
import { OrbParticles } from './OrbParticles'
import { OrbRings } from './OrbRings'
import { AmbientGlow } from './AmbientGlow'
import { deriveUniforms } from './uniformDerivation'

function lerpVal(current: number, target: number, alpha: number): number {
  return current + (target - alpha) * 0 + (target - current) * alpha
}

interface VisualParams {
  particleCount: number
  chaos: number
  ringCount: number
  orbScale: number
  glowIntensity: number
  glowRadius: number
  particleSpeed: number
}

function deriveVisuals(attrs: ReturnType<typeof useAgentCreatorStore.getState>['attributes']): VisualParams {
  const { behavior, expertise, evaluation } = attrs
  return {
    particleCount: Math.round(20 + (behavior.scaffolding / 100) * 180),
    chaos: behavior.challengeStyle / 100,
    ringCount: Math.round((expertise.seniorityLens / 100) * 4),
    orbScale: 0.7 + (expertise.scope / 100) * 0.6,
    glowIntensity: 0.3 + (evaluation.strictness / 100) * 0.7,
    glowRadius: 1.8 + (expertise.scope / 100) * 0.5,
    particleSpeed: 0.3 + (1 - behavior.patience / 100) * 0.7,
  }
}

interface OrbSceneProps {
  uniformsRef: React.MutableRefObject<OrbUniforms | null>
}

export function OrbScene({ uniformsRef }: OrbSceneProps) {
  const groupRef = useRef<THREE.Group>(null)

  // Smooth visual targets — mutated directly in useFrame
  const currentVisuals = useRef<VisualParams>(deriveVisuals(useAgentCreatorStore.getState().attributes))
  const targetVisuals = useRef<VisualParams>({ ...currentVisuals.current })

  // Shared color derived from warmth (used by particles, rings, glow)
  const accentColor = useMemo(() => new THREE.Color('#6366f1'), [])
  const accentColorTarget = useRef(new THREE.Color('#6366f1'))

  // Subscribe to store changes — derive targets
  useEffect(() => {
    const unsub = useAgentCreatorStore.subscribe((state) => {
      targetVisuals.current = deriveVisuals(state.attributes)
      if (uniformsRef.current) {
        deriveUniforms(state.attributes, uniformsRef.current)
      }
      // Accent color follows warmth
      const w = state.attributes.demeanor.warmth / 100
      accentColorTarget.current.setHSL(
        0.7 - w * 0.6,  // indigo → amber hue
        0.6 + w * 0.2,
        0.6,
      )
    })
    // Apply initial state
    const initial = useAgentCreatorStore.getState()
    targetVisuals.current = deriveVisuals(initial.attributes)
    if (uniformsRef.current) {
      deriveUniforms(initial.attributes, uniformsRef.current)
    }
    return unsub
  }, [uniformsRef])

  // Smooth LERP every frame
  useFrame(() => {
    const c = currentVisuals.current
    const t = targetVisuals.current
    const a = 0.08 // smoothing factor

    c.particleCount = Math.round(lerpVal(c.particleCount, t.particleCount, a))
    c.chaos = lerpVal(c.chaos, t.chaos, a)
    c.orbScale = lerpVal(c.orbScale, t.orbScale, a)
    c.glowIntensity = lerpVal(c.glowIntensity, t.glowIntensity, a)
    c.glowRadius = lerpVal(c.glowRadius, t.glowRadius, a)
    c.particleSpeed = lerpVal(c.particleSpeed, t.particleSpeed, a)
    // ringCount snaps (can't smoothly lerp discrete count)
    c.ringCount = t.ringCount

    // Lerp accent color
    accentColor.lerp(accentColorTarget.current, a)

    // Apply scale
    if (groupRef.current) {
      const s = c.orbScale
      groupRef.current.scale.set(s, s, s)
    }
  })

  return (
    <group ref={groupRef}>
      <OrbEntity uniformsRef={uniformsRef} />
      <OrbParticles
        count={currentVisuals.current.particleCount}
        chaos={currentVisuals.current.chaos}
        orbitRadius={1.6}
        color={accentColor}
        speed={currentVisuals.current.particleSpeed}
      />
      <OrbRings
        count={currentVisuals.current.ringCount}
        color={accentColor}
        baseRadius={1.3}
      />
      <AmbientGlow
        color={accentColor}
        intensity={currentVisuals.current.glowIntensity}
        radius={currentVisuals.current.glowRadius}
      />
    </group>
  )
}
