import assert from 'node:assert/strict';
import {test} from 'node:test';
import {disableDefaultContextMenu} from '../renderer/utils/contextMenu';
import {defaultPrimarySubtitleStyling} from '../renderer/utils/CJKStyling';
import {HookHost, loadHooks} from './helpers/reactHookHost';

test('unhandled right-clicks suppress the default menu and cleanup restores ordinary events', () => {
  const target = new EventTarget();
  const cleanup = disableDefaultContextMenu(target);
  assert.equal(target.dispatchEvent(new Event('contextmenu', {cancelable: true})), false);
  cleanup();
  assert.equal(target.dispatchEvent(new Event('contextmenu', {cancelable: true})), true);
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
