export type GenerateSubtitlesStage =
  | "idle"
  | "converting"
  | "transcribing"
  | "saving"
  | "translating"
  | "done"
  | "error"
  | "cancelled";

export type GenerateSubtitlesProgress = {
  stage: GenerateSubtitlesStage;
  message: string;
  percent?: number;
  current?: number;
  total?: number;
  sourceSrtPath?: string;
  englishSrtPath?: string;
  error?: string;
};

export type GenerateSubtitlesStartRequest = {
  videoPath: string;
  lang: string;
  asrModel: string;
};

export type GenerateSubtitlesTranslateRequest = {
  sourceSrtPath: string;
  lang: string;
  translateModel: string;
};

export type GenerateSubtitlesResult = {
  ok: boolean;
  sourceSrtPath?: string;
  englishSrtPath?: string;
  error?: string;
  cancelled?: boolean;
};
