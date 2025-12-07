import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    private handleReload = () => {
        window.location.reload();
    };

    private handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 p-6 text-center">
                    {/* Error Icon */}
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-red-400 to-rose-500 flex items-center justify-center mb-6 shadow-lg">
                        <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>

                    {/* Title */}
                    <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-3">
                        Oops! Something went wrong
                    </h1>

                    {/* Description */}
                    <p className="text-slate-600 dark:text-slate-300 mb-6 max-w-md">
                        We encountered an unexpected error. Don't worry, your data is safe.
                        Try refreshing the page or click the button below.
                    </p>

                    {/* Error Details (collapsible in dev) */}
                    {process.env.NODE_ENV === 'development' && this.state.error && (
                        <details className="mb-6 text-left bg-white dark:bg-slate-800 rounded-xl p-4 max-w-lg w-full shadow-lg border border-slate-200 dark:border-slate-700">
                            <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
                                Error Details (Development Only)
                            </summary>
                            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg overflow-auto">
                                <p className="text-sm font-mono text-red-700 dark:text-red-400 break-all">
                                    {this.state.error.toString()}
                                </p>
                                {this.state.errorInfo && (
                                    <pre className="mt-2 text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap">
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                )}
                            </div>
                        </details>
                    )}

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={this.handleReset}
                            className="px-6 py-3 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors shadow-md"
                        >
                            Try Again
                        </button>
                        <button
                            onClick={this.handleReload}
                            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg"
                        >
                            Refresh Page
                        </button>
                    </div>

                    {/* PlantPal Branding */}
                    <p className="mt-8 text-sm text-slate-400 dark:text-slate-500">
                        🌿 PlantPal - We'll grow past this together!
                    </p>
                </div>
            );
        }

        return this.props.children;
    }
}
