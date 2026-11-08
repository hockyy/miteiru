import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AppErrorBoundary, AppErrorDetails} from '../renderer/components/UI/AppErrorBoundary';
import {createAppErrorReport, formatAppErrorReport} from '../renderer/utils/appErrorReport';

const boundaryHost = () => {
  const boundary = new AppErrorBoundary({children: React.createElement('div', null, 'Healthy player')});
  // Exercise the class's lifecycle and event handlers without a browser or React internals.
  boundary.setState = ((update: any) => {
    const next = typeof update === 'function' ? update(boundary.state, boundary.props) : update;
    if (next) boundary.state = {...boundary.state, ...next};
  }) as typeof boundary.setState;
  return boundary;
};

test('error reports retain message and stacks without serializing request, prompt, or response data', () => {
  const error = Object.assign(new Error('Subtitle token is missing'), {
    request: {apiKey: 'private request'}, config: {headers: {authorization: 'private header'}},
    prompt: 'private prompt', response: {body: 'private response'}, cause: {secret: 'private cause'}
  });
  const report = createAppErrorReport(error, '\n    at SubtitleWord');
  const text = formatAppErrorReport(report);
  assert.match(text, /Subtitle token is missing/);
  assert.match(text, /JavaScript stack:/);
  assert.match(text, /React component stack:\n\n? *at SubtitleWord/);
  assert.doesNotMatch(text, /private|authorization|headers/);
});

test('malformed rejection values and throwing getters never break diagnostics', () => {
  const hostile = Object.defineProperties({}, {
    message: {get() {throw new Error('getter must not escape');}},
    stack: {get() {throw new Error('getter must not escape');}},
    toString: {value() {throw new Error('must never stringify objects');}}
  });
  for (const value of [undefined, null, 0, false, Symbol('secret'), hostile, {request: 'private'}]) {
    const report = createAppErrorReport(value);
    assert.equal(report.message, 'Error details were not provided.');
    assert.equal(report.stack, '');
    assert.doesNotThrow(() => formatAppErrorReport(report));
  }
  assert.equal(createAppErrorReport('Actual string rejection').message, 'Actual string rejection');
});

test('credentials in library-generated messages and stack URLs are masked and reports are bounded', () => {
  const report = createAppErrorReport({
    message: 'Bearer secret-auth api_key=private-key sk-or-v1-abcdefghijklmnopqrstuvwxyz',
    stack: 'at https://example.test/file.js?key=private-query&token=private-token'
  });
  assert.doesNotMatch(formatAppErrorReport(report), /secret-auth|private-key|abcdefghijklmnopqrstuvwxyz|private-query|private-token/);
  assert.match(formatAppErrorReport(report), /\[redacted\]/);
  const huge = createAppErrorReport({message: 'm'.repeat(20000), stack: 's'.repeat(40000)}, 'c'.repeat(20000));
  assert.equal(huge.message.length, 16000);
  assert.equal(huge.stack.length, 32000);
  assert.equal(huge.componentStack.length, 16000);
});

test('render failure fallback shows the actual error and component stack with copy and reload actions', () => {
  const boundary = boundaryHost();
  const error = new TypeError('Cannot read subtitle <entry>');
  boundary.state = {...boundary.state, ...AppErrorBoundary.getDerivedStateFromError(error)};
  boundary.componentDidCatch(error, {componentStack: '\n    at JapaneseSentence'});
  const html = renderToStaticMarkup(boundary.render());
  assert.match(html, /Something went wrong/);
  assert.match(html, /Reloading usually fixes it/);
  assert.match(html, /<summary[^>]*>Error details<\/summary>/);
  assert.match(html, /Cannot read subtitle &lt;entry&gt;/);
  assert.match(html, /at JapaneseSentence/);
  assert.match(html, /Copy details/);
  assert.match(html, /miteiru-btn--primary[^>]*>Reload Miteiru/);
  assert.doesNotMatch(html, /style=/, 'the screen uses the app classes, not inline styles');
  assert.doesNotMatch(html, /Healthy player|Try again/);
});

test('window errors and rejections preserve the player and remove their listeners on unmount', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const handlers = new Map<string, (event: any) => void>();
  Object.defineProperty(globalThis, 'window', {configurable: true, value: {
    addEventListener: (type: string, handler: any) => handlers.set(type, handler),
    removeEventListener: (type: string, handler: any) => {if (handlers.get(type) === handler) handlers.delete(type);}
  }});
  const boundary = boundaryHost();
  try {
    boundary.componentDidMount();
    handlers.get('unhandledrejection')?.({reason: new Error('Temporary player rejection')});
    const html = renderToStaticMarkup(boundary.render());
    assert.match(html, /Healthy player/);
    assert.match(html, /Something went wrong in the background\./);
    assert.match(html, /Details/);
    assert.match(html, /Dismiss/);
    assert.doesNotMatch(html, /Temporary player rejection/, 'the report stays folded until Details is pressed');
    boundary.setState({detailsOpen: true});
    const expanded = renderToStaticMarkup(boundary.render());
    assert.match(expanded, /Temporary player rejection/);
    assert.match(expanded, /Copy details/);
    assert.doesNotMatch(expanded, /Reload Miteiru/);
    handlers.get('error')?.({error: new Error('Later cascade'), message: 'Later cascade'});
    assert.equal(boundary.state.asyncError?.message, 'Temporary player rejection');
    boundary.setState({asyncError: null});
    handlers.get('error')?.({error: null, message: 'Script failure with no Error object'});
    assert.equal(boundary.state.asyncError?.message, 'Script failure with no Error object');
  } finally {
    boundary.componentWillUnmount();
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete (globalThis as any).window;
  }
  assert.equal(handlers.size, 0);
});

test('copy feedback supports successful copying and a selectable fallback when clipboard access fails', async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const boundary = boundaryHost();
  const report = createAppErrorReport(new Error('copy this failure'));
  boundary.setState({failure: report});
  let copied = '';
  try {
    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {clipboard: {
      writeText: async (text: string) => {copied = text;}
    }}});
    await (boundary as any).copyError(report);
    assert.equal(copied, formatAppErrorReport(report));
    assert.equal(boundary.state.copyState, 'copied');
    Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {clipboard: {
      writeText: async () => {throw new Error('permission denied');}
    }}});
    await (boundary as any).copyError(report);
    assert.equal(boundary.state.copyState, 'failed');
    const html = renderToStaticMarkup(React.createElement(AppErrorDetails, {report, copyState: 'failed', onCopy() {}}));
    assert.match(html, /Select the error text below/);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete (globalThis as any).navigator;
  }
});
