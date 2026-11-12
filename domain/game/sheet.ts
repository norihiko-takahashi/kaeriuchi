import { everDefeated, type ReviewState } from "./review";

/** テストの進み具合とクリア（BR-6-1） */
export function sheetProgress(states: ReviewState[]): {
  defeated: number;
  total: number;
  cleared: boolean;
} {
  const defeated = states.filter(everDefeated).length;
  return {
    defeated,
    total: states.length,
    cleared: states.length > 0 && defeated === states.length,
  };
}
