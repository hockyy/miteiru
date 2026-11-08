import assert from 'node:assert/strict';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {VideoTopBar} from '../renderer/components/VideoPlayer/VideoTopBar';
import {defaultPrimarySubtitleStyling} from '../renderer/utils/CJKStyling';
import {HookHost, loadHooks} from './helpers/reactHookHost';

const noop = () => undefined;
const props = {
  onHome: noop, onOpenFiles: noop, onShowMyWords: noop, onShowShortcuts: noop,
  subtitleMenuOpen: true, setSubtitleMenuOpen: noop,
  canChooseTracks: false, isYoutube: true, onChooseTracks: noop, canChooseAudio: false, onChooseAudio: noop,
  languageName: 'Japanese', hasPrimarySubtitle: true, hasSecondarySubtitle: false,
  onRemovePrimary: noop, onRemoveSecondary: noop
};

test('the existing subtitle setting is recognizably labelled Learning style', () => {
  const host = new HookHost();
  const {SubtitleContentSettings} = loadHooks<typeof import('../renderer/components/VideoPlayer/Sidebar')>(
    'renderer/components/VideoPlayer/Sidebar.tsx', host
  );
  try {
    const tree = host.render(() => SubtitleContentSettings({
      subtitleStyling: defaultPrimarySubtitleStyling, setSubtitleStyling: noop, lang: 'ja'
    }));
    const markup = renderToStaticMarkup(tree);
    assert.match(markup, /aria-label="Learning style"/);
    assert.match(markup, /Colour words by how well you know them/);
  } finally { host.dispose(); }
});

test('the subtitle menu exposes the current Learning style switch state', () => {
  for (const enabled of [true, false]) {
    const markup = renderToStaticMarkup(React.createElement(VideoTopBar, {
      ...props, learningStyleEnabled: enabled, onLearningStyleChange: noop
    }));
    assert.match(markup, new RegExp(`role="menuitemcheckbox" aria-checked="${enabled}"`));
    assert.match(markup, /Learning style/);
  }
});

test('the quick control changes only the existing learning-style value and closes its menu', () => {
  const globals = globalThis as Record<string, any>;
  const savedWindow = globals.window;
  globals.window = {addEventListener: noop, removeEventListener: noop};
  const host = new HookHost();
  const {VideoTopBar: TopBar} = loadHooks<typeof import('../renderer/components/VideoPlayer/VideoTopBar')>(
    'renderer/components/VideoPlayer/VideoTopBar.tsx', host
  );
  const changed: boolean[] = [];
  const closed: boolean[] = [];
  try {
    const tree = host.render(() => TopBar({...props, learningStyleEnabled: true,
      onLearningStyleChange: (value) => changed.push(value), setSubtitleMenuOpen: (value) => closed.push(value)}));
    const findSwitch = (node: React.ReactNode): React.ReactElement<any> | undefined => {
      if (!React.isValidElement<any>(node)) return;
      const element = node as React.ReactElement<any>;
      if (element.props.role === 'menuitemcheckbox') return element;
      for (const child of React.Children.toArray(element.props.children)) {
        const found = findSwitch(child);
        if (found) return found;
      }
    };
    const toggle = findSwitch(tree);
    assert.ok(toggle);
    toggle.props.onClick();
    assert.deepEqual(changed, [false]);
    assert.deepEqual(closed, [false]);
  } finally {
    host.dispose();
    if (savedWindow === undefined) delete globals.window;
    else globals.window = savedWindow;
  }
});
