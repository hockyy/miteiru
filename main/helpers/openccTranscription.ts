import {convertOpencc} from '#miteiru/opencc';
import {shouldConvertToTraditional} from '../../renderer/utils/generateSubtitlesConfig';
import type {TranscriptionBody} from './srtFormat';

/** Convert the segments together, before their converted lengths determine cue splits and timing. */
export async function convertTranscription(body: TranscriptionBody, lang: string): Promise<TranscriptionBody> {
  if (!shouldConvertToTraditional(lang)) return body;
  if (body.segments?.length) {
    const lines = await convertOpencc('s2hk', body.segments.map(segment => (segment.text || '').trim()));
    return {...body, segments: body.segments.map((segment, i) => ({...segment, text: lines[i]}))};
  }
  const [text] = await convertOpencc('s2hk', [(body.text || '').trim()]);
  return {...body, text};
}
