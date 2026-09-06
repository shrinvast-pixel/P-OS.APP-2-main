import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught component error in ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="my-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center text-slate-800 dark:text-slate-100 shadow-lg">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-red-500/20 text-red-500">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-base font-bold text-red-500">
            {this.props.fallbackTitle || 'Component View Recovered'}
          </h3>
          <p className="mt-1 text-xs text-slate-400">
            {this.state.error?.message || 'An unexpected rendering error occurred while displaying photos or details.'}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-xs font-bold text-white hover:bg-red-600 transition-all active:scale-95 shadow-md"
          >
            <RefreshCw size={14} /> Recover View
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
