/**
 * Stylesheet for the permanent-delete dialogs. One hand-written stylesheet
 * injected as a single <style data-plugin> tag (the loader convention for
 * plugin-owned styles); colors come from the shared --dsw-* tokens.
 */

const CSS = `
/* The header host is a bare inline wrapper: the inserted button keeps the
   native className, so it must not inherit any layout of its own. */
.dsh-session-delete-headerAction {
  display: inline-flex;
  align-items: center;
}

.dsh-session-delete-danger {
  border-color: var(--dsw-alias-state-error-primary);
  background: var(--dsw-alias-state-error-primary);
}

.dsh-session-delete-danger:hover:not(:disabled) {
  filter: brightness(0.94);
}

.dsh-session-delete-note {
  margin: 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-tertiary);
}

.dsh-session-delete-error {
  margin: 8px 0 0;
  border: 1px solid var(--dsw-alias-state-error-primary);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--dsw-alias-state-error-primary);
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}

.dsh-session-delete-outcome {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
}

.dsh-session-delete-bulkDialog {
  width: min(560px, 92vw);
}

.dsh-session-delete-bulk {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.dsh-session-delete-bulkBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dsh-session-delete-bulkAll {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.dsh-session-delete-bulkAll input,
.dsh-session-delete-bulkRow input {
  accent-color: var(--dsw-alias-state-error-primary);
}

.dsh-session-delete-bulkCount {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
}

.dsh-session-delete-bulkList {
  display: flex;
  flex-direction: column;
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
}

.dsh-session-delete-bulkRow {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
}

.dsh-session-delete-bulkRow:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.dsh-session-delete-bulkRow input {
  margin: 3px 0 0;
  flex: none;
}

.dsh-session-delete-bulkText {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.dsh-session-delete-bulkTitle {
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  line-height: 18px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dsh-session-delete-bulkMeta {
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
  text-overflow: ellipsis;
}
`

/** Inject the stylesheet once; the tag id doubles as the re-evaluation guard. */
export function ensureStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector('style[data-plugin="dsh-session-delete"]') !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-session-delete'
  tag.textContent = CSS
  document.head.appendChild(tag)
}
