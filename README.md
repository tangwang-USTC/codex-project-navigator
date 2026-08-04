# Codex Project Navigator

[中文](README.md) | [English](README.en.md)

一个嵌入官方 Codex 侧栏的独立 VS Code 树视图扩展，用可排序、可嵌套的项目结构管理本机 Codex 会话。它直接连接官方 `codex app-server`，不修改 `openai.chatgpt`。

> 本项目是独立的非官方开源扩展，与 OpenAI 不存在隶属、认可或赞助关系。Codex、OpenAI 及相关标识归其各自权利人所有。

产品名在所有语言环境中统一为英文 **Codex Project Navigator**。插件默认运行界面为中文；当 VS Code 显示语言为英文时，会自动加载英文命令、设置与运行时界面。

## 功能

- 最近 7 个任务、置顶任务、项目树和归档任务；监听 thread 活动并立即更新最近列表
- 可排序、可嵌套的项目树；项目可包含子项目，子项目可再次提升为顶级项目
- 项目 → 任务（二层）、项目 → 分组 → 任务（三层）或项目 → 分组 → 子分组 → 任务（四层）；分组可提升为独立项目
- 搜索任务名、预览、ID、项目路径、项目别名和分组
- 右键重命名、置顶/取消置顶、归档/恢复任务
- 右键把任务移动到任一项目/分组；只改变 Navigator 层级，不修改 thread 原始工作目录
- 右键项目、分组或子分组可通过官方 App Server 新建空 Codex 任务，并直接在原生会话编辑器中输入内容
- 右键项目、分组或子分组可搜索、多选电脑中已有的活跃任务并直接归入当前层级
- 已归档任务可在再次确认后从本机永久删除
- 自定义项目显示名称；不修改磁盘目录
- 点击任务直接在官方 Codex 原生会话编辑器中继续，保留模型选择、审批按钮和输入框
- 提供任务行对话按钮和触屏友好的打开方式菜单；`codex resume` 终端模式作为回退
- 自动发现官方 Codex VS Code 扩展内置的 `codex` 可执行文件
- 与官方聊天界面共用一个 Codex 侧栏入口，不再创建单独的活动栏图标
- 支持“层级兼容模式”和“层级独占模式”一键切换
- 新建分组与子分组时自动预填下一个可用名称，如“分组 1”“分组 2”“子分组 1”；实际 Codex 任务标题保持原样

默认结构示例：

```text
项目
├─ 分组 1
│  ├─ 子分组 1
│  │  ├─ 任务 1
│  │  └─ 任务 2
│  └─ 子分组 2
└─ 分组 2
```

“任务 1 / 任务 2”仅用于说明层级；插件不会用示例名覆盖已有 Codex 对话标题。

## 安装与使用

1. 首选在 VS Code 扩展视图中搜索 `tangwang.codex-project-navigator`，或执行 `code --install-extension tangwang.codex-project-navigator --force`。
2. 下载 `.vsix` 后可执行 **Extensions: Install from VSIX...**，或执行 `code --install-extension "完整路径\codex-project-navigator-1.0.2.vsix" --force`。网页 Install 按钮使用 `vscode:` 协议；“无法解析链接格式”表示该电脑的 VS Code 协议关联未注册，并不表示扩展包损坏。
3. 安装后执行 **Developer: Reload Window**。
4. 点击活动栏中的官方 **Codex** 图标，在官方聊天界面下方展开 **项目与任务**。
5. 点击任务会在编辑区打开官方 Codex 原生会话；任务行的对话按钮效果相同。
6. 任务的“打开方式”菜单可显式选择原生界面、终端、复制 ID 或官方侧栏；右键还可重命名、置顶、归档和移动到任一项目/分组/子分组。
7. 永久删除只出现在已归档任务的右键菜单，并会再次显示不可恢复确认。
8. 拖动项目到另一个项目可建立父子层级；拖回“项目”根节点可提升为顶级项目并移到末尾。
9. 右键项目可新建 Codex 任务、从本机任务文件夹添加、添加已有 Codex 对话、上移、下移、选择父项目、提升为顶级项目、新建分组和设置显示名称。
10. 右键分组或子分组可使用“从本机任务文件夹添加…”：选择目录后，扩展以该目录为工作目录建立 Codex 对话，以文件夹名命名，归入当前层级并打开；“添加已有任务…”仍用于搜索、多选和移动已有 Codex 对话。
11. 对于 `thread/read` 可读取但尚未出现在 `thread/list` 中的空任务或语义拆分任务，可在目标项目、分组或子分组右键选择“按任务 ID 添加…”。Navigator 只保存本地发现与层级元数据，不修改官方会话记录。
11. 右键普通分组可直接新建子分组；如果当前不是四层模式，扩展会自动切换为四层。右键子分组可重命名或删除，删除后其中任务回到父分组。
12. 右键分组可将其连同任务提升为独立项目；拖到某个项目上则提升为该项目的子项目。

### 旧版迁移与双扩展修复

