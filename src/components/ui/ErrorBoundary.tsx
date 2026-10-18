import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "./Feedback";
import { ApiError, toUserError, type UserError } from "@/lib/errors";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failure: UserError | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failure: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const technical = error instanceof Error ? error.message : String(error);
    return { failure: toUserError(new ApiError("RUNTIME_ERROR", false, technical)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the stack for developers, while the page only shows a safe code and remedy.
    console.error("[doz-ui] Unhandled render error", error, info.componentStack);
  }

  render() {
    if (this.state.failure) {
      return (
        <div className="error-boundary">
          <ErrorState
            title="برنامه موقتاً متوقف شد"
            details={this.state.failure}
            onRetry={() => window.location.reload()}
            retryLabel="بارگذاری دوباره"
          />
        </div>
      );
    }

    return this.props.children;
  }
}
