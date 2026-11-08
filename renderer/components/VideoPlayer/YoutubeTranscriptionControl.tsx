import React from 'react';
import {ModalShell} from '../Utils/ModalShell';
import {Button} from '../Utils/Button';
import type {YoutubeTranscriptionState} from '../../utils/youtubeTranscription';
import type {AsrModelOption} from '../../utils/generateSubtitlesConfig';

export function YoutubeTranscriptionControl({isOpen, onClose, onStart, onStop, onRetry, enabled, state, hasApiKey, asrModel, setAsrModel, asrModelOptions, languageName}: {
  isOpen: boolean; onClose: () => void; onStart: () => void; onStop: () => void; onRetry: () => void;
  enabled: boolean; state: YoutubeTranscriptionState; hasApiKey: boolean; asrModel: string;
  setAsrModel: (value: string) => unknown; asrModelOptions: AsrModelOption[]; languageName: string;
}) {
  if (!isOpen) return null;
  return <ModalShell title="Generate ahead" onClose={onClose} maxWidthClassName="max-w-lg" footer={
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="secondary" onPress={onClose}>Keep watching</Button>
      {enabled ? <Button type="danger" onPress={onStop}>Stop generating</Button>
        : <Button type="primary" disabled={!hasApiKey} onPress={onStart}>Start from here</Button>}
      {enabled && state.error && <Button type="primary" onPress={onRetry}>Retry segment</Button>}
    </div>
  }>
    <div className="space-y-4 text-sm text-white/85">
      <p>Prepare {languageName} subtitles from the audio you are about to watch, with word readings and meanings. Completed segments are reused when you seek back.</p>
      <p className="text-xs text-white/60">Uses your OpenRouter key in paid, 30-second audio batches. Prepares up to a minute ahead while playing. Playback continues; you can pause while the first segment gets ready.</p>
      {!hasApiKey && <p className="text-amber-200">Add your OpenRouter key in video settings → AI.</p>}
      <label className="block space-y-2">
        <span>Transcription model</span>
        <select className="w-full rounded-lg bg-white p-2 text-blue-950" value={asrModel} disabled={enabled}
          onChange={(event) => setAsrModel(event.target.value)}>
          {asrModelOptions.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
        </select>
      </label>
      <div role="status" className="rounded-xl border border-white/10 bg-white/5 p-3">
        {state.error ? <span className="text-red-200">{state.error}</span>
          : enabled ? state.activeSegment ? `Preparing ${Math.floor(state.activeSegment.bucketStartSeconds)}–${Math.ceil(state.activeSegment.bucketEndSeconds)} seconds…`
            : `Ready through ${Math.floor(state.bufferedUntilSeconds)} seconds`
          : 'Off — start whenever you need generated subtitles.'}
        {state.completedSegments > 0 && <div className="mt-1 text-xs text-white/60">{state.completedSegments} segments prepared</div>}
      </div>
    </div>
  </ModalShell>;
}
