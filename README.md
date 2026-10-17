[![CI](https://github.com/bxdsjs/dsh-session-delete/actions/workflows/ci.yml/badge.svg)](https://github.com/bxdsjs/dsh-session-delete/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

[English](./README.en.md)

在 DeepSeek Harness（桌面端 / Web 端）里**永久删除「未分组」会话**的插件。

会话行右侧 `⋯` 菜单里多出一行：

- **永久删除会话** —— 删掉当前这一个会话。

而「未分组」这个分组头里多出一个按钮：

- **清空已归档会话** —— 就在原生 `⊕`（新建会话）左边、原生 `⋯` 所在的位置。
  「未分组」这个桶天生没有 `⋯`（源码里 `actions` 只对真工作区传入），
  所以那个位置正好空着。点它打开列表：列出「未分组」里全部已归档会话，
  **默认全选**，确认即一次性清空。

菜单行与原生行之间有分隔线、红色（破坏性）；组头按钮**直接复用原生 `⊕` 按钮的
`className`**，所以尺寸、hover、焦点环、以及「整行 hover 才浮现」的行为都天然一致。

**不是归档。** 归档只是把一个 id 记进 `archivedSessionIds`，日志还在、检索还能命中、换个筛选条件又看得见；本插件做的是 unlink。

---
**示意图：**
<img width="256" height="256" alt="屏幕截图 2026-10-17 234937" src="https://github.com/user-attachments/assets/82c561b0-c4f7-4517-9dcf-6a0ff476c38e" />
<img width="256" height="256" alt="屏幕截图 2026-10-17 234942" src="https://github.com/user-attachments/assets/1e06e0c3-5cb9-489e-9f53-d62a3cd24059" />
<img width="256" height="256" alt="屏幕截图 2026-10-17 234928" src="https://github.com/user-attachments/assets/3cf8a7a9-808c-44b2-99db-12a590eedb07" />


## 它到底删了什么

对一个会话 id `session-<uuid>`：

| 目标 | 动作 |
| --- | --- |
| `$DSH_HOME/sessions/<编码后的 cwd>/session-<uuid>/` | 递归删除整个目录（`session.v4.jsonl.zstd` 就在里面） |
| `$DSH_HOME/storages/session_projcache/sessions/session-<uuid>.json` | 删除 |
| `$DSH_HOME/storages/session_projcache/sessions/<裸 uuid>.json` | 删除（同一目录里两种文件名都存在，所以两种都试） |
| 全文检索索引 `persisted_docs` / `persisted_sessions` | 删掉该会话的行，并把 `search_state.global_generation` 加一 |
| `$DSH_HOME/storages/workspace.json` | 从 `global.archivedSessionIds`、`global.pinnedSessionIds`、每个 `tables.workspaces[*].sessionIds` 里摘掉这个 id，保持 2 空格缩进 |
| 侧栏 | 向客户端发 `api-session/removed`，那一行立刻消失 |

`$DSH_HOME` = 环境变量 `DSH_HOME`（非空时），否则 `~/.dsh`。

**不动的东西**：`attachments/`（内容寻址，多个会话共享同一个 blob）、
`llm-deepseek/files-v3.json`（按作用域存放）、其他会话的任何文件。

## 检索索引这一块（上一版没做，这版补上了）

先说清事实：`@deepseek-ai/dsh-session-query-sqlite` 在**基础 bundle 里的默认配置是
`path: ':memory:'`、`openAt: never`** —— 也就是全文检索默认没开，也没有落盘文件。
所以多数安装里这一项本来就不存在，删不删都一样。

一旦有人（`@deepseek-ai/dsh-experimental-session-search` 之类的 bundle，或自己写
profile 补丁）把它改成持久的 `path`，索引就是磁盘上的一个 SQLite 库。这版会：

1. 先问 `ctx.sessionQuery` 的服务面要路径（`path` / `dbPath` / `config.path` 等，逐层探三层）；
2. 拿不到就在 `$DSH_HOME` 的 `storages`、`cache`、根目录里按 `.sqlite/.sqlite3/.db/.db3`
   扫，读前 16 字节验 `SQLite format 3\0` 魔数；
3. **打开后先验 schema**：只有同时有 `persisted_sessions` 和 `persisted_docs` 两张表才算命中，
   否则立刻 close —— 绝不碰无关的 SQLite 文件；
4. `DELETE FROM persisted_docs WHERE session_id = ?`、
   `DELETE FROM persisted_sessions WHERE id = ?`，
   再 `UPDATE search_state SET global_generation = global_generation + 1`；
5. 返回值里如实报告 `index.state`：`purged` / `absent`（没有落盘库）/ `unavailable`
   （运行时没有 `node:sqlite`）/ `skipped`（有库但 schema 不符或写入失败）。

驱动是 `node:sqlite`（懒加载 —— 拿不到就只影响这一项，不影响整个插件加载）；
WAL 模式下用第二条连接写是安全的，另加了 `PRAGMA busy_timeout = 2000`。
`:memory:` 的索引直接跳过：它随进程消失，不需要清。

## 「未分组」与「已归档」的判定

宿主侧用 `workspaceRegistry`：任何 workspace 的 `sessionIds` 里出现这个 id 就算已分组。

- 单删：菜单行不渲染，直接调 RPC 也会被拒（`session/not-ungrouped`）。
- 批量清空：目标集在**宿主侧**算，等于 `archivedSessionIds − 已分组`。客户端传上来的
  `sessionIds` 只能在这个集合里**收窄**，不能扩大 —— 所以带 bug 或恶意的客户端也删不到
  分组会话、更删不到未归档会话。

列表里也会出现「注册表里还留着 id、但日志已经不在了」的僵尸 id（`present: false`）。
这是故意的：它们正是该被清掉的那种残留，删它们零成本。

## 删除前先停活儿

确认删除时宿主会先 `emit('workspace/session-stop', { sessionId })`，
这就是侧栏停止按钮走的那条信号（`agent.cancel({ kind: 'user' })` + 杀掉该会话名下的 job），
再删文件。否则正在跑的回合会在最后一次 flush 把日志写回来。

## 文件结构

```
package.json                 插件清单（dsh.bundle.patch + dsh.client）
cordis.patch.yml             bundle 补丁层：往 loader 树里插入一行 session-delete
src/node.js                  宿主半边：RPC /dsh-session-delete
                             （delete / list-archived-ungrouped / purge-archived-ungrouped / inspect）
src/client/index.tsx         客户端半边的可读源码（菜单行 + 两个对话框）
src/client/HeaderAction.tsx  「未分组」组头按钮：锚定原生行、复用原生 class 名
src/client/locales.ts        zh / en 词典
src/client/styles.ts         对话框用的 CSS（--dsw-* 主题变量）
lib/client.js                实际加载的 Module Loader bundle（手写，与上面源码等价）
locale/zh.json, en.json      词典纯 JSON 副本（package.json 的 exports 里暴露）
tools/smoke-host.mjs         宿主半边的离线冒烟测试（临时 DSH_HOME，不碰真实会话）
tools/live-inventory.mjs     对真实 profile 的**只读**盘点：批量清空现在会看到哪些会话
.github/workflows/ci.yml     CI：语法检查 + 冒烟测试（ubuntu / windows，Node 24）
LICENSE / CHANGELOG.md       许可证与变更记录
PUBLISH.md                   发布到 GitHub / npm 的步骤
```

客户端半边只 `require` 载入器种子表里的东西：`react`、`react/jsx-runtime`、
`react-dom/client`、`@deepseek-ai/dsh-client-ui-primitives`（`MenuItemButton` /
`Modal` / `Button` / `Tooltip` / `IconTrashOutlineRegular` 都从这里取，
不打包第二份 react 或 primitives）。

## 安装 / 启用

这是一个标准 DSH bundle（`dsh.bundle.patch` + `dsh.client`），任何 profile 都能装：

```powershell
git clone https://github.com/bxdsjs/dsh-session-delete.git `
  "$HOME\.dsh\plugins\dsh-session-delete"
```

然后在 `$DSH_HOME/profiles/<你的 profile>/package.json` 里：

```jsonc
{
  "dependencies": {
    "dsh-session-delete": "link:C:/Users/<you>/.dsh/plugins/dsh-session-delete"
  },
  "dsh": { "profile": { "bundles": [ /* …, */ "dsh-session-delete" ] } }
}
```

让包管理器据此生成 `node_modules/dsh-session-delete`。它自带的
`cordis.patch.yml` 会在 loader 树里插入 `id: session-delete` 一行。

如果这个 DSH 版本带插件安装器，也可以直接从仓库路径装：
`install_bundle link:C:/Users/<you>/.dsh/plugins/dsh-session-delete`。

宿主半边被加载器接上即生效；客户端那一半随页面加载，
**刷新一次页面**后菜单行与组头按钮才会出现。

## 验证

宿主半边（不碰真实数据，五十多项断言）：

```powershell
node tools/smoke-host.mjs        # 或 npm test
npm run check                    # 两个文件语法检查
```

覆盖：非法 id / 分组会话被拒、`inspect` 报告、批量列表（排除分组与未归档、僵尸 id 标 `present: false`、
标题与 cwd 取自投影缓存、按时间倒序）、批量删除的越权收窄、日志目录删除、
两种投影缓存文件名、检索索引两表清理与 generation 自增、无关缓存与无关索引行保留、
`workspace.json` 三处清理且格式不变、`api-session/removed` 与 `workspace/session-stop` 发出、
重复删除幂等、未知 endpoint 报错。

只读盘点真实 profile（**不删任何东西**，只调 `inspect` 与 `list-archived-ungrouped`）：

```powershell
node tools/live-inventory.mjs    # 或 npm run inventory
```

它会打印 `$DSH_HOME`、检索索引的配置/驱动/落盘文件、每个 workspace 的会话数，
以及「批量清空」此刻会看到的完整列表（标题、cwd、日志是否还在）。

运行时自检（GUI 里跑 DSH 的 agent 可以直接读）：
- `cordis_inspect_query` → `platform: "client"`, `provider: "Slots"`,
  `method: "listSubTree"`, `input: {"root":"sidebar.workspaces.session.menu.item"}`
  → occupants 里应有 `{ "id": "session-delete", "order": 500 }`
- `... input: {"root":"shell.overlay"}` → 应有 `{"id":"session-delete.confirm"}`
  与 `{"id":"session-delete.bulk"}`
- 组头按钮不是 slot 占位（原生没有这个座位），检查办法是看 DOM：
  `[data-row-key^="workspace:"][role="treeitem"]` 里那个含「未分组」的行，
  在其行尾动作区、原生 `⊕` 按钮之前应有一个 `<span data-dsh-session-delete-header>`
  包裹的按钮。没有可清理对象时它不渲染。

## 卸载

- 只关掉动作：插件市场里把 `dsh-session-delete` 停用（宿主 RPC 与客户端入口一起消失，文件不动）
- 彻底卸掉：停用后删除插件目录，
  再从 profile 的 `dependencies` / `dsh.profile.bundles` 里去掉那两行

已经删掉的会话不会因为卸载插件而回来——它们是真的没了。

## 兼容性与风险

针对 DeepSeek Harness **0.2.1-rc.2**（Cordis loader + web profile）开发。宿主半边只依赖
`node:*` 内置模块和三个可选服务（`connection`、`workspaceRegistry`、`sessionQuery`），
每一步都是 best-effort：少一个服务只会让对应功能降级，不会让插件加载失败。

客户端半边依赖若干**已发布但未文档化**的事实，列在这里是为了将来 DSH 改动时好定位：

- slot key `sidebar.workspaces.session.menu.item`、`shell.overlay` 及其注册契约
  （`id` / `order` / `locale` / `inject` / `hooks`）；
- `@deepseek-ai/dsh-client-ui-primitives`（载入器种子词）里的
  `MenuItemButton` / `Modal` / `Button` / `Tooltip` / 各图标；
- 工作区行标记 `[data-row-key^="workspace:"][role="treeitem"]` 及其行尾按钮
  —— 组头按钮就是锚定它的；
- 投影缓存两种文件名、`workspace.json` 的 unit 形状；
- `persisted_sessions` / `persisted_docs` / `search_state` 三张表的结构。

## 已知取舍

- 内存里仍驻留的 Session 对象不会被逐出：DSH 没有公开的 evict API。删文件 +
  发 `api-session/removed` 已经让列表和刷新后的结果都不再有它；磁盘上不留残留。
- **正在聊的那条别删。** 宿主没有 evict 接口，如果那个会话的写句柄还没关，后续一次
  flush 理论上可能把 `session.v4.jsonl.zstd` 又写回来。先切到别的会话再删最稳。
- `attachments/` 里只有这条会话用过的 blob 会变成孤儿占盘（不泄露新内容，但白占空间）。
- 已发出的遥测（`otel` / `sessionTelemetry`）不会被召回。
- 同一秒内在另一个窗口里删同一个会话，第二次会得到 `deletedPaths: 0` 的成功结果（幂等，不算失败）。
- `dsh-unrestricted` 这个插件当前因为 `@deepseek-ai/schemastery` 解析不到而 import 失败，
  与本插件无关（本插件只 import `node:*` 内置模块，刻意不依赖那些包）。
