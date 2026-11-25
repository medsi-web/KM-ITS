import Canvas from "./_components/Canvas";
import Features from "./_components/Features";
import Hero from "./_components/Hero";

export default function Home() {
  return (
    <main className="flex flex-col bg-white">
      <Canvas>
        <Hero />
        <Features />
      </Canvas>
    </main>
  );
}
