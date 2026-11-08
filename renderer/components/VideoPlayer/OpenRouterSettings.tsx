/**
 * The OpenRouter key and model the AI tools use (word notes, translations, sentence analysis), kept in
 * the store as 'openrouter.apiKey' and 'openrouter.model'. Video settings (AI tab) and the Study page's
 * settings both show it and edit the same values.
 */
import React, {useCallback, useEffect, useId, useState} from "react";
import {Button} from "../Utils/Button";
import {useStoreData} from "../../hooks/useStoreData";
import {SidebarSection, SIDEBAR_FIELD_INPUT} from "./SidebarShell";
import {DEFAULT_OPENROUTER_MODEL, OPENROUTER_KEYS_URL} from "../../utils/openRouterConstants";

export const OpenRouterSettings = () => {
  const [apiKey, setApiKey] = useStoreData('openrouter.apiKey', '');
  const [model, setModel] = useStoreData('openrouter.model', DEFAULT_OPENROUTER_MODEL);
  const [modelDraft, setModelDraft] = useState(model);
  const [showApiKey, setShowApiKey] = useState(false);
  const modelId = useId();
  const keyId = useId();

  useEffect(() => {
    setModelDraft(model);
  }, [model]);

  // The model saves on Save, so a half-typed id is never used; the key saves as it's typed.
  const saveModel = useCallback(() => {
    setModel(modelDraft.trim());
  }, [modelDraft, setModel]);
  const modelChanged = modelDraft.trim() !== model;

  return <SidebarSection title="OpenRouter AI">
    <div className="flex flex-col gap-2">
      <label htmlFor={keyId} className="text-sm text-white/85">API key</label>
      <div className="flex min-w-0 flex-row items-center gap-2">
        <input
          id={keyId}
          type={showApiKey ? "text" : "password"}
          placeholder="OpenRouter API key"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          className={SIDEBAR_FIELD_INPUT}
        />
        <Button type="secondary" size="small" className="shrink-0" onPress={() => setShowApiKey(!showApiKey)}>
          {showApiKey ? "Hide" : "Show"}
        </Button>
      </div>
      <div className="text-xs text-white/60">
        For AI notes, translations and sentence analysis. Get a key at{" "}
        <a href={OPENROUTER_KEYS_URL} target="_blank" rel="noreferrer" className="underline hover:text-white">
          openrouter.ai/keys
        </a>.
      </div>
    </div>
    <div className="flex flex-col gap-2">
      <label htmlFor={modelId} className="text-sm text-white/85">Model</label>
      <div className="flex min-w-0 flex-row items-center gap-2">
        <input
          id={modelId}
          type="text"
          placeholder={`e.g., ${DEFAULT_OPENROUTER_MODEL}`}
          spellCheck={false}
          value={modelDraft}
          onChange={(e) => setModelDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && modelChanged && modelDraft.trim()) saveModel();
          }}
          className={SIDEBAR_FIELD_INPUT}
        />
        <Button type="primary" size="small" className="shrink-0" onPress={saveModel}
                disabled={!modelChanged || !modelDraft.trim()}>
          Save
        </Button>
      </div>
    </div>
  </SidebarSection>;
};
