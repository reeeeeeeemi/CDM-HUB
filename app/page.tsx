const features = [
  {
    title: "Unified operations",
    description:
      "Keep strategy, teams, and delivery aligned from one shared command center.",
  },
  {
    title: "Faster decisions",
    description:
      "Move from stalled meetings to clear next actions with live insights and context.",
  },
  {
    title: "Built for scale",
    description:
      "Whether you are a growing startup or a multi-team enterprise, the system expands with you.",
  },
];

const metrics = [
  { value: "3x", label: "faster alignment" },
  { value: "92%", label: "adoption across teams" },
  { value: "24/7", label: "visibility and momentum" },
];

const steps = [
  "Map priorities and dependencies",
  "Track progress with live dashboards",
  "Turn insights into confident action",
];

export default function Home() {
  return (
    <div className="min-h-screen text-slate-100">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/30">
            CD
          </div>
          <div>
            <p className="text-lg font-semibold tracking-tight">CDM Hub</p>
          </div>
        </div>

        <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
          <a href="#platform" className="transition hover:text-white">Platform</a>
          <a href="#solutions" className="transition hover:text-white">Solutions</a>
          <a href="#process" className="transition hover:text-white">Process</a>
          <a href="#pricing" className="transition hover:text-white">Pricing</a>
        </nav>

        <div className="flex items-center gap-3">
          <button className="hidden rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white sm:inline-flex">
            Log in
          </button>
          <button className="rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:bg-cyan-300">
            Book a demo
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-col gap-24 px-6 pb-20 pt-8 lg:px-8">
        <section className="grid items-center gap-12 pt-8 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16">
          <div className="max-w-xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-cyan-200">
              Built for momentum
            </div>
            <h1 className="text-4xl font-black tracking-[-0.06em] text-white sm:text-5xl lg:text-7xl">
              Turn complexity into clear, measurable progress.
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
              CDM Hub gives teams one operating rhythm for planning, execution, and communication so priorities stay visible and momentum never stalls.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <button className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200">
                Start free trial
              </button>
              <button className="rounded-full border border-slate-700 bg-slate-950/40 px-6 py-3 text-sm font-semibold text-white transition hover:border-slate-500 hover:bg-slate-900/70">
                Explore platform
              </button>
            </div>
            <div className="mt-10 flex flex-wrap gap-8 text-sm text-slate-300">
              <span>• No-code workflows</span>
              <span>• Real-time dashboards</span>
              <span>• Team accountability</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -left-8 top-10 h-32 w-32 rounded-full bg-cyan-500/20 blur-3xl" />
            <div className="absolute -right-6 bottom-6 h-40 w-40 rounded-full bg-blue-600/20 blur-3xl" />

            <div className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950/70 p-5 shadow-2xl shadow-cyan-900/30 backdrop-blur-xl">
              <div className="mb-5 flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Executive view</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Momentum dashboard</h2>
                </div>
                <div className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300">
                  +18.4%
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                  <div className="mb-3 flex items-center justify-between text-sm text-slate-300">
                    <span>Pipeline health</span>
                    <span>86%</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full w-[86%] rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  {metrics.map((metric) => (
                    <div key={metric.label} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                      <div className="text-2xl font-bold text-white">{metric.value}</div>
                      <div className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-400">{metric.label}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm text-slate-300">Priority tracker</p>
                    <p className="text-xs text-cyan-300">Updated 5 min ago</p>
                  </div>
                  <div className="space-y-3">
                    {steps.map((step, index) => (
                      <div key={step} className="flex items-center gap-3">
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-500/15 text-xs font-bold text-cyan-300">
                          {index + 1}
                        </div>
                        <div className="flex-1 rounded-full bg-slate-800 px-3 py-2 text-sm text-slate-200">
                          {step}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="platform" className="grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/20">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400/25 to-blue-600/25 text-lg font-semibold text-cyan-200">
                {feature.title.charAt(0)}
              </div>
              <h3 className="text-xl font-semibold text-white">{feature.title}</h3>
              <p className="mt-3 text-base leading-7 text-slate-300">{feature.description}</p>
            </div>
          ))}
        </section>

        <section id="solutions" className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">The operating system for teams</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Align the work, the people, and the plan.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300">
              From project intake to launch-day delivery, CDM Hub creates the clarity teams need to move faster without losing accountability across departments.
            </p>
          </div>

          <div className="rounded-[2rem] border border-slate-800 bg-slate-900/70 p-6 shadow-xl shadow-slate-950/30">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                <p className="text-sm text-slate-400">Strategy</p>
                <p className="mt-3 text-2xl font-bold text-white">12 initiatives</p>
                <p className="mt-2 text-sm text-emerald-300">+4 launched this quarter</p>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
                <p className="text-sm text-slate-400">Execution</p>
                <p className="mt-3 text-2xl font-bold text-white">94%</p>
                <p className="mt-2 text-sm text-cyan-300">on-track milestones</p>
              </div>
              <div className="rounded-2xl border border-slate-700 bg-slate-950/60 p-4 md:col-span-2">
                <p className="text-sm text-slate-400">Culture of accountability</p>
                <div className="mt-4 flex items-end gap-3">
                  {[48, 64, 75, 88, 92].map((bar) => (
                    <div key={bar} className="flex-1 rounded-t-xl bg-gradient-to-t from-cyan-400 to-blue-500" style={{ height: `${bar}px` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="process" className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-8 sm:p-10">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">How it works</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Three steps to more confident execution.
            </h2>
          </div>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { step: "01", title: "Design the system", copy: "Define goals, ownership, and the rituals that keep work moving." },
              { step: "02", title: "Track what matters", copy: "Capture outcomes in real time with a shared source of truth." },
              { step: "03", title: "Scale with confidence", copy: "See friction early and turn momentum into repeatable operating excellence." },
            ].map((item) => (
              <div key={item.step} className="rounded-3xl border border-slate-700 bg-slate-950/60 p-6">
                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-300">{item.step}</div>
                <h3 className="mt-4 text-xl font-semibold text-white">{item.title}</h3>
                <p className="mt-3 text-base leading-7 text-slate-300">{item.copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="pb-10">
          <div className="rounded-[2rem] border border-cyan-500/20 bg-gradient-to-r from-cyan-500/10 via-slate-900 to-blue-600/10 p-8 sm:p-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">Ready to move faster?</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Bring your teams into one focused operating rhythm.
                </h2>
              </div>
              <button className="rounded-full bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
                Get started today
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/80">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-slate-400 md:flex-row md:items-center md:justify-between lg:px-8">
          <p>© 2026 CDM Hub</p>
          <div className="flex items-center gap-6">
            <a href="#platform" className="hover:text-white">Platform</a>
            <a href="#solutions" className="hover:text-white">Solutions</a>
            <a href="#process" className="hover:text-white">Process</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
