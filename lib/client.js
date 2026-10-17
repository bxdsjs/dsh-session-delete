window.__ModuleLoader__.load({
	id: "dsh-session-delete",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom_client = require("react-dom/client");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/client/styles.ts
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
`;
		/** Inject the stylesheet once; the tag id doubles as the re-evaluation guard. */
		function ensureStyles() {
			if (typeof document === "undefined") return;
			if (document.querySelector('style[data-plugin="dsh-session-delete"]') !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-session-delete";
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region src/client/locales.ts
		/** Copy dictionaries for the permanent-delete actions. */
		/** Simplified Chinese dictionary and key source of truth. */
		const zh = {
			"menu.delete": "永久删除会话",
			"header.purge": "清空已归档会话",
			"confirm.title": "永久删除这个会话？",
			"confirm.desc": "「{title}」将从磁盘上被彻底删除，与归档不同，无法恢复。",
			"confirm.untitled": "未命名会话",
			"confirm.note": "会一起删除：会话日志目录、投影缓存、检索索引行、以及工作区里的归档/置顶记录。此操作不可撤销，也没有回收站。",
			"confirm.action": "永久删除",
			"confirm.pending": "正在删除…",
			"confirm.error": "删除失败：{message}",
			"bulk.title": "清空已归档会话",
			"bulk.desc": "下面是「未分组」里全部已归档的会话，默认全选。勾选的会被永久删除，无法恢复。",
			"bulk.loading": "正在读取已归档会话…",
			"bulk.empty": "未分组里没有已归档的会话。",
			"bulk.selectAll": "全选",
			"bulk.count": "已选 {selected} / {total}",
			"bulk.action": "永久删除选中（{count}）",
			"bulk.pending": "正在删除 {count} 个…",
			"bulk.done": "已永久删除 {count} 个会话。",
			"bulk.partial": "已删除 {count} 个，{failed} 个失败：{message}",
			"bulk.error": "读取失败：{message}",
			"bulk.untitled": "未命名会话",
			cancel: "取消",
			close: "关闭"
		};
		/** English dictionary checked against the Chinese key set. */
		const en = {
			"menu.delete": "Delete permanently",
			"header.purge": "Clear archived sessions",
			"confirm.title": "Delete this session permanently?",
			"confirm.desc": "“{title}” will be erased from disk. Unlike archiving, this cannot be undone.",
			"confirm.untitled": "Untitled session",
			"confirm.note": "This removes the session log directory, its projection cache, its search-index rows, and the archive/pin records that mention it. There is no trash and no undo.",
			"confirm.action": "Delete permanently",
			"confirm.pending": "Deleting…",
			"confirm.error": "Delete failed: {message}",
			"bulk.title": "Clear archived sessions",
			"bulk.desc": "Every archived session in Ungrouped is listed below and selected by default. What stays selected is erased for good.",
			"bulk.loading": "Reading archived sessions…",
			"bulk.empty": "No archived sessions in Ungrouped.",
			"bulk.selectAll": "Select all",
			"bulk.count": "{selected} of {total} selected",
			"bulk.action": "Delete {count} selected",
			"bulk.pending": "Deleting {count}…",
			"bulk.done": "Permanently deleted {count} session(s).",
			"bulk.partial": "Deleted {count}; {failed} failed: {message}",
			"bulk.error": "Could not read the list: {message}",
			"bulk.untitled": "Untitled session",
			cancel: "Cancel",
			close: "Close"
		};
		//#endregion
		//#region src/client/controller.ts
		/** Locale namespace owned by this package. */
		const NS = "session-delete";
		/** Private RPC channel shared with the host half. */
		const RPC_CHANNEL = "/dsh-session-delete";
		/** Human-readable error text. */
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/** Last path segment of a working directory, for the list's meta line. */
		function baseName(path) {
			if (typeof path !== "string" || path.length === 0) return "";
			const parts = path.split(/[\\/]+/).filter((part) => part.length > 0);
			return parts.length === 0 ? "" : parts[parts.length - 1];
		}
		/**
		* Bind the permanent-delete behavior to the calling plugin's context.
		* @param ctx - the browser plugin context (connection injected).
		* @returns the face whose pieces the slot entries inject.
		*/
		function createDeleteController(ctx) {
			const connection = ctx.get("connection");
			let pending = null;
			let bulk = false;
			const listeners = /* @__PURE__ */ new Set();
			const subscribe = (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			};
			const hooks = {
				pending: {
					getSnapshot: () => pending,
					subscribe
				},
				bulk: {
					getSnapshot: () => bulk,
					subscribe
				}
			};
			/** Notify every mounted reader of the dialog state. */
			function publish() {
				for (const listener of listeners) listener();
			}
			function requestDelete(request) {
				pending = request;
				publish();
			}
			function settleDelete() {
				pending = null;
				publish();
			}
			function openBulk() {
				bulk = true;
				publish();
			}
			function closeBulk() {
				bulk = false;
				publish();
			}
			async function call(endpoint, payload) {
				const result = await connection.rpc.call(RPC_CHANNEL, endpoint, payload);
				if (!result.ok) throw new Error(result.error.message);
				return result.value;
			}
			return { face: () => ({
				hooks,
				requestDelete,
				settleDelete,
				openBulk,
				closeBulk,
				deleteSession: (sessionId) => call("delete", { sessionId }),
				listArchived: () => call("list-archived-ungrouped", {}),
				purgeArchived: (sessionIds) => call("purge-archived-ungrouped", { sessionIds })
			}) };
		}
		//#endregion
		//#region src/client/HeaderAction.tsx
		/**
		* The「未分组」group-header action.
		*
		* The sidebar publishes no slot for a group header — `sidebar.workspaces` only
		* exposes session-row seats — so the shipped row markup is the anchor: a
		* `[data-row-key^="workspace:"][role="treeitem"]` whose trailing `.rowActions`
		* container ends with the「新建会话」`<button>`. This module mounts one more
		* button **in front of** that one and reuses the native button's own
		* `className` string, so geometry, hover, focus ring and the row's
		* hover-only reveal all match without copying any pixel value.
		*
		* React owns the inserted subtree through its own root, so the sidebar's
		* reconciler never sees it; the host element is a plain `<span>` this module
		* creates, inserts, and removes itself.
		*/
		/** Locale namespace owned by ui-workspace; only `group.ungrouped` is read. */
		const OWNER_NS = "workspace";
		/** Attribute marking the inserted host, so re-mounting is idempotent. */
		const HOST_ATTR = "data-dsh-session-delete-header";
		/** Debounce for the DOM watcher. */
		const WATCH_DEBOUNCE_MS = 180;
		/** Minimum gap between archive-set RPC refreshes driven by DOM churn. */
		const REFRESH_MIN_MS = 3000;
		/**
		* One native-styled header button.
		* @param props.className - the sibling「新建会话」button's own className.
		* @param props.label - localized tooltip and accessible name.
		* @param props.onSelect - opens the cleanup dialog.
		*/
		function HeaderActionButton(props) {
			const { className, label, onSelect } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
				label,
				side: "bottom",
				align: "end",
				delayMs: 500,
				portal: true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className,
					"aria-label": label,
					onClick: (event) => {
						// The row's own onClick toggles the group; a header action must not.
						event.stopPropagation();
						event.preventDefault();
						onSelect();
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutlineRegular, { size: 14 })
				})
			});
		}
		/**
		* Read the localized「未分组」label from the owning namespace, falling back to
		* the known dictionary spellings when the namespace is not mounted.
		* @param ctx - plugin context.
		* @returns the label, or undefined when it cannot be resolved.
		*/
		function ungroupedLabel(ctx) {
			try {
				const value = ctx.locale.bind(OWNER_NS)("group.ungrouped");
				if (typeof value === "string" && value.length > 0 && value !== "group.ungrouped") return value;
			} catch {}
			return void 0;
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
		function findAnchor(label) {
			const rows = Array.from(document.querySelectorAll('[data-row-key^="workspace:"][role="treeitem"]'));
			const ordered = label === void 0 ? rows : [...rows.filter((row) => (row.textContent ?? "").includes(label)), ...rows.filter((row) => (row.textContent ?? "").includes(label) === false)];
			for (const row of ordered) {
				const buttons = Array.from(row.querySelectorAll("button"));
				if (buttons.length === 0) continue;
				if (label !== void 0) {
					const labelled = buttons.filter((button) => (button.getAttribute("aria-label") ?? "").includes(label));
					if (labelled.length > 0) return {
						button: labelled[labelled.length - 1],
						row
					};
					const titled = (row.textContent ?? "").includes(label);
					if (titled) return {
						button: buttons[buttons.length - 1],
						row
					};
					continue;
				}
				// No label to match on: the ungrouped bucket is the only workspace row
				// without an actions ("...") menu, so it owns exactly one button.
				if (buttons.length === 1) return {
					button: buttons[0],
					row
				};
			}
			return null;
		}
		/**
		* Keep one native-styled「清空已归档」button in front of the ungrouped group's
		* create button, present only while the archive set is non-empty.
		* @param ctx - plugin context (locale face).
		* @param face - the delete controller face.
		* @returns a disposer removing the button and the watcher.
		*/
		function installHeaderAction(ctx, face) {
			if (typeof document === "undefined") return () => {};
			const t = ctx.locale.bind("session-delete");
			let host = null;
			let root = null;
			let timer = null;
			let stopped = false;
			let hasAny = false;
			let refreshing = false;
			let lastRefresh = 0;
			/** Mount the button in front of the create button, once. */
			function mount() {
				if (stopped || host !== null) return;
				const anchor = findAnchor(ungroupedLabel(ctx));
				if (anchor === null) return;
				const { button } = anchor;
				const className = button.className;
				const target = button.parentElement ?? anchor.row;
				host = document.createElement("span");
				host.setAttribute(HOST_ATTR, "");
				host.className = "dsh-session-delete-headerAction";
				target.insertBefore(host, button);
				root = (0, react_dom_client.createRoot)(host);
				root.render(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(HeaderActionButton, {
					className,
					label: t("header.purge"),
					onSelect: () => face.openBulk()
				}));
			}
			/** Remove the button and tear its React root down. */
			function unmount() {
				const current = root;
				const node = host;
				root = null;
				host = null;
				if (current !== null) {
					try {
						current.unmount();
					} catch {}
				}
				node?.remove();
			}
			/** Reconcile presence with the archive set. */
			async function refresh() {
				if (stopped || refreshing) return;
				refreshing = true;
				lastRefresh = Date.now();
				try {
					const listed = await face.listArchived();
					hasAny = (listed?.total ?? 0) > 0;
				} catch {
					hasAny = false;
				} finally {
					refreshing = false;
				}
				if (stopped) return;
				if (hasAny) mount();
				else unmount();
			}
			/**
			* Refresh at most once per {@link REFRESH_MIN_MS}: the sidebar mutates
			* constantly and each probe is a host round trip that reads every archived
			* projection cache row.
			*/
			function maybeRefresh() {
				if (Date.now() - lastRefresh < REFRESH_MIN_MS) return;
				refresh();
			}
			/** Debounced DOM reconciliation: re-insert after a sidebar re-render. */
			function reconcile() {
				if (stopped) return;
				if (host !== null && host.isConnected === false) {
					unmount();
					hasAny = true;
				}
				if (hasAny) mount();
				maybeRefresh();
			}
			function schedule() {
				if (stopped) return;
				if (timer !== null) clearTimeout(timer);
				timer = setTimeout(() => {
					timer = null;
					reconcile();
				}, WATCH_DEBOUNCE_MS);
			}
			const observer = new MutationObserver(schedule);
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			const onVisibility = () => {
				refresh();
			};
			document.addEventListener("visibilitychange", onVisibility);
			refresh();
			return () => {
				stopped = true;
				if (timer !== null) clearTimeout(timer);
				observer.disconnect();
				document.removeEventListener("visibilitychange", onVisibility);
				unmount();
			};
		}
		//#endregion
		//#region src/client/MenuItem.tsx
		/**
		* Menu row (order 500): permanently delete the Session this menu belongs to.
		* Only 未分组 Sessions — a Session the registry still accounts for a workspace
		* is not 未分组, and hiding the row keeps the action honest.
		* @param props - owner share, the injected request, the menu open state, the
		*   workspace projection, and the locale copy.
		* @returns the row, or null when the Session is grouped.
		*/
		function DeleteSessionMenuItem(props) {
			const { sessionId, displayTitle, useWorkspaces, useMenuOpenState, requestDelete, t } = props;
			const [, setMenuOpen] = useMenuOpenState();
			const grouped = useWorkspaces((snapshot) => (snapshot?.items ?? []).some((item) => item.sessionIds.includes(sessionId)));
			if (grouped) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MenuItemButton, {
				separatorBefore: true,
				danger: true,
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconTrashOutlineRegular, { size: 14 }),
				onSelect: () => {
					setMenuOpen(false);
					requestDelete({
						sessionId,
						displayTitle
					});
				},
				children: t("menu.delete")
			});
		}
		//#endregion
		//#region src/client/ConfirmDialog.tsx
		/**
		* The `shell.overlay` entry for one Session: nothing while no request is
		* pending, otherwise one dialog keyed by the Session so in-flight and error
		* state die with it.
		* @param props - the pending-request hook, the settle and delete hops, and the
		*   locale copy.
		* @returns the open dialog, or null.
		*/
		function SessionDeleteConfirmDialog(props) {
			const { usePending, settleDelete, deleteSession, t } = props;
			const request = usePending((value) => value);
			if (request === null) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DeleteConfirmForm, {
				request,
				settleDelete,
				deleteSession,
				t
			}, request.sessionId);
		}
		/** One request's dialog: in-flight and error state are local to it. */
		function DeleteConfirmForm(props) {
			const { request, settleDelete, deleteSession, t } = props;
			const [deleting, setDeleting] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const close = () => {
				if (deleting) return;
				settleDelete();
			};
			const confirm = () => {
				setDeleting(true);
				setError(null);
				deleteSession(request.sessionId).then(() => {
					setDeleting(false);
					settleDelete();
				}).catch((reason) => {
					setDeleting(false);
					setError(messageOf(reason));
				});
			};
			const title = request.displayTitle === "" ? t("confirm.untitled") : request.displayTitle;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: close,
				closeLabel: t("close"),
				title: t("confirm.title"),
				description: t("confirm.desc", { title }),
				footer: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: { display: "contents" },
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						disabled: deleting,
						onClick: close,
						children: t("cancel")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "primary",
						className: "dsh-session-delete-danger",
						disabled: deleting,
						onClick: confirm,
						children: deleting ? t("confirm.pending") : t("confirm.action")
					})]
				}),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-session-delete-note",
					children: t("confirm.note")
				}), error === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-session-delete-error",
					role: "alert",
					children: t("confirm.error", { message: error })
				})]
			});
		}
		//#endregion
		//#region src/client/BulkDialog.tsx
		/**
		* The `shell.overlay` entry for the bulk cleanup: nothing while closed,
		* otherwise the archived list with everything selected.
		* @param props - the bulk-open hook, the bulk hops, and the locale copy.
		* @returns the open dialog, or null.
		*/
		function BulkPurgeDialog(props) {
			const { useBulk, listArchived, purgeArchived, closeBulk, t } = props;
			const open = useBulk((value) => value);
			if (!open) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BulkPurgeForm, {
				listArchived,
				purgeArchived,
				closeBulk,
				t
			});
		}
		/** One open bulk dialog: its list, selection and outcome are local to it. */
		function BulkPurgeForm(props) {
			const { listArchived, purgeArchived, closeBulk, t } = props;
			const [items, setItems] = (0, react.useState)(null);
			const [selected, setSelected] = (0, react.useState)([]);
			const [busy, setBusy] = (0, react.useState)(false);
			const [loadError, setLoadError] = (0, react.useState)(null);
			const [outcome, setOutcome] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				let alive = true;
				listArchived().then((value) => {
					if (!alive) return;
					setItems(value.items);
					setSelected(value.items.map((item) => item.sessionId));
				}).catch((reason) => {
					if (!alive) return;
					setItems([]);
					setLoadError(messageOf(reason));
				});
				return () => {
					alive = false;
				};
			}, [listArchived]);
			const close = () => {
				if (busy) return;
				closeBulk();
			};
			const toggle = (sessionId) => {
				setSelected((current) => current.includes(sessionId) ? current.filter((id) => id !== sessionId) : [...current, sessionId]);
			};
			const count = items === null ? 0 : items.length;
			const allSelected = count > 0 && selected.length === count;
			const toggleAll = () => {
				setSelected(allSelected ? [] : (items ?? []).map((item) => item.sessionId));
			};
			const confirm = () => {
				if (selected.length === 0) return;
				setBusy(true);
				setOutcome(null);
				purgeArchived(selected).then((value) => {
					setBusy(false);
					setOutcome({
						count: value.deleted.length,
						failed: value.failed.length,
						message: value.failed.length === 0 ? "" : value.failed[0].message
					});
				}).catch((reason) => {
					setBusy(false);
					setLoadError(messageOf(reason));
				});
			};
			const footer = outcome === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: { display: "contents" },
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "outline",
					disabled: busy,
					onClick: close,
					children: t("cancel")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
					variant: "primary",
					className: "dsh-session-delete-danger",
					disabled: busy || selected.length === 0,
					onClick: confirm,
					children: busy ? t("bulk.pending", { count: selected.length }) : t("bulk.action", { count: selected.length })
				})]
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
				variant: "primary",
				onClick: close,
				children: t("close")
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose: close,
				closeLabel: t("close"),
				title: t("bulk.title"),
				description: t("bulk.desc"),
				className: "dsh-session-delete-bulkDialog",
				footer,
				children: [
					items === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-session-delete-note",
						children: t("bulk.loading")
					}) : count === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-session-delete-note",
						children: t("bulk.empty")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "dsh-session-delete-bulk",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-session-delete-bulkBar",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "dsh-session-delete-bulkAll",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: allSelected,
									disabled: busy,
									onChange: toggleAll
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("bulk.selectAll") })]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "dsh-session-delete-bulkCount",
								children: t("bulk.count", {
									selected: selected.length,
									total: count
								})
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-session-delete-bulkList",
							children: items.map((item) => {
								const title = item.title === "" ? t("bulk.untitled") : item.title;
								const meta = baseName(item.cwd);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: "dsh-session-delete-bulkRow",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: selected.includes(item.sessionId),
										disabled: busy,
										onChange: () => toggle(item.sessionId)
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "dsh-session-delete-bulkText",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-session-delete-bulkTitle",
											children: title
										}), meta === "" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "dsh-session-delete-bulkMeta",
											children: meta
										})]
									})]
								}, item.sessionId);
							})
						})]
					}),
					loadError === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-session-delete-error",
						role: "alert",
						children: t("bulk.error", { message: loadError })
					}),
					outcome === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "dsh-session-delete-outcome",
						role: "status",
						children: outcome.failed === 0 ? t("bulk.done", { count: outcome.count }) : t("bulk.partial", {
							count: outcome.count,
							failed: outcome.failed,
							message: outcome.message
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.tsx
		/**
		* Services required by the registrations and the controller.
		* `slots` and `locale` are always present; `connection` carries the RPC.
		*/
		const inject = [
			"slots",
			"locale",
			"connection"
		];
		/**
		* Register the menu row and the dialogs, and mount the group-header action.
		* @param ctx - the browser plugin context.
		*/
		function apply(ctx) {
			ensureStyles();
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-session-delete: dictionaries");
			const controller = createDeleteController(ctx);
			ctx.slots.inject("sidebar.workspaces.session.menu.item", () => ctx.slots.register({
				name: "sidebar.workspaces.session.menu.item",
				id: "session-delete",
				order: 500,
				locale: NS,
				inject: () => ({ requestDelete: controller.face().requestDelete })
			}, DeleteSessionMenuItem));
			// The bulk action lives in the「未分组」group header, beside the native
			// 新建会话 button and styled with its own className; see HeaderAction.tsx.
			ctx.effect(() => installHeaderAction(ctx, controller.face()), "dsh-session-delete: ungrouped header action");
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "session-delete.confirm",
				locale: NS,
				inject: () => {
					const face = controller.face();
					return {
						hooks: face.hooks,
						settleDelete: face.settleDelete,
						deleteSession: face.deleteSession
					};
				}
			}, SessionDeleteConfirmDialog));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "session-delete.bulk",
				locale: NS,
				inject: () => {
					const face = controller.face();
					return {
						hooks: face.hooks,
						listArchived: face.listArchived,
						purgeArchived: face.purgeArchived,
						closeBulk: face.closeBulk
					};
				}
			}, BulkPurgeDialog));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
