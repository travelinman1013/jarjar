import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { vertexShader, fragmentShader } from './shaders/orbShaders'

export interface OrbUniforms {
  [key: string]: { value: number | THREE.Color }
  uTime: { value: number }
  uNoiseScale: { value: number }
  uNoiseAmplitude: { value: number }
  uPulseSpeed: { value: number }
  uPulseAmplitude: { value: number }
  uColorA: { value: THREE.Color }
  uColorB: { value: THREE.Color }
  uWarmth: { value: number }
  uEmissiveIntensity: { value: number }
  uFresnelPower: { value: number }
  uDetailNoise: { value: number }
}

function createUniforms(): OrbUniforms {
  return {
    uTime: { value: 0 },
    uNoiseScale: { value: 1.5 },
    uNoiseAmplitude: { value: 0.15 },
    uPulseSpeed: { value: 0.8 },
    uPulseAmplitude: { value: 0.05 },
    uColorA: { value: new THREE.Color('#3b82f6') },
    uColorB: { value: new THREE.Color('#f59e0b') },
    uWarmth: { value: 0.5 },
    uEmissiveIntensity: { value: 0.8 },
    uFresnelPower: { value: 3.0 },
    uDetailNoise: { value: 0.3 },
  }
}

interface OrbEntityProps {
  uniformsRef: React.MutableRefObject<OrbUniforms | null>
}

export function OrbEntity({ uniformsRef }: OrbEntityProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const uniforms = useMemo(() => createUniforms(), [])

  useEffect(() => {
    uniformsRef.current = uniforms
  }, [uniformsRef, uniforms])

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value += delta
    }
  })

  return (
    <mesh>
      <icosahedronGeometry args={[1, 4]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}
