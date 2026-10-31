import { create } from 'zustand';

/** Where the earlier PlantPal data being reviewed comes from: this browser's storage, or a backup file the user chose. */
interface LegacySourceState {
  fileRaw: Record<string, string> | null;
  fileName: string | null;
  setFile: (raw: Record<string, string>, name: string) => void;
  clearFile: () => void;
}

export const useLegacySource = create<LegacySourceState>((set) => ({
  fileRaw: null,
  fileName: null,
  setFile: (fileRaw, fileName) => set({ fileRaw, fileName }),
  clearFile: () => set({ fileRaw: null, fileName: null }),
}));
