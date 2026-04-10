import { useEffect } from "react";
import { Link } from "react-router-dom";

import heroScreenshot from "@/assets/marketing/hero-screenshot.png";
import { STIMA_GITHUB_URL } from "@/features/marketing/constants";

const workflowSteps = [
  {
    title: "Capture",
    description: "Drop rough voice notes or text right after the walkthrough.",
  },
  {
    title: "Review",
    description: "Refine line items, pricing, customer details, and quote notes.",
  },
  {
    title: "Deliver",
    description: "Share public links, send email, export PDF, or convert to invoice.",
  },
] as const;

export function LandingPage(): React.ReactElement {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Stima - Capture first, quote faster";

    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="screen-radial-backdrop min-h-screen bg-background text-on-surface" data-testid="landing-page">
      <header className="glass-surface glass-shadow-top fixed top-0 z-50 w-full border-b border-outline-variant/20 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <p className="font-headline text-[2rem] font-bold leading-none text-primary">Stima</p>
          <div className="flex items-center gap-3">
            <Link className="text-sm font-semibold text-primary hover:underline" to="/login">
              Sign in
            </Link>
            <Link className="forest-gradient rounded-lg px-4 py-2 text-sm font-semibold text-on-primary transition active:scale-[0.98]" to="/register">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 pb-16 pt-24 sm:px-6 lg:gap-16">
        <section className="grid items-center gap-8 lg:grid-cols-[1fr_360px] lg:gap-10">
          <div>
            <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-widest text-outline">Mobile-first quoting workflow</p>
            <h1 className="max-w-2xl font-headline text-4xl font-bold tracking-tight text-on-surface sm:text-5xl">
              Capture the job first. Refine the quote after.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-on-surface-variant">
              Turn rough notes into a saved draft quote, then review, share, email, export PDF, and convert to an invoice when it is ready.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Link className="forest-gradient rounded-lg px-5 py-3 text-sm font-semibold text-on-primary transition active:scale-[0.98]" to="/register">
                Try it free
              </Link>
              <a
                className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest px-5 py-3 text-sm font-semibold text-on-surface ghost-shadow transition hover:bg-surface-container-low"
                href={STIMA_GITHUB_URL}
                target="_blank"
                rel="noreferrer"
              >
                View repo
              </a>
            </div>
          </div>
          <div className="mx-auto w-full max-w-[19rem] rounded-[1.75rem] bg-surface-container-low p-2 ghost-shadow">
            <img
              src={heroScreenshot}
              alt="Stima quote capture and review flow on mobile"
              width={402}
              height={872}
              className="h-auto w-full rounded-[1.35rem] bg-surface-container-lowest object-cover"
            />
          </div>
        </section>

        <section id="workflow" aria-labelledby="workflow-heading">
          <h2 id="workflow-heading" className="font-headline text-3xl font-bold tracking-tight text-on-surface">
            Capture to delivery in three steps
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {workflowSteps.map((step, index) => (
              <article key={step.title} className="rounded-xl bg-surface-container-low p-4 ghost-shadow">
                <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">Step {index + 1}</p>
                <h3 className="mt-2 font-headline text-xl font-bold tracking-tight text-on-surface">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="credibility" aria-labelledby="credibility-heading" className="grid gap-4 md:grid-cols-2">
          <h2 id="credibility-heading" className="sr-only">
            Product and engineering highlights
          </h2>
          <article className="rounded-xl bg-surface-container-low p-5 ghost-shadow">
            <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">Product outcomes</p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-on-surface-variant">
              <li>Persisted draft lifecycle from first capture through delivery.</li>
              <li>Public quote sharing, email delivery, and PDF generation.</li>
              <li>Quote approval flow and invoice conversion in one workflow.</li>
            </ul>
          </article>
          <article className="rounded-xl bg-surface-container-low p-5 ghost-shadow">
            <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-outline">Engineering</p>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed text-on-surface-variant">
              <li>Async background jobs handle extraction, PDF generation, and email.</li>
              <li>Cookie auth, CSRF checks, and protected app routes enforce boundaries.</li>
              <li>Production-minded deployment with Vercel, GCP, and PostgreSQL.</li>
            </ul>
          </article>
        </section>

        <section className="rounded-xl forest-gradient p-6 text-on-primary ghost-shadow">
          <h2 className="font-headline text-2xl font-bold tracking-tight">Try Stima on your next job</h2>
          <p className="mt-2 text-sm text-on-primary">
            Start with capture-first quoting, then share polished results when you are ready.
          </p>
          <div className="mt-5">
            <Link className="text-sm font-semibold text-on-primary hover:underline" to="/login">
              Already have an account? Sign in
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
