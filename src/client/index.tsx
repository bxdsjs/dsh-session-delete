/**
 * dsh-session-delete client half: two rows in one Session's "..." menu plus
 * the dialogs they open.
 *
 * - `永久删除会话` removes the one Session the menu belongs to. Visible only for
 *   Sessions that belong to no workspace (未分组).
 * - `清空未分组的已归档会话…` opens a list of every archived Session that
 *   belongs to no workspace, pre-selected, so clearing the whole set is one
 *   confirmation away.
 *
 * Why dialogs instead of immediate actions: the host half unlinks the durable
 * log, so there is nothing to undo. Both rows only *request* the deletion; a
 * `shell.overlay` occupant renders the dialog and only its confirm button calls
 * the host RPC.
 *
 * @module dsh-session-delete/client
 */

import { jsx, jsxs } from 'react/jsx-runtime'
import { useEffect, useState } from 'react'
import {
  Button, IconTrashOutlineRegular, MenuItemButton, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { en, zh } from './locales.js'
import { installHeaderAction } from './HeaderAction.js'
import { ensureStyles } from './styles.js'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'session-delete': keyof typeof zh
  }
}

/** Locale namespace owned by this package. */
const NS = 'session-delete'

/** Private RPC channel shared with the host half. */
const RPC_CHANNEL = '/dsh-session-delete'

/** Human-readable error text. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Last path segment of a working directory, for the list's meta line. */
function baseName(path: unknown): string {
  if (typeof path !== 'string' || path.length === 0) return ''
  const parts = path.split(/[\\/]+/).filter((part) => part.length > 0)
  return parts.length === 0 ? '' : parts[parts.length - 1]
}

/** One pending permanent-delete request. */
interface DeleteRequest {
  readonly sessionId: string
  readonly displayTitle: string
}

/** One archived ungrouped Session as the host reports it. */
interface ArchivedRow {
  readonly sessionId: string
  readonly title: string
  readonly cwd: string
  readonly createdAt: number
  readonly present: boolean
}

/** The injected behavior face shared by the rows and the dialogs. */
interface DeleteControllerFace {
  readonly hooks: {
    readonly pending: { getSnapshot: () => DeleteRequest | null; subscribe: (listener: () => void) => () => void }
    readonly bulk: { getSnapshot: () => boolean; subscribe: (listener: () => void) => () => void }
  }
  readonly requestDelete: (request: DeleteRequest) => void
  readonly settleDelete: () => void
  readonly openBulk: () => void
  readonly closeBulk: () => void
  readonly deleteSession: (sessionId: string) => Promise<unknown>
  readonly listArchived: () => Promise<{ items: readonly ArchivedRow[]; total: number }>
  readonly purgeArchived: (sessionIds: readonly string[]) => Promise<{
    deleted: readonly { sessionId: string }[]
    failed: readonly { sessionId: string; message: string }[]
  }>
}

/**
 * Bind the permanent-delete behavior to the calling plugin's context.
 * @param ctx - the browser plugin context (connection injected).
 * @returns the face whose pieces the slot entries inject.
 */
