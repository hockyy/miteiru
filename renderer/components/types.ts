export interface LearningStateType {
  level: number;
  updTime: number;
}

export interface LearningStateMapType {
  [key: string]: LearningStateType | number;
}
