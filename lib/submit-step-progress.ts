export function submitStepProgress(currentStep: number): number {
  return (Math.min(4, Math.max(1, currentStep)) - 1) / 3
}
