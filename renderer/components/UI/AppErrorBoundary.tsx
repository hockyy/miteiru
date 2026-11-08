import React, {Component, ErrorInfo, ReactNode} from 'react';
import {AppErrorReport, createAppErrorReport, formatAppErrorReport} from '../../utils/appErrorReport';
import {Button} from '../Utils/Button';
import {HOME_SHELL, UI_PAGE_BG} from './miteiruUiTheme';

type CopyState = 'idle' | 'copied' | 'failed';
interface State {
  failure: AppErrorReport | null;
  asyncError: AppErrorReport | null;
  copyState: CopyState;
  detailsOpen: boolean;
}

const COPY_FAILED = "Couldn't copy automatically. Select the error text below to copy it.";

const ReportText = ({report, className}: {report: AppErrorReport; className: string}) =>
  <pre className={`select-text overflow-auto whitespace-pre-wrap break-words rounded-xl border p-3 font-mono text-xs leading-relaxed ${className}`}>
    {formatAppErrorReport(report)}
  </pre>;

const copyLabel = (copyState: CopyState) => copyState === 'copied' ? 'Copied' : 'Copy details';

/** The copy button, its failure note and the report: shown in the background-error notice once expanded. */
export const AppErrorDetails = ({report, copyState, onCopy}: {
  report: AppErrorReport; copyState: CopyState; onCopy: () => void;
}) => <div className="mt-3 flex flex-col items-start gap-2">
  <Button type="secondary" size="small" onPress={onCopy}>{copyLabel(copyState)}</Button>
  {copyState === 'failed' && <p role="status" className="text-xs text-amber-200">{COPY_FAILED}</p>}
  <ReportText report={report} className="max-h-[40vh] w-full border-white/10 bg-black/30 text-white/85"/>
</div>;

/** Render failures replace the crashed tree; asynchronous errors only add a dismissible notice. */
export class AppErrorBoundary extends Component<{children: ReactNode}, State> {
  state: State = {failure: null, asyncError: null, copyState: 'idle', detailsOpen: false};

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return {failure: createAppErrorReport(error), copyState: 'idle'};
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({failure: createAppErrorReport(error, info.componentStack ?? '')});
  }

  componentDidMount() {
    window.addEventListener('error', this.onWindowError);
    window.addEventListener('unhandledrejection', this.onUnhandledRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.onWindowError);
    window.removeEventListener('unhandledrejection', this.onUnhandledRejection);
  }

  private captureAsyncError = (error: unknown) => {
    // Keep the first report until dismissed so a cascade cannot overwrite the original error.
    this.setState(state => state.failure || state.asyncError ? null : {asyncError: createAppErrorReport(error), copyState: 'idle', detailsOpen: false});
  };
  private onWindowError = (event: ErrorEvent) => {
    if (event.error || event.message) this.captureAsyncError(event.error ?? event.message);
  };
  private onUnhandledRejection = (event: PromiseRejectionEvent) => this.captureAsyncError(event.reason);

  private copyError = async (report: AppErrorReport) => {
    let copyState: CopyState = 'copied';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(formatAppErrorReport(report));
    } catch {
      copyState = 'failed';
    }
    this.setState(state => state.failure === report || state.asyncError === report ? {copyState} : null);
  };

  render() {
    const {failure, asyncError, copyState, detailsOpen} = this.state;
    if (failure) return <main role="alert" className={`fixed inset-0 z-[2147483647] flex select-text ${UI_PAGE_BG}`}>
      <div className={`${HOME_SHELL} m-auto p-6 sm:p-8`}>
        <h1 className="text-2xl font-black">Something went wrong</h1>
        <p className="mt-3 text-sm font-medium leading-relaxed text-blue-900">
          Miteiru hit an error it couldn&apos;t recover from. Reloading usually fixes it. If it keeps happening, copy the details and send them to us.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="primary" onPress={() => window.location.reload()}>Reload Miteiru</Button>
          <Button type="secondary" onPress={() => void this.copyError(failure)}>{copyLabel(copyState)}</Button>
        </div>
        {copyState === 'failed' && <p role="status" className="mt-3 text-sm font-medium text-red-800">{COPY_FAILED}</p>}
        <details className="mt-5">
          <summary className="cursor-pointer text-sm font-bold text-blue-900">Error details</summary>
          <ReportText report={failure} className="mt-3 max-h-[50vh] border-blue-200 bg-white text-blue-950"/>
        </details>
      </div>
    </main>;

    return <>
      {this.props.children}
      {asyncError && <aside role="status" className="fixed bottom-4 right-4 z-[2147483646] box-border max-h-[70vh] w-[min(32rem,calc(100vw-2rem))] overflow-auto rounded-2xl border border-white/10 bg-slate-950/95 p-4 text-white shadow-2xl shadow-black/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <strong className="text-sm font-bold">Something went wrong in the background.</strong>
          <div className="flex gap-2">
            <Button type="secondary" size="small" aria-expanded={detailsOpen}
              onPress={() => this.setState({detailsOpen: !detailsOpen})}>Details</Button>
            <Button type="secondary" size="small"
              onPress={() => this.setState({asyncError: null, copyState: 'idle', detailsOpen: false})}>Dismiss</Button>
          </div>
        </div>
        {detailsOpen && <AppErrorDetails report={asyncError} copyState={copyState} onCopy={() => void this.copyError(asyncError)}/>}
      </aside>}
    </>;
  }
}
