import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyAppearance, cachedAppearance } from "@/lib/appearance";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./index.css";

class ApplicationErrorBoundary extends React.Component<{ children: React.ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <main role="alert" className="m-8 max-w-2xl rounded-lg border border-destructive p-6 text-sm">
        <h1 className="font-semibold">Skills Space could not render</h1>
        <p className="mt-2 break-words text-muted-foreground">{this.state.error.message}</p>
        <button className="mt-4 underline" type="button" onClick={() => this.setState({ error: undefined })}>Retry</button>
      </main>;
    }

    return this.props.children;
  }
}

applyAppearance(cachedAppearance(), window.matchMedia("(prefers-color-scheme: dark)").matches);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ApplicationErrorBoundary>
    <TooltipProvider>
      <App />
    </TooltipProvider>
    </ApplicationErrorBoundary>
  </React.StrictMode>,
);