VS Code 以 `publisher.name` 识别扩展。早期的 `tangwang-local.codex-project-navigator`、`tangwang-ustc.codex-project-navigator` 与正式的 `tangwang.codex-project-navigator` 是不同扩展，不会自动互相覆盖；并存会重复注册相同命令和视图。1.0.2 会在激活前检测旧 ID，发现冲突时停止注册并提示清理。若要继承旧身份的本机项目、分组和任务归属，关闭全部 VS Code 窗口后执行随扩展提供的 `python scripts/migrate-legacy-vscode-state.py`；工具先备份状态库，且绝不覆盖已有正式状态。

```powershell
code --uninstall-extension tangwang-local.codex-project-navigator
code --uninstall-extension tangwang-ustc.codex-project-navigator
code --install-extension tangwang.codex-project-navigator --force
```

也可运行 `scripts/install-or-repair.ps1 -RemoveLegacy`。完整说明见 [INSTALLATION.md](INSTALLATION.md)。

扩展同时适配官方 Codex 位于主侧栏和辅助侧栏的布局。它作为独立的可折叠树视图嵌入同一容器，不向官方 Webview 注入代码。

## 视图模式

- **层级独占模式**（默认）：隐藏整个官方 Codex 任务列表，只保留“项目与任务”；点击任务后在编辑区打开原生 Codex 会话。
- **层级兼容模式**：官方 Codex 视图和“项目与任务”层级树同时显示，用于迁移、排障和显式回退。

点击“项目与任务”标题栏上的侧栏按钮即可切换，也可以执行命令：

```text
Codex Navigator: 切换层级兼容/独占模式
```

当前模式会显示在“项目与任务”标题右侧，并持久保存到全局设置 `codexProjectNavigator.viewMode`。在独占模式中使用“打开官方 Codex 侧栏”会自动恢复兼容模式。

设置 `Codex Project Navigator: Grouping Depth` 为 `2`、`3` 或 `4` 可切换层级。四层模式支持“项目 → 分组 → 子分组 → 任务”；从四层切回三层时，子分组任务会在父分组中汇总显示，已有分组数据不会丢失。

最近列表默认只显示严格按活动时间排序的 7 条；完整任务仍在项目树中。扩展同时监听 App Server 的 `thread/*`、`turn/started`、`turn/completed` 通知及本机 Codex 会话存储变更，在事件发生后自动更新显示，不执行周期轮询。`codexProjectNavigator.autoRefreshSeconds` 默认是 `0`；仅在通知机制异常的兼容场景下，才需要把它设为大于 0 的轮询兜底值。

## 数据边界

任务名、置顶、归档和永久删除通过 Codex App Server 同步，因此 Codex 桌面端、CLI 和 VS Code 使用同一任务数据时会看到变化。自定义分组、跨项目导航归属、项目别名、项目顺序和项目父子关系保存在 VS Code 的扩展全局状态中，仅属于本机导航视图。项目排序、嵌套、提升和跨项目移动都不改变 thread 的原始 `cwd`。

永久删除调用官方 `thread/delete`，只允许从“已归档”区域触发；确认后无法恢复，并可能同时删除该任务派生的子任务。

官方扩展目前没有公开“按任务 ID 在侧栏中打开指定任务”的稳定命令。本扩展优先使用当前官方扩展提供的 `chatgpt.conversationEditor` 和本地会话 URI，在编辑区恢复原生会话；若该入口在未来版本中不可用，会明确提示并提供 `codex resume <thread-id>` 和复制 ID 回退，不修改官方扩展文件。

默认打开方式是 `native`。可通过 `codexProjectNavigator.defaultOpenMode` 改为 `terminal`、`menu` 或 `copyId`。

## 兼容性

版本 1.0.2 针对官方 `openai.chatgpt` 扩展的侧栏容器、View 标识、树拖放接口、App Server `thread/start`/`thread/list`、thread 通知和原生会话编辑器做运行时能力检测，并在激活前拦截旧 publisher 冲突、校验历史层级状态。

## 发布状态

源码与可安装 VSIX 在本仓库和 Visual Studio Marketplace 公开发布，正式扩展 ID 为 `tangwang.codex-project-navigator`。

## 版本规则

采用 `主版本.次版本.补丁版本`：

- 小的兼容迭代、修复：升级最后一位，例如 `1.0.0 → 1.0.1`；
- 完成一个小阶段或新增重要兼容能力：升级第二位，例如 `1.0.x → 1.1.0`；
- 正式代际升级或明确的不兼容变更：升级第一位，例如 `1.x → 2.0.0`。

## 开发

```powershell
npm install
npm test
npm run check
npm run package
```

贡献要求见 [CONTRIBUTING.md](CONTRIBUTING.md)，一般问题与功能建议请使用 [GitHub Issues](https://github.com/tangwang-USTC/codex-project-navigator/issues)，安全问题请使用 [私密漏洞报告](https://github.com/tangwang-USTC/codex-project-navigator/security/advisories/new)。

## 隐私

扩展只启动本机 Codex App Server，并在本机 VS Code 中保存项目结构、分组、子分组与显示别名；不包含第三方遥测或独立网络服务。
