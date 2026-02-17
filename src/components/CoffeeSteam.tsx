import { ThreeElements, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

// Billboard Vertex Shader
// Transforms local corner vertices (of a quad) into View Space first,
// effectively making the quad always face the camera.
const vertexShader = `
uniform float uTime;
attribute float aOffset;
attribute float aScale;
attribute float aRotation;
attribute vec3 aVelocity;
attribute float aLife;

varying vec2 vUv;
varying float vAlpha;
varying float vOffset;

void main() {
  vUv = uv;
  vOffset = aOffset;

  // Calculate life progress (0.0 to 1.0) based on time and offset
  // We use uTime and aOffset to create a continuous loop
  float lifeDuration = 8.0; // Faster (but still slow) to correct "static" look
  float time = uTime + aOffset;
  float progress = mod(time, lifeDuration) / lifeDuration;
  
  // Fade in faster, fade out smoother
  vAlpha = smoothstep(0.0, 0.2, progress) * (1.0 - smoothstep(0.6, 1.0, progress));
  
  // Calculate position
  // Move up (y) and slightly outward (x, z)
  vec3 pos = vec3(0.0);
  
  // Initial random spread at base
  // We use aVelocity as a random seed for initial position too
  float randomAngle = aRotation * 6.28;
  float randomRadius = length(aVelocity.xz) * 0.05; // Starting point is tight (cup center)
  pos.x += cos(randomAngle) * randomRadius;
  pos.z += sin(randomAngle) * randomRadius;
  
  // Upward movement
  pos.y += progress * 1.8; // Rise height
  
  // S-Curve distortion for "swirl"
  float sway = sin(progress * 10.0 + aOffset) * 0.1 * progress;
  pos.x += sway;
  
  // Outward expansion (diffusion)
  float expansion = progress * 0.5; // How wide it gets
  pos.x += (aVelocity.x * expansion);
  pos.z += (aVelocity.z * expansion);
  
  // Scale increases with age
  // Elongate vertically for "streak" look
  float currentScaleX = aScale * (0.5 + progress * 1.0); 
  float currentScaleY = currentScaleX * 2.0; // Taller than wide
  
  // Billboard Logic
  // 1. Get model view position of the center
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  
  // 2. Add vertex offset scaled by size (camera facing)
  // Since we are in View Space, the camera is at (0,0,0) looking down -Z.
  // The plane's local x/y are aligned with view x/y.
  mvPosition.x += position.x * currentScaleX;
  mvPosition.y += position.y * currentScaleY;
  
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
varying vec2 vUv;
varying float vAlpha;
varying float vOffset;
uniform vec3 uColor;
uniform float uTime;

// Simplex 2D noise
// From: https://github.com/patriciogonzalezvivo/thebookofshaders/blob/master/glsl/noise/snoise.glsl
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod((i), 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

// FBM (Fractal Brownian Motion)
float fbm(vec2 x) {
	float v = 0.0;
	float a = 0.5;
	vec2 shift = vec2(100.0);
	// Basic rotation matrix
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
	for (int i = 0; i < 3; ++i) { // 3 Octaves
		v += a * snoise(x);
		x = rot * x * 2.0 + shift;
		a *= 0.5;
	}
	return v;
}

void main() {
  // Center coordinates
  vec2 uv = vUv;
  
  // Time offset from particle distinct offset
  float time = uTime * 0.5 + vOffset;
  
  // Rising coordinates
  vec2 noiseUV = uv * vec2(1.0, 2.0) - vec2(0.0, time);
  
  // FBM Noise pattern
  // Multiply by high frequency to get "wispy strands"
  float noise = fbm(noiseUV * 3.0);
  
  // Remap noise
  noise = noise * 0.5 + 0.5;
  
  // Shape masking:
  // Instead of a circle, use a vertical "snake" or "column"
  // Horizontal fade (sides)
  float distX = abs(uv.x - 0.5);
  float maskX = 1.0 - smoothstep(0.0, 0.4, distX);
  
  // Vertical fade (top/bottom softness within the quad itself)
  // Fade in quickly at bottom (0.0 to 0.15)
  // Constant fade out all the way to top (0.15 to 1.0) to make it disappear as it rises
  float maskY = smoothstep(0.0, 0.15, uv.y) * (1.0 - smoothstep(0.15, 1.0, uv.y));
  
  // Combine all
  // High contrast on noise to make "strands" pop out from transparent background
  // Increase threshold to thin out the smoke (only hottest parts visible)
  float smokeShape = smoothstep(0.45, 1.0, noise * maskX); // Removed maskY here to apply it linearly
  
  // modulate alpha
  // Apply fading maskY here
  // Ultra subtle opacity
  float finalAlpha = smokeShape * vAlpha * maskY * 0.08; 
  
  if (finalAlpha < 0.001) discard;
  
  gl_FragColor = vec4(uColor, finalAlpha);
}
`;

const PARTICLE_COUNT = 25; // Fewer particles, but more detailed individually
const pseudoRandom01 = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return x - Math.floor(x);
};

export const CoffeeSteam = (props: ThreeElements["group"]) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Memoize uniforms to prevent recreation on re-render
  // This ensures uTime persists across component re-renders
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor: { value: new THREE.Color("#eeeeee") },
  }), []);

  // Initialize attributes
  const { offsets, scales, rotations, velocities } = useMemo(() => {
    const offsets = new Float32Array(PARTICLE_COUNT);
    const scales = new Float32Array(PARTICLE_COUNT);
    const rotations = new Float32Array(PARTICLE_COUNT);
    const velocities = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const r1 = pseudoRandom01(i * 4 + 1);
      const r2 = pseudoRandom01(i * 4 + 2);
      const r3 = pseudoRandom01(i * 4 + 3);
      const r4 = pseudoRandom01(i * 4 + 4);
      const r5 = pseudoRandom01(i * 4 + 5);

      offsets[i] = r1 * 4.0;
      scales[i] = 0.6 + r2 * 0.4; // Smaller base scale
      rotations[i] = r3;

      const angle = r4 * Math.PI * 2;
      const speed = 0.1 + r5 * 0.2;
      velocities[i * 3] = Math.cos(angle) * speed;
      velocities[i * 3 + 1] = 0.0;
      velocities[i * 3 + 2] = Math.sin(angle) * speed;
    }

    return { offsets, scales, rotations, velocities };
  }, []);

  const timeRef = useRef(0);

  useFrame((state, delta) => {
    if (materialRef.current) {
      // Use delta to ensure continuous movement regardless of clock resets
      timeRef.current += delta;
      materialRef.current.uniforms.uTime.value = timeRef.current;
    }
  });

  return (
    <group {...props} position={[0.05, 0.38, 0.07]}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]}>
        <planeGeometry args={[1, 1]}>
          <instancedBufferAttribute attach="attributes-aOffset" args={[offsets, 1]} />
          <instancedBufferAttribute attach="attributes-aScale" args={[scales, 1]} />
          <instancedBufferAttribute attach="attributes-aRotation" args={[rotations, 1]} />
          <instancedBufferAttribute attach="attributes-aVelocity" args={[velocities, 3]} />
        </planeGeometry>
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </instancedMesh>
    </group>
  );
};
