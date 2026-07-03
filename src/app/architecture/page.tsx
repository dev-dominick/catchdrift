export default function ArchitecturePage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-slate-900">Architecture and MVP Boundary</h1>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">What is real</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>Authenticated ingestion endpoints for metrics and deployment events.</li>
          <li>PostgreSQL persistence with idempotent and revision-safe ingestion behavior.</li>
          <li>Durable jobs table with worker claiming, retries, and redacted failure state.</li>
          <li>Deterministic tracking_integrity_failure@1 evaluation and suppression logic.</li>
          <li>Deterministic deployment correlation scoring and exposure calculation.</li>
          <li>Incident lifecycle with append-only incident event history.</li>
          <li>Asynchronous replay runs with persisted run-state polling and session-aware contention handling.</li>
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Processing paths</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>Normal ingestion path: source payloads enqueue durable evaluation jobs and are processed by the worker process.</li>
          <li>Contest replay path: replay orchestration persists demo records and drains only demo jobs inline to keep deterministic timing.</li>
          <li>Both paths execute the same persisted rule evaluation, incident creation, correlation, and recovery logic.</li>
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">What is simulated</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
          <li>Campaign source data values are controlled for deterministic contest replay.</li>
          <li>Provider OAuth connectors for ad and affiliate platforms are not included.</li>
          <li>Automatic remediation is intentionally out of scope.</li>
        </ul>
      </section>
    </div>
  );
}
