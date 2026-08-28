import { DEFAULT_CHOICES, MISSION_VERSION, type SimulatorChoices } from "@site/src/data/mission";

export type MissionProgress = { version: number; completed: string[]; choices: SimulatorChoices; predictions: Record<string, string>; capstone: Record<string, string> };
const KEY = "northwind-mission-progress";
export const blankProgress = (): MissionProgress => ({ version: MISSION_VERSION, completed: [], choices: DEFAULT_CHOICES, predictions: {}, capstone: {} });
export function loadProgress(): MissionProgress {
  if (typeof window === "undefined") return blankProgress();
  try { const value = JSON.parse(window.localStorage.getItem(KEY) ?? "null"); return value?.version === MISSION_VERSION ? { ...blankProgress(), ...value } : blankProgress(); } catch { return blankProgress(); }
}
export function saveProgress(progress: MissionProgress) { if (typeof window !== "undefined") window.localStorage.setItem(KEY, JSON.stringify(progress)); }
export function resetProgress() { if (typeof window !== "undefined") window.localStorage.removeItem(KEY); }
