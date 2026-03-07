import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface AmbientGlowProps {
  color: THREE.Color
  intensity: number  // 0.3-1.0: maps to emissive
  radius: number
}

export function AmbientGlow({ color, intensity, radius }: AmbientGlowProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    const mat = meshRef.current.material as THREE.MeshBasicMaterial
    const pulse = 0.9 + Math.sin(clock.elapsedTime * 0.8) * 0.1
    mat.opacity = intensity * 0.15 * pulse
  })

  return (
    <mesh ref={meshRef} scale={radius}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.15}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  )
}
