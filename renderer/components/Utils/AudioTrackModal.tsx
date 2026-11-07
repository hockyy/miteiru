import React, {useEffect, useState} from 'react';
import {Play, Volume2} from 'lucide-react';
import {Button} from './Button';
import {MediaTrack} from '../../types/media';
import {getLanguageEmoji, pickDefaultAudioTrack} from "../../utils/mediaUtils";
import {describeEmbeddedTrack} from "../../utils/subtitleLabels";
import {ModalShell} from "./ModalShell";

/**
 * Desktop shell: libmpv plays every track as-is, so a file with several audio tracks only needs
 * a choice of track, not a conversion. The track in the language being learned is preselected when
 * the file has one, otherwise the file's default.
 */
const AudioTrackModal = ({isOpen, onClose, onSelect, fileName, audioTracks, appLanguageCode = ''}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (audioTrackIndex: number) => void;
  fileName: string;
  audioTracks: MediaTrack[];
  appLanguageCode?: string;
}) => {
  const defaultIndex = () => pickDefaultAudioTrack(audioTracks, appLanguageCode);
  const [selected, setSelected] = useState<number>(defaultIndex);
  useEffect(() => setSelected(defaultIndex()),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [audioTracks, appLanguageCode]);

  if (!isOpen) return null;
  return (
      <ModalShell
          title="Choose an audio track"
          icon={<Volume2 className="w-5 h-5 text-blue-300"/>}
          onClose={onClose}
          maxWidthClassName="max-w-lg"
          minSizeClassName="min-h-0 min-w-[min(92vw,24rem)]"
          footer={(
              <div className="flex justify-end">
                <Button type="primary" onPress={() => onSelect(selected)}>
                  <div className="flex items-center gap-2"><Play className="w-4 h-4"/>Play this track</div>
                </Button>
              </div>
          )}
      >
        <div className="text-center mb-4">
          <div className="text-white font-medium break-words">{fileName}</div>
          <div className="text-gray-400 text-xs mt-1">{audioTracks.length} audio tracks</div>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {audioTracks.map((track, index) => (
              <label key={track.index} className="flex items-center gap-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                <input type="radio" name="audioTrack" checked={selected === index} onChange={() => setSelected(index)}
                       className="w-4 h-4 text-blue-600 bg-gray-600 border-gray-500"/>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {getLanguageEmoji(track.language)}
                  <span className="text-white text-sm truncate">{describeEmbeddedTrack(track, index).label}</span>
                </div>
              </label>
          ))}
        </div>
      </ModalShell>
  );
};

export default AudioTrackModal;
