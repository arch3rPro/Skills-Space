# 是否能在离开 Fork 网络后继续与上游同步

> **状态：参考研究，非执行规范。** 2026-10-13 核查文档职责；未重新联网验证原研究中的外部文档。下列命令是历史建议，不授权自动更改远端或分支。当前分支职责以 [AGENTS.md](../../AGENTS.md) 为准，上游依赖升级以[固定版本命令映射](upstream-command-map.md)为准。脱离 GitHub Fork 网络与应用是否维护自有 CLI 是两件事。


## 已核实事实（官方文档）

- GitHub 官方文档“Syncing a fork”说明：该功能用于**同步 fork 仓库与其 upstream**，并明确了可以通过 Web UI、GitHub CLI、命令行操作。([同步文档](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork))
- Web UI 流程要求在 fork 仓库页面出现 **Sync fork** 下拉并点击 **Update branch**，这本质上是“在 fork 仓库上做同步”。([同步文档](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork))
- 同步前提还要求：先在 Git 配置指向 upstream 的 remote（页面明确写到“configuring a remote”）。([配置 upstream remote 文档](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/configuring-a-remote-repository-for-a-fork))
- 该配置文档给出的命令示例是：
  - `git remote add upstream https://github.com/ORIGINAL-OWNER/ORIGINAL-REPOSITORY.git`
- Git 命令文档中 `git fetch` 会更新远端跟踪分支（如 `<remote>/<branch>`），`git fetch <remote> <branch>` 只抓取指定分支；`git remote add` 用于新增一条远端。
  - (`git-fetch`: https://git-scm.com/docs/git-fetch, `git-remote`: https://git-scm.com/docs/git-remote)
- Git Docs 说明 GitHub REST 的 `Get a repository` 返回中：`parent`、`source` 字段仅在仓库是 fork 时存在；`parent` 表示 fork 源。([REST API - Get a repository](https://docs.github.com/en/rest/repos/repos#get-a-repository))
- Fork 本身定义为“与原仓库连接、但有独立设置与权限的独立仓库”。([Forks 文档](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/about-forks))

## 推断（基于上面事实）

- **如果仓库已经离开 fork 网络（不再是 fork）**：
  - Web UI 的 **Sync fork** 功能通常不再适用，因为文档前提始终是“forked repository”。
  - 但 Git 本身仍可继续抓取上游，只要你保留一个名为 `upstream` 的 remote 并手动 `fetch`。

- **关于保留 `upstream-sync` 分支且让 `main` 独立**：
  - 可以把 `upstream-sync` 作为专用同步分支单独更新，不触碰 `main` 的提交线。

## 建议命令（保持 `main` 不合并上游）

```bash
# 1) 配置上游远端（若未配置）
git remote add upstream https://github.com/ORIGINAL-OWNER/ORIGINAL-REPO.git

# 2) 抓取上游 main（不会改动当前分支的工作树）
git fetch upstream main

# 3) 只更新 upstream-sync 分支
git switch upstream-sync

git merge --ff-only upstream/main    # 或者处理冲突后再提交/合并

git push origin upstream-sync
# 如需后续直接跟踪 origin，首次可用 -u
# git push -u origin upstream-sync
```

- `main` 在上述步骤中可以保持原有“独立项目主线”；上游同步只在 `upstream-sync` 上进行。

## 结论

- **能否继续同步？**
  - **官方 UI 上的“fork 同步”**：对已离开 fork 网络的仓库通常不可用（文档限定在 fork 仓库）。
  - **使用 Git 命令行**：可继续同步（前提是仓库中仍有配置好的 `upstream` 远端并按需 fetch/merge）。
