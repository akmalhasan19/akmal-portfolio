'use client';

import dynamic from "next/dynamic";

const Hero = dynamic(() => import("@/components/Hero"), {
  ssr: false,
  loading: () => (
    <section className="relative min-h-screen w-full bg-black">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(20,20,20,0.7),rgba(5,5,5,1))]" />
    </section>
  ),
});

export default function HeroDynamic() {
  return <Hero />;
}
