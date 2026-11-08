import assert from 'node:assert/strict';
import {test} from 'node:test';
import {disableDefaultContextMenu} from '../renderer/utils/contextMenu';
import {defaultPrimarySubtitleStyling} from '../renderer/utils/CJKStyling';
import {HookHost, loadHooks} from './helpers/reactHookHost';

/** A stand-in for a DOM element: the menu rule only needs `closest`, `tagName` and attributes. */
const fakeElement = (tagName: string, attributes: Record<string, string> = {}, ancestor?: any) => {
  const element: any = {
    tagName: tagName.toUpperCase(), type: attributes.type ?? '',
    getAttribute: (name: string) => attributes[name] ?? null,
    closest(selector: string) {
      const wanted = selector.split(',').map((part) => part.trim());
      for (let node: any = element; node; node = node.parent) {
        if (wanted.some((part) => part === node.tagName.toLowerCase() || (part === '[contenteditable]' && node.getAttribute('contenteditable') !== null))) return node;
      }
      return null;
    },
    parent: ancestor
  };
  return element;
};

const rightClick = (target: EventTarget, on: any) => {
  const event: any = new Event('contextmenu', {cancelable: true});
  Object.defineProperty(event, 'target', {value: on});
  return target.dispatchEvent(event);
};

const withSelection = (text: string, run: () => void) => {
  const original = (globalThis as any).getSelection;
  (globalThis as any).getSelection = () => ({toString: () => text});
  try { run(); } finally { (globalThis as any).getSelection = original; }
};

test('right-clicks on plain elements suppress the menu and cleanup restores ordinary events', () => {
  const target = new EventTarget();
  const cleanup = disableDefaultContextMenu(target);
  assert.equal(rightClick(target, fakeElement('div')), false);
  assert.equal(rightClick(target, fakeElement('input', {type: 'checkbox'})), false);
  assert.equal(rightClick(target, fakeElement('span', {contenteditable: 'false'})), false);
  cleanup();
  assert.equal(rightClick(target, fakeElement('div')), true);
});

test('editable fields keep the browser menu for Paste and Copy', () => {
  const target = new EventTarget();
  const cleanup = disableDefaultContextMenu(target);
  try {
    for (const field of [
      fakeElement('input'), fakeElement('input', {type: 'text'}), fakeElement('input', {type: 'password'}),
      fakeElement('textarea'), fakeElement('select'),
      fakeElement('span', {contenteditable: 'true'}), fakeElement('span', {contenteditable: ''}),
      fakeElement('b', {}, fakeElement('div', {contenteditable: 'plaintext-only'}))
    ]) assert.equal(rightClick(target, field), true, field.tagName);
  } finally { cleanup(); }
});

test('a text selection keeps the menu so it can be copied, an empty one does not', () => {
  const target = new EventTarget();
  const cleanup = disableDefaultContextMenu(target);
  try {
    withSelection('selected words', () => assert.equal(rightClick(target, fakeElement('div')), true));
    withSelection('', () => assert.equal(rightClick(target, fakeElement('div')), false));
  } finally { cleanup(); }
});

test('it never stops propagation, so other right-click handlers still run', () => {
  const target = new EventTarget();
  const cleanup = disableDefaultContextMenu(target);
  let reached = false;
  target.addEventListener('contextmenu', () => { reached = true; });
  try {
    rightClick(target, fakeElement('div'));
    assert.equal(reached, true);
  } finally { cleanup(); }
});

for (const language of ['JapaneseSentence', 'ChineseSentence'] as const) {
  test(`${language} still changes the word's learning status once when the app suppresses menus`, () => {
    const host = new HookHost();
    const components = loadHooks<typeof import('../renderer/components/Subtitle/Sentence')>('renderer/components/Subtitle/Sentence.tsx', host);
    const changes: string[] = [];
    const word = language === 'JapaneseSentence' ? '見る' : '你好';
    const props = {
      origin: language === 'JapaneseSentence' ? '見た' : word,
      basicForm: word, separation: [{main: word, hiragana: '', pinyin: 'nǐ hǎo'}],
      extraClass: 'subtitle', subtitleStyling: defaultPrimarySubtitleStyling,
      setMeaning() { throw new Error('Right-click must not open the meaning box'); },
      changeLearningState: (text: string) => { changes.push(text); }, getLearningStateClass: () => 'state0'
    };
    const button = host.render(() => components[language](props));
    const target = new EventTarget();
    const cleanup = disableDefaultContextMenu(target);
    target.addEventListener('contextmenu', (event) => button.props.onContextMenu(event));
    try {
      assert.equal(target.dispatchEvent(new Event('contextmenu', {cancelable: true})), false);
      assert.deepEqual(changes, [word]);
    } finally { cleanup(); host.dispose(); }
  });
}
