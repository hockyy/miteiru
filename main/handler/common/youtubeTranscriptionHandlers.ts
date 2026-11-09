import {ipcMain} from "../../../renderer/platform/backend/shims/desktop";
import path from "node:path";
import type {YoutubeTranscriptionSegmentRequest, YoutubeTranscriptionSegmentResult} from "../../../renderer/types/youtubeTranscription";
import {createYoutubeSegmentTranscriber, validateYoutubeSegmentRequest} from "../../helpers/youtubeSegmentTranscription";
import {isJobCancelled} from "../../helpers/runCommand";
import {getStore} from "./storeHandlers";

/** Each request can stop independently when playback seeks elsewhere or the mode is disabled. */
export function registerYoutubeTranscriptionHandlers(appDataDirectory: string) {
  const transcriber = createYoutubeSegmentTranscriber({cacheDir: path.join(appDataDirectory, "youtube-transcription")});
  const requests = new Map<string, AbortController>();

  ipcMain.handle("youtube-transcription:segment", async (_event, input: YoutubeTranscriptionSegmentRequest): Promise<YoutubeTranscriptionSegmentResult> => {
    let request: YoutubeTranscriptionSegmentRequest;
    try { request = validateYoutubeSegmentRequest(input); } catch (error) {
      return {ok: false, error: error instanceof Error ? error.message : String(error)};
    }
    if (requests.has(request.requestId)) return {ok: false, error: "This transcription request is already running."};
    const abort = new AbortController();
    requests.set(request.requestId, abort);
    try {
      const store = await getStore();
      const apiKey = String(store.get("openrouter.apiKey", "") || "").trim();
      const entries = await transcriber.transcribeSegment(request, apiKey, abort.signal);
      return {ok: true, entries};
    } catch (error) {
      if (abort.signal.aborted || isJobCancelled(error)) return {ok: false, cancelled: true};
      return {ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 1000)};
    } finally {
      if (requests.get(request.requestId) === abort) requests.delete(request.requestId);
    }
  });

  ipcMain.handle("youtube-transcription:cancel", async (_event, requestId: string) => {
    const request = requests.get(String(requestId));
    request?.abort();
    return Boolean(request);
  });
}
