import {youtubeCaptionSource, type YoutubeCaptionInfo} from "./youtubeCaptions";
import {parseSubtitleCues} from "./subtitleParser";

/** Download only the selected caption file, without extracting the entire video a second time. */
export async function downloadYoutubeCaption(
  info: YoutubeCaptionInfo,
  language: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15_000
): Promise<{ext: "vtt" | "srt"; content: string} | null> {
  const source = youtubeCaptionSource(info, language);
  if (!source) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(source.url, {headers: source.headers, signal: controller.signal});
    if (!response.ok) throw new Error(`YouTube captions returned HTTP ${response.status}.`);
    const content = await response.text();
    // Expired signatures can return an empty body; never save an error page as a subtitle.
    if (!parseSubtitleCues(content).some((cue) => cue.text.trim())) {
      throw new Error("YouTube returned an empty or invalid caption file.");
    }
    return {ext: source.ext, content};
  } finally {
    clearTimeout(timer);
  }
}
