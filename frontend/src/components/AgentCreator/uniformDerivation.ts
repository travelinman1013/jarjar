import * as THREE from 'three'
import type { AgentAttributes } from '../../stores/agentCreatorStore'
import type { OrbUniforms } from './OrbEntity'

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * (t / 100)
}

export function deriveUniforms(attrs: AgentAttributes, target: OrbUniforms) {
  const { demeanor, behavior, expertise, evaluation } = attrs

  // Demeanor → Color & Shape
  target.uWarmth.value = demeanor.warmth / 100
  target.uNoiseAmplitude.value = lerp(0.05, 0.35, demeanor.directness)
  target.uNoiseScale.value = lerp(0.8, 2.5, demeanor.formality)

  // Behavior → Kinetics
  target.uPulseAmplitude.value = lerp(0.02, 0.15, behavior.probeDepth)
  target.uPulseSpeed.value = lerp(2.0, 0.3, behavior.patience) // Inverted: high patience = slow

  // Expertise → Core complexity
  // Technical depth affects fresnel (inner glow complexity)
  target.uFresnelPower.value = lerp(5.0, 1.5, expertise.technicalDepth) // Inverted: high depth = strong fresnel

  // Evaluation → Brightness & Detail
  target.uEmissiveIntensity.value = lerp(0.4, 1.5, evaluation.strictness)
  target.uDetailNoise.value = lerp(0.0, 1.0, evaluation.feedbackDetail)

  // Color temperature: cool blue ↔ warm amber
  const coolHue = demeanor.warmth < 50 ? 0.58 : 0.55
  const warmHue = demeanor.warmth > 50 ? 0.08 : 0.12
  ;(target.uColorA.value as THREE.Color).setHSL(coolHue, 0.7, 0.5)
  ;(target.uColorB.value as THREE.Color).setHSL(warmHue, 0.8, 0.55)
}
