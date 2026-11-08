import {ipcMain} from "electron";
import {getStore} from "./storeHandlers";
import {
  DEFAULT_OPENROUTER_MODEL,
  DEFAULT_OPENROUTER_THINKING,
  OPENROUTER_THINKING_KEY,
  openRouterMessages
} from "../../../renderer/utils/openRouterConstants";
import {BoxTipsService, type BoxTipsResult} from "../../helpers/boxTips";
import {isJobCancelled, throwIfAborted} from "../../helpers/runCommand";

const service = new BoxTipsService();
const requests = new Map<string, AbortController>();

export function registerBoxTipsHandlers() {
  ipcMain.handle("box-tips:generate", async (event, request: unknown): Promise<BoxTipsResult> => {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      return {ok: false, tips: [], error: 'Box tips request is invalid.'};
    }
    const input = request as Record<string, unknown>;
    const requestId = typeof input.requestId === 'string' ? input.requestId.trim() : '';
    if (!requestId || requestId.length > 160) return {ok: false, tips: [], error: "Box tips request id is missing or invalid."};
    if (typeof input.lang !== 'string' || (input.includeTips !== undefined && typeof input.includeTips !== 'boolean')
      || (input.includeDictionary !== undefined && typeof input.includeDictionary !== 'boolean')) {
      return {ok: false, tips: [], error: 'Box tips request settings are invalid.'};
    }
    const key = `${event.sender.id}:${requestId}`;
    requests.get(key)?.abort();
    const controller = new AbortController();
    requests.set(key, controller);
    try {
      const store = await getStore();
      throwIfAborted(controller.signal);
      const apiKey = String(store.get("openrouter.apiKey", "") || "").trim();
      if (!apiKey) throw new Error(openRouterMessages.missingApiKey);
      const model = String(store.get("openrouter.model", DEFAULT_OPENROUTER_MODEL) || DEFAULT_OPENROUTER_MODEL).trim();
      if (!model) throw new Error(openRouterMessages.missingModel);
      const content = await service.generate({
        apiKey,
        model,
        thinking: store.get(OPENROUTER_THINKING_KEY, DEFAULT_OPENROUTER_THINKING),
        lang: input.lang.trim(),
        cues: input.cues as Parameters<BoxTipsService['generate']>[0]['cues'],
        includeTips: input.includeTips as boolean | undefined,
        includeDictionary: input.includeDictionary as boolean | undefined,
        signal: controller.signal
      });
      return {ok: true, ...content};
    } catch (error) {
      if (controller.signal.aborted || isJobCancelled(error)) return {ok: false, tips: [], cancelled: true};
      return {ok: false, tips: [], error: error instanceof Error ? error.message : String(error)};
    } finally {
      if (requests.get(key) === controller) requests.delete(key);
    }
  });
  ipcMain.handle("box-tips:cancel", (event, requestId: unknown) => {
    if (typeof requestId !== 'string' || requestId.length > 160) return false;
    requests.get(`${event.sender.id}:${requestId.trim()}`)?.abort();
    return true;
  });
}
