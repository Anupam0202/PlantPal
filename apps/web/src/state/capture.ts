import { create } from 'zustand';
import type { CareKind } from '@plantpal/schemas';

export type CaptureMode = CareKind | 'note' | 'harvest' | 'photo';

interface CaptureState {
  open: boolean;
  mode: CaptureMode | null;
  specimenIds: string[];
  openCapture: (preset?: { mode?: CaptureMode; specimenIds?: string[] }) => void;
  close: () => void;
}

/** Quick Capture sheet state, shared by the floating button, the command palette and plant pages. */
export const useCapture = create<CaptureState>((set) => ({
  open: false,
  mode: null,
  specimenIds: [],
  openCapture: (preset) =>
    set({ open: true, mode: preset?.mode ?? null, specimenIds: preset?.specimenIds ?? [] }),
  close: () => set({ open: false }),
}));
