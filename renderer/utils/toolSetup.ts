/**
 * What the helper tools (yt-dlp, FFmpeg) are for and how to get them, in plain words.
 * Videos with separate subtitle files need neither; YouTube captions need yt-dlp. Subtitles stored
 * inside MKV and WebM files are read natively; those inside other containers (MP4, AVI, ...) need FFmpeg.
 */

export const SUBTITLES_UNREADABLE_TOAST =
  "Couldn't read the subtitles inside this video. Files other than MKV need FFmpeg for that: Home → Settings & tools.";

/** What the toast says when a video's tracks could not be read: missing FFmpeg, or the file itself. */
export const analysisFailureMessage = (error: string | null | undefined): string => (
  /not found|ENOENT/i.test(error ?? "")
    ? SUBTITLES_UNREADABLE_TOAST
    : "Couldn't read the subtitles inside this video. You can open a subtitle file instead."
);

export const YT_DLP_NEEDED = "YouTube captions need a free helper called yt-dlp.";

/** Whether a YouTube captions error is the missing-yt-dlp one (main/handler/common/mediaTools.ts). */
export const isMissingYtDlpError = (message: string | null | undefined): boolean => (
  /yt-dlp was not found/i.test(message ?? "")
);

/** What to do about yt-dlp on each OS; Windows is the default. */
export const ytDlpSetupSteps = (platform: string): string[] => {
  if (platform === "darwin") {
    return [
      "Open Terminal and run: brew install yt-dlp",
      "Or download yt-dlp_macos from the yt-dlp page and put it in Miteiru's tools folder, named yt-dlp."
    ];
  }
  if (platform === "linux") {
    return [
      "Install yt-dlp with your package manager (for example: sudo apt install yt-dlp).",
      "Or download yt-dlp_linux from the yt-dlp page and put it in Miteiru's tools folder, named yt-dlp."
    ];
  }
  return ["Download yt-dlp.exe and put it in Miteiru's tools folder."];
};

/** What to do about FFmpeg on each OS. */
export const ffmpegSetupHint = (platform: string): string => (
  platform === "darwin"
    ? "On a Mac, open Terminal and run: brew install ffmpeg"
    : "Download FFmpeg from ffmpeg.org and put ffmpeg and ffprobe in Miteiru's tools folder."
);

export type ToolStatusMap = Record<string, { available: boolean; isInternal?: boolean } | undefined>;

export type CapabilityRow = {
  id: "youtube" | "inside-files";
  title: string;
  needs: string;
  found: boolean;
  /** The tool whose download link the "Get it" button opens. */
  getTool: "yt-dlp" | "ffmpeg";
};

/** One row per thing the learner can do, with whether the tool it needs was found. */
export const capabilityRows = (details: ToolStatusMap | undefined): CapabilityRow[] => [
  {
    id: "youtube",
    title: "YouTube captions",
    needs: "needs yt-dlp",
    found: Boolean(details?.["yt-dlp"]?.available),
    getTool: "yt-dlp"
  },
  {
    id: "inside-files",
    title: "Subtitles inside MP4 and other non-MKV files",
    needs: "needs FFmpeg",
    found: Boolean(details?.ffmpeg?.available && details?.ffprobe?.available),
    getTool: "ffmpeg"
  }
];

export const TOOLS_WITHOUT_NOTE = "Videos with separate subtitle files work without these.";
