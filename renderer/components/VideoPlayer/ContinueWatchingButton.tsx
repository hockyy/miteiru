import React from "react";
import {Button} from "../Utils/Button";
import {continueLabel, type LastVideo} from "../../utils/continueWatching";

/** "Continue ep01.mkv at 12:34": opens the last video where it was left. Nothing shows without one. */
export const ContinueWatchingButton = ({video, onContinue, disabled = false, disabledTitle}: {
  video: LastVideo | null;
  onContinue: () => void;
  disabled?: boolean;
  /** Why it is disabled, shown as the tooltip instead of the label. */
  disabledTitle?: string;
}) => {
  if (!video) return null;
  const label = continueLabel(video);
  return (
    <Button type="secondary" className={`max-w-full ${disabled ? 'buttonDisabled' : ''}`} disabled={disabled} onPress={onContinue} title={disabled && disabledTitle ? disabledTitle : label}>
      <span aria-hidden="true">⏯</span>
      <span className="ml-1.5 min-w-0 truncate">{label}</span>
    </Button>
  );
};

export default ContinueWatchingButton;
