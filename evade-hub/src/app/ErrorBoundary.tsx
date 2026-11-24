import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** 'page' = full friendly recovery screen; 'layer' = the app UI over the scene (the scene keeps running). */
  variant?: 'page' | 'layer';
}
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] something broke', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.variant === 'layer') {
      return (
        <div className="cb-layer-error" role="alert">
          <span>Oops, the buttons tripped up.</span>
          <button type="button" className="cb-btn is-primary" onClick={this.reset}>Fix it</button>
        </div>
      );
    }
    return (
      <main className="cb-recover" role="alert">
        <div className="cb-recover-card">
          <div className="cb-recover-badge" aria-hidden="true">
            <span /><span /><span /><span /><span /><span />
          </div>
          <h1>Oops! Something went wrong.</h1>
          <p>Bobo knocked something over in the hideout. Let’s try that again.</p>
          <div className="cb-row is-stack">
            <button type="button" className="cb-btn is-primary is-wide is-big" onClick={this.reset}>Try again</button>
            <button type="button" className="cb-btn is-ghost is-wide" onClick={() => location.reload()}>Reload the page</button>
          </div>
          {import.meta.env.DEV && <pre className="cb-recover-detail">{String(error.stack || error.message)}</pre>}
        </div>
      </main>
    );
  }
}
