/**
 * The「未分组」group-header action.
 *
 * The sidebar publishes no slot for a group header — `sidebar.workspaces` only
 * exposes session-row seats — so the shipped row markup is the anchor: a
 * `[data-row-key^="workspace:"][role="treeitem"]` whose trailing `.rowActions`
 * container ends with the「新建会话」`<button>`. This module mounts one more
 * button **in front of** that one and reuses the native button's own
 * `className` string, so geometry, hover, focus ring and the row's
 * hover-only reveal all match without copying any像素 value.
 *
 * React owns the inserted subtree through its own root, so the sidebar's
 * reconciler never sees it; the host element is a plain `<span>` this module
 * creates, inserts, and removes itself.
 */

import { createRoot } from 'react-dom/client'
import { jsx } from 'react/jsx-runtime'
import { IconTrashOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'

/** Locale namespace owned by ui-workspace; only `group.ungrouped` is read. */
const OWNER_NS = 'workspace'

/** Attribute marking the inserted host, so re-mounting is idempotent. */
const HOST_ATTR = 'data-dsh-session-delete-header'

/** Debounce for the DOM watcher. */
const WATCH_DEBOUNCE_MS = 180

/** Minimum gap between archive-set RPC refreshes driven by DOM churn. */
const REFRESH_MIN_MS = 3000

/**
 * One native-styled header button.
 * @param props.className - the sibling「新建会话」button's own className.
 * @param props.label - localized tooltip and accessible name.
 * @param props.onSelect - opens the cleanup dialog.
 */
function HeaderActionButton(props: any) {
  const { className, label, onSelect } = props
  return jsx(Tooltip, {
    label,
    side: 'bottom',
    align: 'end',
    delayMs: 500,
    portal: true,
    children: jsx('button', {
      type: 'button',
      className,
      'aria-label': label,
      onClick: (event: any) => {
        // The row's own onClick toggles the group; a header action must not.
        event.stopPropagation()
        event.preventDefault()
        onSelect()
      },
      children: jsx(IconTrashOutlineRegular, { size: 14 }),
    }),
  })
}

/**
 * Read the localized「未分组」label from the owning namespace, falling back to
 * the known dictionary spellings when the namespace is not mounted.
 * @param ctx - plugin context.
 * @returns the label, or undefined when it cannot be resolved.
 */
function ungroupedLabel(ctx: any): string | undefined {
  try {
    const value = ctx.locale.bind(OWNER_NS)('group.ungrouped')
    if (typeof value === 'string' && value.length > 0 && value !== 'group.ungrouped') return value
  } catch {
    // namespace absent in this composition
  }
  return undefined
}

/**
 * Locate the「新建会话」button of the ungrouped group header.
 *
 * Identification is structural first (the only workspace row whose text carries
 * the ungrouped label) and positional second (the row's last button, because
 * the actions menu — absent on this bucket — precedes the create button).
 * @param label - localized ungrouped label, when known.
 * @returns the button and its row, or null.
 */
function findAnchor(label: string | undefined): { button: HTMLButtonElement; row: HTMLElement } | null {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-row-key^="workspace:"][role="treeitem"]'))
  const ordered = label === undefined
    ? rows
    : [
      ...rows.filter((row) => (row.textContent ?? '').includes(label)),
      ...rows.filter((row) => (row.textContent ?? '').includes(label) === false),
    ]
  for (const row of ordered) {
    const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>('button'))
    if (buttons.length === 0) continue
    if (label !== undefined) {
      const labelled = buttons.filter((button) => (button.getAttribute('aria-label') ?? '').includes(label))
      if (labelled.length > 0) return { button: labelled[labelled.length - 1], row }
      const titled = (row.textContent ?? '').includes(label)
      if (titled) return { button: buttons[buttons.length - 1], row }
      continue
    }
    // No label to match on: the ungrouped bucket is the only workspace row
    // without an actions ("...") menu, so it owns exactly one button.
    if (buttons.length === 1) return { button: buttons[0], row }
  }
  return null
}

/**
 * Keep one native-styled「清空已归档」button in front of the ungrouped group's
 * create button, present only while the archive set is non-empty.
 * @param ctx - plugin context (locale face).
 * @param face - the delete controller face.
 * @returns a disposer removing the button and the watcher.
 */
export function installHeaderAction(ctx: any, face: any): () => void {
  if (typeof document === 'undefined') return () => {}
  const t = ctx.locale.bind('session-delete')
  let host: HTMLSpanElement | null = null
  let root: any = null
  let timer: any = null
  let stopped = false
  let hasAny = false
  let refreshing = false
  let lastRefresh = 0

  /** Mount the button in front of the create button, once. */
  function mount(): void {
    if (stopped || host !== null) return
    const anchor = findAnchor(ungroupedLabel(ctx))
    if (anchor === null) return
    const { button } = anchor
    const className = button.className
    const target = button.parentElement ?? anchor.row
    host = document.createElement('span')
    host.setAttribute(HOST_ATTR, '')
    host.className = 'dsh-session-delete-headerAction'
    target.insertBefore(host, button)
    root = createRoot(host)
    root.render(jsx(HeaderActionButton, {
      className,
      label: t('header.purge'),
      onSelect: () => face.openBulk(),
    }))
  }

  /** Remove the button and tear its React root down. */
  function unmount(): void {
    const current = root
    const node = host
    root = null
    host = null
    if (current !== null) {
      try {
        current.unmount()
      } catch {
        // the host element was replaced by a re-render
      }
    }
    node?.remove()
  }

  /** Reconcile presence with the archive set. */
  async function refresh(): Promise<void> {
    if (stopped || refreshing) return
    refreshing = true
    lastRefresh = Date.now()
    try {
      const listed = await face.listArchived()
      hasAny = (listed?.total ?? 0) > 0
    } catch {
      hasAny = false
    } finally {
      refreshing = false
    }
    if (stopped) return
    if (hasAny) mount()
    else unmount()
  }

  /**
   * Refresh at most once per {@link REFRESH_MIN_MS}: the sidebar mutates
   * constantly and each probe is a host round trip that reads every archived
   * projection cache row.
   */
  function maybeRefresh(): void {
    if (Date.now() - lastRefresh < REFRESH_MIN_MS) return
    void refresh()
  }

  /** Debounced DOM reconciliation: re-insert after a sidebar re-render. */
  function reconcile(): void {
    if (stopped) return
    if (host !== null && host.isConnected === false) {
      unmount()
      hasAny = true
    }
    if (hasAny) mount()
    maybeRefresh()
  }

  function schedule(): void {
    if (stopped) return
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      reconcile()
    }, WATCH_DEBOUNCE_MS)
  }

  const observer = new MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true })
  const onVisibility = (): void => {
    void refresh()
  }
  document.addEventListener('visibilitychange', onVisibility)
  void refresh()

  return () => {
    stopped = true
    if (timer !== null) clearTimeout(timer)
    observer.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    unmount()
  }
}
