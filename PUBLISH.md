# 发布到 GitHub

仓库地址已经按 `github.com/bxdsjs/dsh-session-delete` 填好（取自本机 git 全局配置
`user.name = bxdsjs`）。**如果你的 GitHub 用户名不是这个**，先把全仓的 `bxdsjs`
换掉再推：

```powershell
# 在插件目录里执行；先看清楚会改哪些文件
Select-String -Path README.md,README.en.md,CHANGELOG.md,PUBLISH.md,package.json -Pattern 'bxdsjs'
(Get-ChildItem -Recurse -File -Include *.md,*.json,*.yml |
  Where-Object FullName -NotMatch '\\node_modules\\') |
  ForEach-Object { (Get-Content $_.FullName -Raw).Replace('bxdsjs','YOUR_GITHUB_USER') |
    Set-Content $_.FullName -NoNewline }
```

改完把 `README.md` / `README.en.md` 里的徽章和 `CHANGELOG` 底部链接也核一遍。

---

## 1. 建空仓库

<https://github.com/new>

- Repository name：`dsh-session-delete`
- Public
- **不要**勾 Add a README / .gitignore / license（仓库里已经有了）

## 2. 首次提交并推送

```powershell
cd C:\Users\1\.dsh\plugins\dsh-session-delete

# 确认没有夹带本机 harness 状态（.gitignore 已挡住 .dsh/ sessions/ storages/ node_modules/）
git init -b main
git add -A
git status --short          # 应该只有 package.json / src / lib / locale / tools / docs 之类
git commit -m "feat: permanent delete for DeepSeek Harness sessions"
git remote add origin https://github.com/bxdsjs/dsh-session-delete.git
git push -u origin main
```

没装 `gh` CLI 也能推；如果不想在命令行输密码，用 Personal Access Token
（GitHub → Settings → Developer settings → Tokens）当密码，或者配好 SSH 走
`git@github.com:bxdsjs/dsh-session-delete.git`。

## 3. 打 tag，创建 Release

```powershell
git tag -a v1.0.0 -m "v1.0.0"
git push origin v1.0.0
```

然后 <https://github.com/bxdsjs/dsh-session-delete/releases/new> 选 `v1.0.0`，
标题 `v1.0.0`，正文直接贴 `CHANGELOG.md` 里 `## [1.0.0]` 那段。
`main` 分支的 CI 徽章会在这之后变绿。

## 4. （可选）发 npm

`package.json` 里已经去掉了 `"private": true`，所以可以直接发。先查名字：

```powershell
npm view dsh-session-delete version
```

- 报 404 → 名字空着，直接发：

  ```powershell
  npm login
  npm publish --access public
  ```

- 已经被占用 → 改成带 scope 的名字再发（同时把两个 README 里的安装方式改成 npm 包名）：

  ```powershell
  npm pkg set name="@bxdsjs/dsh-session-delete"
  npm publish --access public
  ```

发到 npm 之后，别人安装就是 `dependencies` 里写 `"@bxdsjs/dsh-session-delete": "^1.0.0"`，
不用 clone。

## 5. 发布前自查

- [ ] `npm test`（= `node tools/smoke-host.mjs`）全绿
- [ ] `npm run check` 两个文件语法通过
- [ ] `git status` 里没有 `node_modules/`、`.dsh/`、`sessions/`、`storages/`、`*.sqlite`
- [ ] 两个 README 里的仓库 URL / 徽章 / 安装路径都换成了你的
- [ ] `package.json` 的 `author`、`repository`、`bugs`、`homepage` 是你的
- [ ] 决定 `version`：首发 `1.0.0` 没问题
- [ ] 想加截图的话放进 `docs/` 并在 README 顶部引用（Markdown 相对路径）
