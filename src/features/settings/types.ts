/** Every settings tab reports whether it has unsaved edits, so the page can guard navigation. */
export interface TabProps {
  onDirtyChange: (dirty: boolean) => void;
}
