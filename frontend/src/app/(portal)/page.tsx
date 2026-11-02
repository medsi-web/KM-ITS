import Features from "./_components/Features";
import Hero from "./_components/Hero";

export default function Home() {
  return (
    <main className="flex flex-col bg-white">
      <Hero />
      <Features />
    </main>
  );
}
