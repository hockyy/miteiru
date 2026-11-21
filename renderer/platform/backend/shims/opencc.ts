import {openccText, openccWireLine, type OpenccMode} from '../../../../main/language/opencc';
import {sys} from '../sys';

export async function convertOpencc(mode: OpenccMode, lines: string[]): Promise<string[]> {
  const result: Array<string | number[]> = await sys('opencc_convert_batch', {mode, lines: lines.map(openccWireLine)});
  return result.map(openccText);
}
