// Small full-page states for the router: loading a lazy page, a page not built yet, and 404.

export function RouteLoading() {
  return (
    <main className="cb-recover" aria-busy="true">
      <div className="cb-recover-card">
        <div className="cb-spinner" aria-hidden="true" />
        <p>Loading…</p>
      </div>
    </main>
  );
}

export function NotReady({ name }: { name: string }) {
  return (
    <main className="cb-recover">
      <div className="cb-recover-card">
        <h1>Coming soon</h1>
        <p>{name} isn’t here yet.</p>
        <a className="cb-btn is-primary is-wide" href="/">Go to Happi</a>
      </div>
    </main>
  );
}

export function NotFound() {
  return (
    <main className="cb-recover">
      <div className="cb-recover-card">
        <div className="cb-recover-badge" aria-hidden="true"><span /><span /><span /><span /><span /><span /></div>
        <h1>This page wandered off</h1>
        <p>Let’s go back and find Happi.</p>
        <a className="cb-btn is-primary is-wide is-big" href="/">Go to Happi</a>
      </div>
    </main>
  );
}
