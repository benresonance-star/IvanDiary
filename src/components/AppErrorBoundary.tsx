import {
  Component,
  type ReactNode,
} from "react";

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    // Do not log errors here: exception values can contain private diary text.
  }

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children;
    }
    return (
      <main className="fatal-error" role="alert">
        <h1>The diary needs to reopen</h1>
        <p>
          Your saved diary has not been removed. Reopen the app to try again.
        </p>
        <button onClick={() => globalThis.location.reload()} type="button">
          Reopen my diary
        </button>
      </main>
    );
  }
}
