export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="max-w-md text-center p-6 bg-zinc-900 border border-zinc-800 rounded-xl shadow-md">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl mb-4 bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
          Coding Arena Web
        </h1>
        <p className="text-zinc-400">
          This is the primary web portal for Coding Arena, successfully configured as part of a
          Turborepo monorepo.
        </p>
      </div>
    </main>
  );
}
