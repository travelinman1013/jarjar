import { simplexNoise3D } from './noise'

export const vertexShader = /* glsl */ `
${simplexNoise3D}

uniform float uTime;
uniform float uNoiseScale;      // 0.8-2.5: noise frequency (formality: organic→geometric)
uniform float uNoiseAmplitude;  // 0.05-0.35: displacement strength (directness: soft→sharp)
uniform float uPulseSpeed;      // 0.3-2.0: breathing rate (patience: slow→fast)
uniform float uPulseAmplitude;  // 0.02-0.15: breathing depth (probe depth)

varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplacement;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;

  // Base noise displacement along normal
  float noise = snoise(position * uNoiseScale + uTime * 0.15);

  // Layered noise for more organic feel
  float detail = snoise(position * uNoiseScale * 2.5 + uTime * 0.25) * 0.3;

  float displacement = (noise + detail) * uNoiseAmplitude;

  // Breathing pulse
  float pulse = sin(uTime * uPulseSpeed) * uPulseAmplitude;

  vDisplacement = displacement;

  vec3 newPosition = position + normal * (displacement + pulse);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`

export const fragmentShader = /* glsl */ `
uniform float uTime;
uniform vec3 uColorA;           // Cool end (low warmth)
uniform vec3 uColorB;           // Warm end (high warmth)
uniform float uWarmth;          // 0.0-1.0: color temperature blend
uniform float uEmissiveIntensity; // 0.3-1.5: overall glow (strictness/brightness)
uniform float uFresnelPower;    // 1.5-5.0: edge glow falloff
uniform float uDetailNoise;     // 0.0-1.0: surface texture detail (feedback detail)

varying vec3 vNormal;
varying vec3 vPosition;
varying float vDisplacement;

void main() {
  // View direction for fresnel
  vec3 viewDir = normalize(cameraPosition - vPosition);
  float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), uFresnelPower);

  // Base color from warmth blend
  vec3 baseColor = mix(uColorA, uColorB, uWarmth);

  // Displacement-based color variation (inner complexity → technical depth)
  vec3 displacementColor = mix(baseColor, baseColor * 1.4, vDisplacement * 2.0 + 0.5);

  // Surface detail noise tint
  float detailTint = sin(vPosition.x * 10.0 + vPosition.y * 10.0 + uTime * 0.5) * 0.5 + 0.5;
  displacementColor = mix(displacementColor, displacementColor * (0.8 + detailTint * 0.4), uDetailNoise);

  // Fresnel rim glow
  vec3 rimColor = baseColor * 2.0;
  vec3 finalColor = mix(displacementColor, rimColor, fresnel * 0.6);

  // Emissive glow
  finalColor *= uEmissiveIntensity;

  // Subtle alpha for semi-translucency
  float alpha = 0.85 + fresnel * 0.15;

  gl_FragColor = vec4(finalColor, alpha);
}
`