function createDeleteController(ctx: any): { face: () => DeleteControllerFace } {
  const connection = ctx.get('connection')
  let pending: DeleteRequest | null = null
  let bulk = false
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const hooks = {
    pending: { getSnapshot: () => pending, subscribe },
    bulk: { getSnapshot: () => bulk, subscribe },
  }
  /** Notify every mounted reader of the dialog state. */
  function publish(): void {
    for (const listener of listeners) listener()
  }
  function requestDelete(request: DeleteRequest): void {
    pending = request
    publish()
  }
  function settleDelete(): void {
    pending = null
    publish()
  }
  function openBulk(): void {
    bulk = true
    publish()
  }
  function closeBulk(): void {
    bulk = false
    publish()
  }
  async function call(endpoint: string, payload: unknown): Promise<any> {
    const result = await connection.rpc.call(RPC_CHANNEL, endpoint, payload) as
      { ok: true; value: any } | { ok: false; error: { message: string } }
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  return {
    face: () => ({
      hooks,
      requestDelete,
      settleDelete,
      openBulk,
      closeBulk,
      deleteSession: (sessionId: string) => call('delete', { sessionId }),
      listArchived: () => call('list-archived-ungrouped', {}),
      purgeArchived: (sessionIds: readonly string[]) => call('purge-archived-ungrouped', { sessionIds }),
    }),
  }
}

/**
 * Menu row (order 500): permanently delete the Session this menu belongs to.
 * Only 未分组 Sessions — a Session the registry still accounts for a workspace
 * is not 未分组, and hiding the row keeps the action honest.
 * @param props - owner share, the injected request, the menu open state, the
 *   workspace projection, and the locale copy.
 * @returns the row, or null when the Session is grouped.
 */
function DeleteSessionMenuItem(props: any) {  const { sessionId, displayTitle, useWorkspaces, useMenuOpenState, requestDelete, t } = props
  const [, setMenuOpen] = useMenuOpenState()
  const grouped = useWorkspaces((snapshot: any) =>
    (snapshot?.items ?? []).some((item: any) => item.sessionIds.includes(sessionId)))
  if (grouped) return null
  return jsx(MenuItemButton, {
    separatorBefore: true,
    danger: true,
    icon: jsx(IconTrashOutlineRegular, { size: 14 }),
    onSelect: () => {
      setMenuOpen(false)
      requestDelete({ sessionId, displayTitle })
    },
    children: t('menu.delete'),
  })
}

/**
 * The `shell.overlay` entry for one Session: nothing while no request is
 * pending, otherwise one dialog keyed by the Session so in-flight and error
 * state die with it.
 * @param props - the pending-request hook, the settle and delete hops, and the
 *   locale copy.
 * @returns the open dialog, or null.
 */
function SessionDeleteConfirmDialog(props: any) {
  const { usePending, settleDelete, deleteSession, t } = props
  const request = usePending((value: DeleteRequest | null) => value)
  if (request === null) return null
  return jsx(DeleteConfirmForm, {
    request,
    settleDelete,
    deleteSession,
    t,
  }, request.sessionId)
}

/** One request's dialog: in-flight and error state are local to it. */
function DeleteConfirmForm(props: any) {
  const { request, settleDelete, deleteSession, t } = props
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = (): void => {
    if (deleting) return
    settleDelete()
  }
  const confirm = (): void => {
    setDeleting(true)
    setError(null)
    deleteSession(request.sessionId).then(() => {
      setDeleting(false)
      settleDelete()
    }).catch((reason: unknown) => {
      setDeleting(false)
      setError(messageOf(reason))
    })
  }
  const title = request.displayTitle === '' ? t('confirm.untitled') : request.displayTitle
  return jsxs(Modal, {
    open: true,
    onClose: close,
    closeLabel: t('close'),
    title: t('confirm.title'),
    description: t('confirm.desc', { title }),
    footer: jsxs('div', {
      style: { display: 'contents' },
      children: [
        jsx(Button, {
          variant: 'outline',
          disabled: deleting,
          onClick: close,
          children: t('cancel'),
        }),
        jsx(Button, {
          variant: 'primary',
          className: 'dsh-session-delete-danger',
          disabled: deleting,
          onClick: confirm,
          children: deleting ? t('confirm.pending') : t('confirm.action'),
        }),
      ],
    }),
    children: [
      jsx('p', { className: 'dsh-session-delete-note', children: t('confirm.note') }),
      error === null ? null : jsx('p', {
        className: 'dsh-session-delete-error',
        role: 'alert',
        children: t('confirm.error', { message: error }),
      }),
    ],
  })
}

/**
 * The `shell.overlay` entry for the bulk cleanup: nothing while closed,
 * otherwise the archived list with everything selected.
 * @param props - the bulk-open hook, the bulk hops, and the locale copy.
 * @returns the open dialog, or null.
 */
function BulkPurgeDialog(props: any) {
  const { useBulk, listArchived, purgeArchived, closeBulk, t } = props
  const open = useBulk((value: boolean) => value)
  if (!open) return null
  return jsx(BulkPurgeForm, { listArchived, purgeArchived, closeBulk, t })
}

/** One open bulk dialog: its list, selection and outcome are local to it. */
function BulkPurgeForm(props: any) {
  const { listArchived, purgeArchived, closeBulk, t } = props
  const [items, setItems] = useState<readonly ArchivedRow[] | null>(null)
  const [selected, setSelected] = useState<readonly string[]>([])
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<{ count: number; failed: number; message: string } | null>(null)
  useEffect(() => {
    let alive = true
    listArchived().then((value: { items: readonly ArchivedRow[] }) => {
      if (!alive) return
      setItems(value.items)
      setSelected(value.items.map((item) => item.sessionId))
    }).catch((reason: unknown) => {
      if (!alive) return
      setItems([])
      setLoadError(messageOf(reason))
    })
    return () => {
      alive = false
    }
  }, [listArchived])
  const close = (): void => {
    if (busy) return
    closeBulk()
  }
  const toggle = (sessionId: string): void => {
    setSelected((current) => current.includes(sessionId)
      ? current.filter((id) => id !== sessionId)
      : [...current, sessionId])
  }
  const count = items === null ? 0 : items.length
  const allSelected = count > 0 && selected.length === count
  const toggleAll = (): void => {
    setSelected(allSelected ? [] : (items ?? []).map((item) => item.sessionId))
  }
  const confirm = (): void => {
    if (selected.length === 0) return
    setBusy(true)
    setOutcome(null)
    purgeArchived(selected)
      .then((value) => {
        setBusy(false)
        setOutcome({
          count: value.deleted.length,
          failed: value.failed.length,
          message: value.failed.length === 0 ? '' : value.failed[0].message,
        })
      })
      .catch((reason: unknown) => {
        setBusy(false)
        setLoadError(messageOf(reason))
      })
  }
  const footer = outcome === null
    ? jsxs('div', {
      style: { display: 'contents' },
      children: [
        jsx(Button, { variant: 'outline', disabled: busy, onClick: close, children: t('cancel') }),
        jsx(Button, {
          variant: 'primary',
          className: 'dsh-session-delete-danger',
          disabled: busy || selected.length === 0,
          onClick: confirm,
          children: busy
            ? t('bulk.pending', { count: selected.length })
            : t('bulk.action', { count: selected.length }),
        }),
      ],
    })
    : jsx(Button, { variant: 'primary', onClick: close, children: t('close') })
  return jsxs(Modal, {
    open: true,
    onClose: close,
    closeLabel: t('close'),
    title: t('bulk.title'),
    description: t('bulk.desc'),
    className: 'dsh-session-delete-bulkDialog',
    footer,
    children: [
      items === null
        ? jsx('p', { className: 'dsh-session-delete-note', children: t('bulk.loading') })
        : count === 0
          ? jsx('p', { className: 'dsh-session-delete-note', children: t('bulk.empty') })
          : jsxs('div', {
            className: 'dsh-session-delete-bulk',
            children: [
              jsxs('div', {
                className: 'dsh-session-delete-bulkBar',
                children: [
                  jsxs('label', {
                    className: 'dsh-session-delete-bulkAll',
                    children: [
                      jsx('input', {
                        type: 'checkbox',
                        checked: allSelected,
                        disabled: busy,
                        onChange: toggleAll,
                      }),
                      jsx('span', { children: t('bulk.selectAll') }),
                    ],
                  }),
                  jsx('span', {
                    className: 'dsh-session-delete-bulkCount',
                    children: t('bulk.count', { selected: selected.length, total: count }),
                  }),
                ],
              }),
              jsx('div', {
                className: 'dsh-session-delete-bulkList',
                children: items.map((item) => {
                  const title = item.title === '' ? t('bulk.untitled') : item.title
                  const meta = baseName(item.cwd)
                  return jsxs('label', {
                    className: 'dsh-session-delete-bulkRow',
                    children: [
                      jsx('input', {
                        type: 'checkbox',
                        checked: selected.includes(item.sessionId),
                        disabled: busy,
                        onChange: () => toggle(item.sessionId),
                      }),
                      jsxs('span', {
                        className: 'dsh-session-delete-bulkText',
                        children: [
                          jsx('span', { className: 'dsh-session-delete-bulkTitle', children: title }),
                          meta === '' ? null : jsx('span', {
                            className: 'dsh-session-delete-bulkMeta',
                            children: meta,
                          }),
                        ],
                      }),
                    ],
                  })
                }),
              }),
            ],
          }),
      loadError === null ? null : jsx('p', {
        className: 'dsh-session-delete-error',
        role: 'alert',
        children: t('bulk.error', { message: loadError }),
      }),
      outcome === null ? null : jsx('p', {
        className: 'dsh-session-delete-outcome',
        role: 'status',
        children: outcome.failed === 0
          ? t('bulk.done', { count: outcome.count })
          : t('bulk.partial', { count: outcome.count, failed: outcome.failed, message: outcome.message }),
      }),
    ],
  })
}

/**
 * Services required by the registrations and the controller.
 * `slots` and `locale` are always present; `connection` carries the RPC.
 */
export const inject = ['slots', 'locale', 'connection']

/**
 * Register the menu rows and their dialogs.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: any): void {
  ensureStyles()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-session-delete: dictionaries')
  const controller = createDeleteController(ctx)
  ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
    name: 'sidebar.workspaces.session.menu.item',
    id: 'session-delete',
    order: 500,
    locale: NS,
    inject: () => ({ requestDelete: controller.face().requestDelete }),
  }, DeleteSessionMenuItem))
  // The bulk action lives in the「未分组」group header, beside the native
  // 新建会话 button and styled with its own className; see HeaderAction.tsx.
  ctx.effect(
    () => installHeaderAction(ctx, controller.face()),
    'dsh-session-delete: ungrouped header action',
  )
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'session-delete.confirm',
    locale: NS,
    inject: () => {
      const face = controller.face()
      return { hooks: face.hooks, settleDelete: face.settleDelete, deleteSession: face.deleteSession }
    },
  }, SessionDeleteConfirmDialog))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'session-delete.bulk',
    locale: NS,
    inject: () => {
      const face = controller.face()
      return {
        hooks: face.hooks,
        listArchived: face.listArchived,
        purgeArchived: face.purgeArchived,
        closeBulk: face.closeBulk,
      }
    },
  }, BulkPurgeDialog))
}
