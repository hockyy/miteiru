import React, {Component, ErrorInfo, ReactNode} from 'react';
import {AppErrorReport, createAppErrorReport, formatAppErrorReport} from '../../utils/appErrorReport';

type CopyState = 'idle' | 'copied' | 'failed';
interface State {
  failure: AppErrorReport | null;
  asyncError: AppErrorReport | null;
  copyState: CopyState;
}

const buttonStyle: React.CSSProperties = {
  border: '1px solid #93c5fd', borderRadius: 8, background: '#dbeafe', color: '#172554',
  padding: '8px 14px', font: 'inherit', fontWeight: 700, cursor: 'pointer'
};
const reportStyle: React.CSSProperties = {
  marginTop: 16, padding: 16, border: '1px solid #bfdbfe', borderRadius: 8,
  background: '#fff', color: '#172554', fontSize: 13, lineHeight: 1.5,
  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', userSelect: 'text'
};

export const AppErrorDetails = ({report, copyState, onCopy}: {
  report: AppErrorReport; copyState: CopyState; onCopy: () => void;
}) => <>
  <p style={{whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontWeight: 700}}>{report.message}</p>
  <button type="button" style={buttonStyle} onClick={onCopy}>{copyState === 'copied' ? 'Copied' : 'Copy error'}</button>
  {copyState === 'failed' && <p role="status">Couldn&apos;t copy automatically. Select the error text below to copy it.</p>}
  <pre style={reportStyle}>{formatAppErrorReport(report)}</pre>
</>;

/** Render failures replace the crashed tree; asynchronous errors only add a dismissible notice. */
export class AppErrorBoundary extends Component<{children: ReactNode}, State> {
  state: State = {failure: null, asyncError: null, copyState: 'idle'};

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
    this.setState(state => state.failure || state.asyncError ? null : {asyncError: createAppErrorReport(error), copyState: 'idle'});
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
    const {failure, asyncError, copyState} = this.state;
    if (failure) return <main role="alert" style={{
      position: 'fixed', inset: 0, zIndex: 2147483647, overflow: 'auto', boxSizing: 'border-box',
      padding: 'clamp(20px, 5vw, 64px)', background: '#eff6ff', color: '#172554', userSelect: 'text'
    }}>
      <div style={{maxWidth: 1000, margin: '0 auto'}}>
        <h1 style={{fontSize: 28, fontWeight: 800, marginBottom: 12}}>Miteiru encountered an error</h1>
        <p style={{marginBottom: 16}}>Copy the details below to help diagnose the crash.</p>
        <button type="button" style={buttonStyle} onClick={() => window.location.reload()}>Reload Miteiru</button>
        <AppErrorDetails report={failure} copyState={copyState} onCopy={() => void this.copyError(failure)}/>
      </div>
    </main>;

    return <>
      {this.props.children}
      {asyncError && <aside role="status" style={{
        position: 'fixed', right: 16, bottom: 16, zIndex: 2147483646,
        width: 'min(560px, calc(100vw - 32px))', maxHeight: '65vh', overflow: 'auto',
        padding: 16, border: '1px solid #93c5fd', borderRadius: 12, boxSizing: 'border-box',
        background: '#eff6ff', color: '#172554', boxShadow: '0 4px 24px #0003', userSelect: 'text'
      }}>
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16}}>
          <strong>A client error was caught</strong>
          <button type="button" style={buttonStyle} onClick={() => this.setState({asyncError: null, copyState: 'idle'})}>Dismiss</button>
        </div>
        <details style={{marginTop: 12}}>
          <summary style={{cursor: 'pointer', fontWeight: 700}}>Error details</summary>
          <AppErrorDetails report={asyncError} copyState={copyState} onCopy={() => void this.copyError(asyncError)}/>
        </details>
      </aside>}
    </>;
  }
}
