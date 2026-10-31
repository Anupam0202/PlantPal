import { create } from 'zustand';

/** Counts forms with unsaved edits so updates and navigation never discard drafts. */
interface DraftState {
  dirtyCount: number;
  markDirty: () => () => void;
}

export const useDrafts = create<DraftState>((set) => ({
  dirtyCount: 0,
  markDirty: () => {
    set((s) => ({ dirtyCount: s.dirtyCount + 1 }));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      set((s) => ({ dirtyCount: Math.max(0, s.dirtyCount - 1) }));
    };
  },
}));
