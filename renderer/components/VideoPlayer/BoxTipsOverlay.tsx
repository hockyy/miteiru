import React, {useState} from 'react';
import {usePlaybackValue, type PlaybackClock} from '../../utils/playbackClock';
import type {BoxTip} from '../../../main/helpers/boxTips';
import {boxTipKey, compactBoxTipText, currentBoxTipIndex} from '../../utils/boxTipPresentation';

/** Only this card updates at cue boundaries. A stationary (paused) clock keeps its tip visible. */
export function BoxTipsOverlay({tips, clock, enabled, shiftMs = 0}: {tips: BoxTip[]; clock: PlaybackClock; enabled: boolean; shiftMs?: number}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const index = usePlaybackValue(clock, (seconds) => enabled ? currentBoxTipIndex(tips, seconds, shiftMs, dismissed) : -1);
  const tip = tips[index];
  if (!tip) return null;
  return <BoxTipCard tip={tip} onDismiss={() => setDismissed((old) => [...old.slice(-96), boxTipKey(tip)])}/>;
}

export function BoxTipCard({tip, onDismiss}: {tip: BoxTip; onDismiss: () => void}) {
  const kind = {grammar: 'Grammar', pun: 'Wordplay', joke: 'Joke', idiom: 'Idiom', proverb: 'Saying', usage: 'Usage'}[tip.kind];
  return <aside aria-label="Box tip" className="box-tip">
    <div className="box-tip__header">
      <span className="box-tip__kind">{kind}</span>
      <button type="button" aria-label="Dismiss this tip" className="box-tip__close" onClick={onDismiss}>×</button>
    </div>
    <div className="box-tip__phrase">{compactBoxTipText(tip.title, 10, 40)}</div>
    <p className="box-tip__explanation">{compactBoxTipText(tip.text)}</p>
  </aside>;
}
