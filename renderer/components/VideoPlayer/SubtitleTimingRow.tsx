import React from "react";
import {Button} from "../Utils/Button";
import {describeSubtitleShift, SHIFT_STEP_MS, shiftStepLabel} from "../../utils/subtitleTiming";

/**
 * Moves one subtitle earlier or later, for a subtitle file that is out of step with the video:
 * "Japanese subtitles: [−0.1 s] 0.3 s later [+0.1 s] [Reset]". It changes the same shift as the
 * [ and ] keys (Ctrl + [ and ] for the translation).
 */
export const SubtitleTimingRow = ({name, shiftMs, setShiftMs}: {
  name: string;
  shiftMs: number;
  setShiftMs: (update: (old: number) => number) => void;
}) => (
  <div className="flex flex-col gap-1.5 rounded-xl bg-black/20 px-3 py-2 text-sm text-white/85">
    <div className="font-semibold">{name}</div>
    <div className="flex flex-wrap items-center gap-2">
      <Button type="secondary" size="small" aria-label={`Show ${name} 0.1 seconds earlier`}
              onPress={() => setShiftMs((old) => old - SHIFT_STEP_MS)}>
        {shiftStepLabel(-1)}
      </Button>
      <span className="min-w-[5.5rem] text-center text-white" aria-live="polite">{describeSubtitleShift(shiftMs)}</span>
      <Button type="secondary" size="small" aria-label={`Show ${name} 0.1 seconds later`}
              onPress={() => setShiftMs((old) => old + SHIFT_STEP_MS)}>
        {shiftStepLabel(1)}
      </Button>
      <Button type="secondary" size="small" disabled={shiftMs === 0} onPress={() => setShiftMs(() => 0)}>
        Reset
      </Button>
    </div>
  </div>
);

export default SubtitleTimingRow;
