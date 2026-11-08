import React, {useId} from 'react';
import {ModalShell} from '../Utils/ModalShell';
import {Button} from '../Utils/Button';
import {SIDEBAR_FIELD_INPUT} from './SidebarShell';
import {transcriptionStatus} from '../../utils/transcriptionStatus';
import type {YoutubeTranscriptionState} from '../../utils/youtubeTranscription';
import type {AsrModelOption} from '../../utils/generateSubtitlesConfig';

export function YoutubeTranscriptionControl({isOpen, onClose, onStart, onStop, onRetry, enabled, state, hasApiKey, asrModel, setAsrModel, asrModelOptions}: {
  isOpen: boolean; onClose: () => void; onStart: () => void; onStop: () => void; onRetry: () => void;
  enabled: boolean; state: YoutubeTranscriptionState; hasApiKey: boolean; asrModel: string;
  setAsrModel: (value: string) => unknown; asrModelOptions: AsrModelOption[];
}) {
  const modelId = useId();
  if (!isOpen) return null;
  const status = transcriptionStatus(state, enabled);
  return <ModalShell title="Subtitles from the audio" onClose={onClose} maxWidthClassName="max-w-lg" footer={
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="secondary" onPress={onClose}>Keep watching</Button>
      {enabled && state.error && <Button type="primary" onPress={onRetry}>Try this piece again</Button>}
      {enabled ? <Button type="danger" onPress={onStop}>Stop</Button>
        : <Button type="primary" disabled={!hasApiKey} onPress={onStart}>Start from here</Button>}
    </div>
  }>
    <div className="space-y-4 text-sm text-white/85">
      <p>Miteiru sends the audio just ahead of you to the transcription model and adds the lines, with readings and meanings, before you reach them.</p>
      <p className="text-xs text-white/60">Uses your OpenRouter key. Each 30-second piece is one paid request; pieces already made are reused.</p>
      {!hasApiKey && <p className="text-amber-200">Add your OpenRouter key in Settings → AI.</p>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={modelId} className="text-xs font-bold text-white/70">Transcription model</label>
        <select id={modelId} className={`${SIDEBAR_FIELD_INPUT} w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
          value={asrModel} disabled={enabled} onChange={(event) => setAsrModel(event.target.value)}>
          {asrModelOptions.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
        </select>
      </div>
      <div role="status" className="rounded-xl border border-white/10 bg-white/5 p-3">
        <div className={status.kind === 'error' ? 'text-red-200' : ''}>{status.text}</div>
        {status.pieces && <div className="mt-1 text-xs text-white/60">{status.pieces}</div>}
      </div>
    </div>
  </ModalShell>;
}
