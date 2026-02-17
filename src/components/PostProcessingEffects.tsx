'use client';

import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';

export default function PostProcessingEffects() {
  return (
    <EffectComposer enableNormalPass={false} multisampling={0}>
      <Bloom luminanceThreshold={1.2} mipmapBlur intensity={0.25} />
      <Vignette eskil={false} offset={0.1} darkness={1.05} />
    </EffectComposer>
  );
}
