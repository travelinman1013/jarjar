import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface OrbRingsProps {
  count: number   // 0-4: seniority lens
  color: THREE.Color
  baseRadius: number
}

const RING_OFFSETS = [
  { radius: 0, tilt: 0.3, speed: 0.4 },
  { radius: 0.25, tilt: -0.5, speed: -0.3 },
  { radius: 0.5, tilt: 0.7, speed: 0.25 },
  { radius: 0.75, tilt: -0.2, speed: -0.5 },
]

function Ring({ radius, tilt, speed, color }: {
  radius: number
  tilt: number
  speed: number
  color: THREE.Color
}) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    if (!meshRef.current) return
    meshRef.current.rotation.z = tilt + clock.elapsedTime * speed * 0.3
    meshRef.current.rotation.x = Math.PI / 2 + Math.sin(clock.elapsedTime * speed * 0.5) * 0.1
  })

  return (
    <mesh ref={meshRef}>
      <torusGeometry args={[radius, 0.008, 8, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.4} />
    </mesh>
  )
}

export function OrbRings({ count, color, baseRadius }: OrbRingsProps) {
  return (
    <group>
      {RING_OFFSETS.slice(0, count).map((ring, i) => (
        <Ring
          key={i}
          radius={baseRadius + ring.radius}
          tilt={ring.tilt}
          speed={ring.speed}
          color={color}
        />
      ))}
    </group>
  )
}
