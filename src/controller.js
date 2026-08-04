'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const vscode = require('vscode');
const { t } = require('./localization');
const { AppServerClient, isThreadActivityNotification } = require('./appServerClient');
const {
  normalizePathKey,
  normalizeThread,
  projectLabel,
  applyProjectAssignments,
  normalizeGroupAssignment,
  groupAssignmentLabel,
  collectThreadFamilyIds,
  wouldCreateProjectCycle,
  UNGROUPED,
} = require('./model');
const { openNativeThread } = require('./nativeConversation');
const {
  VIEW_MODE_COMPATIBLE,
  VIEW_MODE_EXCLUSIVE,
  normalizeViewMode,
  viewModeLabel,
  applyCodexViewMode,
} = require('./viewMode');

const STATE = {
  groups: 'codexProjectNavigator.groups',
  subgroups: 'codexProjectNavigator.subgroups',
  assignments: 'codexProjectNavigator.assignments',
  projectAssignments: 'codexProjectNavigator.projectAssignments',
  aliases: 'codexProjectNavigator.projectAliases',
  projectParents: 'codexProjectNavigator.projectParents',
  projectOrder: 'codexProjectNavigator.projectOrder',
  projectCatalog: 'codexProjectNavigator.projectCatalog',
  registeredThreads: 'codexProjectNavigator.registeredThreads',
  schemaVersion: 'codexProjectNavigator.schemaVersion',
};

const CURRENT_STATE_SCHEMA_VERSION = 1;

const VIEW_IDS = [
  'codexProjectNavigator.tasks.primary',
  'codexProjectNavigator.tasks.secondary',
];

class NavigatorController {
  constructor(context, provider) {
    this.context = context;
    this.provider = provider;
    this.output = vscode.window.createOutputChannel('Codex Project Navigator');
    this.client = undefined;
    this.executable = undefined;
    this.refreshing = undefined;
    this.refreshAgain = false;
    this.refreshTimer = undefined;
    this.notificationTimer = undefined;
    this.treeViews = [];
    this.applyingViewMode = false;
    this.disposables = [];
  }

  async start() {
    this.provider.setDropHandler((payload, target) => this.handleTreeDrop(payload, target));
    this.treeViews = VIEW_IDS.map((viewId) => ({
      id: viewId,
      view: vscode.window.createTreeView(viewId, {
        treeDataProvider: this.provider,
        dragAndDropController: this.provider,
        showCollapseAll: true,
      }),
    }));
    this.disposables.push(
      this.output,
      ...this.treeViews.map((item) => item.view),
      vscode.commands.registerCommand('codexProjectNavigator.refresh', () => this.refresh()),
      vscode.commands.registerCommand('codexProjectNavigator.search', () => this.search()),
      vscode.commands.registerCommand('codexProjectNavigator.clearSearch', () => this.clearSearch()),
      vscode.commands.registerCommand('codexProjectNavigator.toggleViewMode', () => this.toggleViewMode()),
      vscode.commands.registerCommand('codexProjectNavigator.openTask', (node) => this.openTask(node)),
      vscode.commands.registerCommand('codexProjectNavigator.openTaskNative', (node) => this.openTaskNative(node)),
      vscode.commands.registerCommand('codexProjectNavigator.openTaskTerminal', (node) => this.openTaskTerminal(node)),
      vscode.commands.registerCommand('codexProjectNavigator.openTaskMenu', (node) => this.openTaskMenu(node)),
      vscode.commands.registerCommand('codexProjectNavigator.renameTask', (node) => this.renameTask(node)),
      vscode.commands.registerCommand('codexProjectNavigator.togglePin', (node) => this.togglePin(node)),
      vscode.commands.registerCommand('codexProjectNavigator.pinTask', (node) => this.setPinned(node, true)),
      vscode.commands.registerCommand('codexProjectNavigator.unpinTask', (node) => this.setPinned(node, false)),
      vscode.commands.registerCommand('codexProjectNavigator.archiveTask', (node) => this.archiveTask(node)),
      vscode.commands.registerCommand('codexProjectNavigator.unarchiveTask', (node) => this.unarchiveTask(node)),
      vscode.commands.registerCommand('codexProjectNavigator.deleteTask', (node) => this.deleteTask(node)),
      vscode.commands.registerCommand('codexProjectNavigator.copyTaskId', (node) => this.copyTaskId(node)),
      vscode.commands.registerCommand('codexProjectNavigator.createGroup', (node) => this.createGroup(node)),
      vscode.commands.registerCommand('codexProjectNavigator.createTask', (node) => this.createTask(node)),
      vscode.commands.registerCommand('codexProjectNavigator.addTaskFolder', (node) => this.addTaskFolder(node)),
      vscode.commands.registerCommand('codexProjectNavigator.addExistingTask', (node) => this.addExistingTask(node)),
      vscode.commands.registerCommand('codexProjectNavigator.addTaskById', (node) => this.addTaskById(node)),
      vscode.commands.registerCommand('codexProjectNavigator.createSubgroup', (node) => this.createSubgroup(node)),
      vscode.commands.registerCommand('codexProjectNavigator.renameGroup', (node) => this.renameGroup(node)),
      vscode.commands.registerCommand('codexProjectNavigator.renameSubgroup', (node) => this.renameSubgroup(node)),
      vscode.commands.registerCommand('codexProjectNavigator.removeGroup', (node) => this.removeGroup(node)),
      vscode.commands.registerCommand('codexProjectNavigator.removeSubgroup', (node) => this.removeSubgroup(node)),
      vscode.commands.registerCommand('codexProjectNavigator.moveToGroup', (node) => this.moveToGroup(node)),
      vscode.commands.registerCommand('codexProjectNavigator.moveToProjectGroup', (node) => this.moveToProjectGroup(node)),
      vscode.commands.registerCommand('codexProjectNavigator.renameProjectLabel', (node) => this.renameProjectLabel(node)),
      vscode.commands.registerCommand('codexProjectNavigator.resetProjectLabel', (node) => this.resetProjectLabel(node)),
      vscode.commands.registerCommand('codexProjectNavigator.moveProject', (node) => this.moveProject(node)),
      vscode.commands.registerCommand('codexProjectNavigator.moveProjectUp', (node) => this.moveProjectBy(node, -1)),
      vscode.commands.registerCommand('codexProjectNavigator.moveProjectDown', (node) => this.moveProjectBy(node, 1)),
      vscode.commands.registerCommand('codexProjectNavigator.promoteProject', (node) => this.promoteProject(node)),
      vscode.commands.registerCommand('codexProjectNavigator.promoteGroupToProject', (node) => this.promoteGroupToProject(node)),
      vscode.commands.registerCommand('codexProjectNavigator.openOfficialSidebar', () => this.openOfficialSidebar()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('codexProjectNavigator.viewMode') && !this.applyingViewMode) {
          void this._applyConfiguredViewMode(false, true);
        }
        if (
          event.affectsConfiguration('codexProjectNavigator.groupingDepth')
          || event.affectsConfiguration('codexProjectNavigator.recentLimit')
        ) {
          this._applyOptions();
        }
        if (event.affectsConfiguration('codexProjectNavigator.autoRefreshSeconds')) {
          this._restartTimer();
        }
        if (
          event.affectsConfiguration('codexProjectNavigator.codexCommand')
          || event.affectsConfiguration('codexProjectNavigator.maxTasks')
          || event.affectsConfiguration('codexProjectNavigator.sourceKinds')
        ) {
          this._reconnect();
        }
      }),
    );
    this._startActivityWatchers();
    this.context.subscriptions.push(...this.disposables, this);
    await this._repairPersistedState();
    this._verifyCodexContainers();
    this._applyOptions();
    this._restartTimer();
    await vscode.commands.executeCommand('setContext', 'codexProjectNavigator.searchActive', false);
    this._syncViewModePresentation(this._configuredViewMode());
    if (this._configuredViewMode() === VIEW_MODE_EXCLUSIVE) {
      void this._applyConfiguredViewMode(false, false);
    }
    void this.refresh();
  }

  async toggleViewMode() {
    const current = this._configuredViewMode();
    const target = current === VIEW_MODE_EXCLUSIVE ? VIEW_MODE_COMPATIBLE : VIEW_MODE_EXCLUSIVE;
    await this._setViewMode(target, true, true);
  }

  async refresh() {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    this.provider.setLoading(true);
    this.refreshing = this._performRefresh();
    try {
      await this.refreshing;
    } finally {
      this.refreshing = undefined;
      if (this.refreshAgain) {
        this.refreshAgain = false;
        void this.refresh();
      }
    }
  }

  async _performRefresh() {
    try {
      const client = await this._ensureClient();
      const config = this._config();
      const options = {
        sourceKinds: config.get('sourceKinds', ['vscode', 'cli', 'appServer']),
        maxTasks: config.get('maxTasks', 2000),
      };
      const [active, archived] = await Promise.all([
        client.listThreads({ ...options, archived: false }),
        client.listThreads({ ...options, archived: true }),
      ]);
      const knownThreadIds = new Set([...active, ...archived].map((thread) => thread.id));
      for (const thread of this._registeredThreads()) {
        if (!knownThreadIds.has(thread.id)) active.push(thread);
      }
      this.provider.updateData(
        active.map((thread) => normalizeThread(thread, { archived: false, t })),
        archived.map((thread) => normalizeThread(thread, { archived: true, t })),
      );
      this.output.appendLine(t('已刷新：{0} 个活跃任务，{1} 个归档任务。', active.length, archived.length));
    } catch (error) {
      this.output.appendLine(error.stack || String(error));
      this.provider.setError(error);
    }
  }

  _registeredThreads() {
    const remembered = this.context.globalState.get(STATE.registeredThreads, {});
    return Object.values(remembered || {}).filter((entry) => entry && entry.id && entry.cwd);
  }

  async _rememberThread(thread) {
    if (!thread?.id || !thread?.cwd) return;
    const remembered = structuredClone(this.context.globalState.get(STATE.registeredThreads, {}));
    remembered[thread.id] = {
      id: thread.id,
      name: thread.name || '',
      preview: thread.preview || '',
      cwd: thread.cwd,
      source: thread.source || 'vscode',
      threadSource: thread.threadSource || 'vscode',
      ephemeral: Boolean(thread.ephemeral),
      isPinned: Boolean(thread.isPinned),
    };
    await this.context.globalState.update(STATE.registeredThreads, remembered);
  }

  async search() {
    const value = await vscode.window.showInputBox({
      title: t('搜索 Codex 任务'),
      prompt: t('搜索任务名、预览、ID、项目路径或分组'),
      value: this.provider.searchQuery,
    });
    if (value === undefined) return;
    this.provider.setSearchQuery(value);
    await vscode.commands.executeCommand('setContext', 'codexProjectNavigator.searchActive', Boolean(value.trim()));
  }

  async clearSearch() {
    this.provider.setSearchQuery('');
    await vscode.commands.executeCommand('setContext', 'codexProjectNavigator.searchActive', false);
  }

  async openTask(node) {
    const thread = this._thread(node);
    if (!thread) return;
    const mode = this._config().get('defaultOpenMode', 'native');
    if (mode === 'menu') return this.openTaskMenu(node);
    if (mode === 'copyId') return this.copyTaskId(node);
    if (mode === 'terminal') return this._openInTerminal(thread);
    return this._openInNative(thread);
  }

  async openTaskNative(node) {
    const thread = this._thread(node);
    if (thread) return this._openInNative(thread);
  }

  async openTaskTerminal(node) {
    const thread = this._thread(node);
    if (thread) return this._openInTerminal(thread);
  }

  async openTaskMenu(node) {
    const thread = this._thread(node);
    if (!thread) return;
    const pick = await vscode.window.showQuickPick([
      { label: t('$(comment-discussion) 在 Codex 原生界面继续'), action: 'native', description: t('支持模型选择、审批按钮和触屏输入') },
      { label: t('$(terminal) 在终端继续'), action: 'terminal', description: t('运行 codex resume') },
      { label: t('$(copy) 复制任务 ID'), action: 'copy' },
      { label: t('$(layout-sidebar-right) 打开官方 Codex 侧栏'), action: 'sidebar' },
    ], { title: thread.title, placeHolder: t('选择打开方式') });
    if (pick?.action === 'native') return this._openInNative(thread);
    if (pick?.action === 'terminal') return this._openInTerminal(thread);
    if (pick?.action === 'copy') return this.copyTaskId(node);
    if (pick?.action === 'sidebar') return this.openOfficialSidebar();
  }

  async _openInNative(thread) {
    if (!await this._ensureThreadActive(thread)) return;
    try {
      const codex = vscode.extensions.getExtension('openai.chatgpt');
      if (!codex) throw new Error(t('未安装官方 OpenAI Codex 扩展。'));
      const uri = await openNativeThread(vscode, codex, thread.id, t);
      this.output.appendLine(t('已在 Codex 原生界面打开任务：{0} ({1})', thread.id, uri.toString()));
    } catch (error) {
      this.output.appendLine(error.stack || String(error));
      const terminalAction = t('在终端继续');
      const copyAction = t('复制任务 ID');
      const action = await vscode.window.showWarningMessage(
        t('无法在 Codex 原生界面打开该任务：{0}', error.message),
        terminalAction,
        copyAction,
      );
      if (action === terminalAction) return this._openInTerminal(thread);
      if (action === copyAction) {
        await vscode.env.clipboard.writeText(thread.id);
        vscode.window.setStatusBarMessage(t('Codex 任务 ID 已复制'), 2000);
      }
    }
  }

  async _openInTerminal(thread) {
    if (!await this._ensureThreadActive(thread)) return;
    await this._ensureClient();
    const args = [];
    if (thread.cwd) args.push('--cd', thread.cwd);
    args.push('resume', thread.id);
    const terminal = vscode.window.createTerminal({
      name: `Codex: ${thread.title.slice(0, 40)}`,
      shellPath: this.executable,
      shellArgs: args,
      cwd: thread.cwd || undefined,
      iconPath: new vscode.ThemeIcon('comment-discussion'),
    });
    terminal.show();
  }

  async _ensureThreadActive(thread) {
    if (!thread.archived) return true;
    const restoreAction = t('恢复并继续');
    const answer = await vscode.window.showInformationMessage(
      t('该任务已归档，恢复后才能继续。'),
      { modal: true },
      restoreAction,
    );
    if (answer !== restoreAction) return false;
    const restored = await this._mutate(() => this.client.unarchiveThread(thread.id), t('任务已恢复'));
    if (restored) thread.archived = false;
    return restored;
  }

  async renameTask(node) {
    const thread = this._thread(node);
    if (!thread) return;
    const name = await vscode.window.showInputBox({
      title: t('重命名 Codex 任务'),
      value: thread.title,
      validateInput: (value) => value.trim() ? undefined : t('名称不能为空'),
    });
    if (name === undefined || name.trim() === thread.title) return;
    await this._mutate(() => this.client.renameThread(thread.id, name.trim()), t('任务已重命名'));
  }

  async togglePin(node) {
    const thread = this._thread(node);
    if (!thread) return;
    return this.setPinned(node, !thread.isPinned);
  }

  async setPinned(node, isPinned) {
    const thread = this._thread(node);
    if (!thread || thread.archived) return;
    if (thread.isPinned === isPinned) return;
    await this._mutate(
      () => this.client.setPinned(thread.id, isPinned),
      isPinned ? t('任务已置顶') : t('已取消置顶'),
    );
  }

  async archiveTask(node) {
    const thread = this._thread(node);
    if (!thread || thread.archived) return;
    const archiveAction = t('归档');
    const answer = await vscode.window.showWarningMessage(
      t('归档“{0}”？', thread.title),
      { modal: true },
      archiveAction,
    );
    if (answer !== archiveAction) return;
    await this._mutate(() => this.client.archiveThread(thread.id), t('任务已归档'));
  }

  async unarchiveTask(node) {
    const thread = this._thread(node);
    if (!thread || !thread.archived) return;
    await this._mutate(() => this.client.unarchiveThread(thread.id), t('任务已恢复'));
  }

  async deleteTask(node) {
    const thread = this._thread(node);
    if (!thread) return;
    if (!thread.archived) {
      vscode.window.showInformationMessage(t('永久删除前必须先归档任务。'));
      return;
    }
    const deleteAction = t('永久删除');
    const answer = await vscode.window.showWarningMessage(
      t('永久删除已归档任务“{0}”？', thread.title),
      {
        modal: true,
        detail: t('任务 ID：{0}\n此操作无法恢复，并可能同时删除由该任务派生的子任务。', thread.id),
      },
      deleteAction,
    );
    if (answer !== deleteAction) return;
    const localStateIds = collectThreadFamilyIds(
      [...this.provider.activeThreads, ...this.provider.archivedThreads],
      thread.id,
    );
    const deleted = await this._mutate(
      () => this.client.deleteThread(thread.id),
      t('已从本机永久删除任务'),
    );
    if (!deleted) return;
    await this._removeLocalTaskState(localStateIds);
    this._applyOptions();
  }

  async copyTaskId(node) {
    const thread = this._thread(node);
    if (!thread) return;
    await vscode.env.clipboard.writeText(thread.id);
    vscode.window.setStatusBarMessage(t('Codex 任务 ID 已复制'), 2000);
  }

  async createTask(node) {
    const target = this._targetPlacement(node);
    if (!target) return;
    let cwd = target.project.cwd || '';
    if (!cwd || !fs.existsSync(cwd)) {
      const folders = await vscode.window.showOpenDialog({
        title: t('为“{0}”选择新任务工作目录', target.label),
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: t('选择并新建任务'),
      });
      if (!folders?.[0]) return;
      cwd = folders[0].fsPath;
    }

    try {
      const client = await this._ensureClient();
      const raw = await client.startThread({ cwd });
      await this._rememberThread(raw);
      const thread = normalizeThread(raw, { archived: false, t });
      await this._placeThreads([thread], target);
      await this.refresh();
      const placed = this._placedThread(thread.id) || thread;
      vscode.window.setStatusBarMessage(t('已在 {0} 中创建新任务', target.label), 3000);
      await this._openInNative(placed);
    } catch (error) {
      this.output.appendLine(error.stack || String(error));
      vscode.window.showErrorMessage(t('新建 Codex 任务失败：{0}', error.message));
    }
  }

  async addTaskFolder(node) {
    const target = this._targetPlacement(node);
    if (!target) return;
    const folders = await vscode.window.showOpenDialog({
      title: t('为“{0}”选择本机任务文件夹', target.label),
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: t('选择文件夹并添加'),
    });
    if (!folders?.[0]) return;
    const cwd = folders[0].fsPath;
    const folderName = path.basename(path.normalize(cwd));

    try {
      const client = await this._ensureClient();
      const raw = await client.startThread({ cwd });
      if (folderName) {
        try {
          await client.renameThread(raw.id, folderName);
          raw.name = folderName;
        } catch (error) {
          this.output.appendLine(t('已创建任务，但使用文件夹名重命名失败：{0}', error.message));
        }
      }
      await this._rememberThread(raw);
      const thread = normalizeThread(raw, { archived: false, t });
      await this._placeThreads([thread], target);
      await this.refresh();
      const placed = this._placedThread(thread.id) || thread;
      vscode.window.setStatusBarMessage(
        t('已从文件夹“{0}”添加任务到 {1}', folderName || cwd, target.label),
        3000,
      );
      await this._openInNative(placed);
    } catch (error) {
      this.output.appendLine(error.stack || String(error));
      vscode.window.showErrorMessage(t('从本机任务文件夹添加失败：{0}', error.message));
    }
  }

  async addExistingTask(node) {
    const target = this._targetPlacement(node);
    if (!target) return;
    await this.refresh();
    const assignments = this._assignments();
    const projectAssignments = this._projectAssignments();
    const aliases = this._aliases();
    const choices = this.provider.activeThreads
      .filter((thread) => !this._threadMatchesTarget(thread, target, assignments, projectAssignments))
      .map((thread) => {
        const placed = applyProjectAssignments([thread], projectAssignments)[0];
        const assignment = normalizeGroupAssignment(assignments[thread.id]);
        const currentProject = projectLabel(placed.navigationCwd, aliases, t);
        const currentGroup = groupAssignmentLabel(assignment) || t('未分组');
        return {
          label: thread.title,
          description: `${currentProject} → ${currentGroup}`,
          detail: `${thread.id} · ${thread.originalCwd || thread.cwd || t('无项目目录')}`,
          thread,
        };
      });
    if (choices.length === 0) {
      vscode.window.showInformationMessage(t('当前没有可添加到 {0} 的活跃任务。', target.label));
      return;
    }
    const picked = await vscode.window.showQuickPick(choices, {
      title: t('添加已有任务到 {0}', target.label),
      placeHolder: t('可按任务名、当前项目、分组、ID 或工作目录搜索'),
      canPickMany: true,
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked?.length) return;
    await this._placeThreads(picked.map((item) => item.thread), target);
    vscode.window.setStatusBarMessage(t('已添加 {0} 个任务到 {1}', picked.length, target.label), 3000);
  }

  async addTaskById(node) {
    const target = this._targetPlacement(node);
    if (!target) return;
    const threadId = await vscode.window.showInputBox({
      title: t('按 ID 添加 Codex 任务到 {0}', target.label),
      prompt: t('适用于 thread/read 可读取但 thread/list 尚未列出的空任务或语义拆分任务'),
      validateInput: (value) => value.trim() ? undefined : t('任务 ID 不能为空'),
    });
    if (threadId === undefined) return;
    try {
      const client = await this._ensureClient();
      const raw = await client.readThread(threadId.trim(), false);
      await this._rememberThread(raw);
      const thread = normalizeThread(raw, { archived: false, t });
      await this._placeThreads([thread], target);
      await this.refresh();
      const placed = this._placedThread(thread.id) || thread;
      vscode.window.setStatusBarMessage(t('已按 ID 添加任务到 {0}', target.label), 3000);
      await this._openInNative(placed);
    } catch (error) {
      this.output.appendLine(error.stack || String(error));
      vscode.window.showErrorMessage(t('按 ID 添加任务失败：{0}', error.message));
    }
  }

  async createGroup(node) {
    const project = node?.project;
    if (!project) return;
    const name = await vscode.window.showInputBox({
      title: t('在 {0} 中创建分组', project.label),
      prompt: t('分组只影响本导航器，不修改 Codex 任务本身'),
      value: this._nextGroupName(project.key),
      validateInput: (value) => this._validateGroupName(project.key, value),
    });
    if (name === undefined) return;
    const groups = this._groups();
    groups[project.key] = [...(groups[project.key] || []), name.trim()];
    await this.context.globalState.update(STATE.groups, groups);
    this._applyOptions();
  }

  async createSubgroup(node) {
    const project = node?.project;
    const groupName = node?.group?.name;
    if (!project || !groupName || groupName === UNGROUPED) return;
    if (Number(this._config().get('groupingDepth', 3)) !== 4) {
      await this._config().update('groupingDepth', 4, vscode.ConfigurationTarget.Global);
      this._applyOptions();
      vscode.window.setStatusBarMessage(t('已自动切换为四层模式'), 2000);
    }
    const name = await vscode.window.showInputBox({
      title: t('在 {0} → {1} 中创建子分组', project.label, groupName),
      prompt: t('子分组只影响本导航器，不修改 Codex 任务本身'),
      value: this._nextSubgroupName(project.key, groupName),
      validateInput: (value) => this._validateSubgroupName(project.key, groupName, value),
    });
    if (name === undefined) return;
    const subgroups = this._subgroups();
    subgroups[project.key] ||= {};
    subgroups[project.key][groupName] = [
      ...(subgroups[project.key][groupName] || []),
      name.trim(),
    ];
    await this.context.globalState.update(STATE.subgroups, subgroups);
    this._applyOptions();
  }

  async renameGroup(node) {
    const project = node?.project;
    const oldName = node?.group?.name;
    if (!project || !oldName || oldName === UNGROUPED) return;
    const name = await vscode.window.showInputBox({
      title: t('重命名分组'),
      value: oldName,
      validateInput: (value) => value.trim() === oldName ? undefined : this._validateGroupName(project.key, value),
    });
    if (name === undefined || name.trim() === oldName) return;
    const newName = name.trim();
    const groups = this._groups();
    groups[project.key] = (groups[project.key] || []).map((item) => item === oldName ? newName : item);
    const subgroups = this._subgroups();
    subgroups[project.key] ||= {};
    if (subgroups[project.key][oldName]) {
      subgroups[project.key][newName] = subgroups[project.key][oldName];
      delete subgroups[project.key][oldName];
    }
    const assignments = this._assignments();
    for (const [threadId, value] of Object.entries(assignments)) {
      const assignment = normalizeGroupAssignment(value);
      const placed = this._placedThread(threadId);
      if (assignment.group === oldName && placed?.projectKey === project.key) {
        assignments[threadId] = assignment.subgroup
          ? { group: newName, subgroup: assignment.subgroup }
          : newName;
      }
    }
    await Promise.all([
      this.context.globalState.update(STATE.groups, groups),
      this.context.globalState.update(STATE.subgroups, subgroups),
      this.context.globalState.update(STATE.assignments, assignments),
    ]);
    this._applyOptions();
  }

  async removeGroup(node) {
    const project = node?.project;
    const name = node?.group?.name;
    if (!project || !name || name === UNGROUPED) return;
    const removeAction = t('删除分组');
    const answer = await vscode.window.showWarningMessage(
      t('删除分组“{0}”？其中任务将移至“未分组”。', name),
      { modal: true },
      removeAction,
    );
    if (answer !== removeAction) return;
    const groups = this._groups();
    groups[project.key] = (groups[project.key] || []).filter((item) => item !== name);
    const subgroups = this._subgroups();
    if (subgroups[project.key]) delete subgroups[project.key][name];
    const assignments = this._assignments();
    for (const thread of this._threadsInGroup(project.key, name)) delete assignments[thread.id];
    await Promise.all([
      this.context.globalState.update(STATE.groups, groups),
      this.context.globalState.update(STATE.subgroups, subgroups),
      this.context.globalState.update(STATE.assignments, assignments),
    ]);
    this._applyOptions();
  }

  async renameSubgroup(node) {
    const project = node?.project;
    const groupName = node?.group?.name;
    const oldName = node?.subgroup?.name;
    if (!project || !groupName || !oldName) return;
    const name = await vscode.window.showInputBox({
      title: t('重命名子分组'),
      value: oldName,
      validateInput: (value) => value.trim() === oldName
        ? undefined
        : this._validateSubgroupName(project.key, groupName, value),
    });
    if (name === undefined || name.trim() === oldName) return;
    const newName = name.trim();
    const subgroups = this._subgroups();
    subgroups[project.key] ||= {};
    subgroups[project.key][groupName] = (subgroups[project.key][groupName] || [])
      .map((item) => item === oldName ? newName : item);
    const assignments = this._assignments();
    for (const [threadId, value] of Object.entries(assignments)) {
      const assignment = normalizeGroupAssignment(value);
      const placed = this._placedThread(threadId);
      if (
        placed?.projectKey === project.key
        && assignment.group === groupName
        && assignment.subgroup === oldName
      ) {
        assignments[threadId] = { group: groupName, subgroup: newName };
      }
    }
    await Promise.all([
      this.context.globalState.update(STATE.subgroups, subgroups),
      this.context.globalState.update(STATE.assignments, assignments),
    ]);
    this._applyOptions();
  }

  async removeSubgroup(node) {
    const project = node?.project;
    const groupName = node?.group?.name;
    const name = node?.subgroup?.name;
    if (!project || !groupName || !name) return;
    const removeAction = t('删除子分组');
    const answer = await vscode.window.showWarningMessage(
      t('删除子分组“{0}”？其中任务将移至“{1}”。', name, groupName),
      { modal: true },
      removeAction,
    );
    if (answer !== removeAction) return;
    const subgroups = this._subgroups();
    subgroups[project.key] ||= {};
    subgroups[project.key][groupName] = (subgroups[project.key][groupName] || [])
      .filter((item) => item !== name);
    const assignments = this._assignments();
    for (const thread of node.subgroup.threads || []) assignments[thread.id] = groupName;
    await Promise.all([
      this.context.globalState.update(STATE.subgroups, subgroups),
      this.context.globalState.update(STATE.assignments, assignments),
    ]);
    this._applyOptions();
  }

  async moveToGroup(node) {
    const thread = this._thread(node);
    if (!thread) return;
    if (Number(this._config().get('groupingDepth', 3)) < 3) {
      vscode.window.showInformationMessage(t('请先把 Grouping Depth 设置为 3 或 4。'));
      return;
    }
    const project = this._projectChoices().find((item) => item.key === thread.projectKey)
      || { key: thread.projectKey, cwd: thread.navigationCwd, label: projectLabel(thread.navigationCwd, this._aliases(), t) };
    const target = await this._pickTargetGroup(project, thread.title);
    if (target === undefined) return;
    const assignments = this._assignments();
    if (target) assignments[thread.id] = target;
    else delete assignments[thread.id];
    await this.context.globalState.update(STATE.assignments, assignments);
    this._applyOptions();
  }

  async moveToProjectGroup(node) {
    const thread = this._thread(node);
    if (!thread) return;
    const projects = this._projectChoices();
    if (projects.length === 0) {
      vscode.window.showInformationMessage(t('当前没有可选项目。'));
      return;
    }
    const projectPick = await vscode.window.showQuickPick(
      projects.map((project) => ({
        label: project.label,
        description: project.cwd || t('无项目目录'),
        detail: project.key === thread.originalProjectKey ? t('原始项目归属') : undefined,
        project,
      })),
      {
        title: t('移动“{0}”到项目/分组', thread.title),
        placeHolder: t('选择目标项目；仅改变 Navigator 层级归属'),
      },
    );
    if (!projectPick) return;
    const targetProject = projectPick.project;
    let targetGroup;
    if (Number(this._config().get('groupingDepth', 3)) >= 3) {
      targetGroup = await this._pickTargetGroup(targetProject, thread.title);
      if (targetGroup === undefined) return;
    }

    const projectAssignments = this._projectAssignments();
    const originalProjectKey = thread.originalProjectKey || normalizePathKey(thread.originalCwd || thread.cwd);
    if (targetProject.key === originalProjectKey) delete projectAssignments[thread.id];
    else {
      projectAssignments[thread.id] = {
        projectKey: targetProject.key,
        cwd: targetProject.cwd,
      };
    }

    const assignments = this._assignments();
    if (targetGroup) assignments[thread.id] = targetGroup;
    else delete assignments[thread.id];
    await Promise.all([
      this.context.globalState.update(STATE.projectAssignments, projectAssignments),
      this.context.globalState.update(STATE.assignments, assignments),
    ]);
    this._applyOptions();
    const suffix = targetGroup ? ` → ${groupAssignmentLabel(targetGroup)}` : '';
    vscode.window.setStatusBarMessage(t('已移动到 {0}{1}（仅 Navigator）', targetProject.label, suffix), 3000);
  }

  async _pickTargetGroup(project, threadTitle) {
    const names = this._groups()[project.key] || [];
    const pick = await vscode.window.showQuickPick([
      { label: t('未分组'), value: '' },
      ...names.map((name) => ({ label: name, value: name })),
      { label: t('$(add) 新建分组…'), value: '__create__' },
    ], {
      title: t('移动“{0}”到 {1}', threadTitle, project.label),
      placeHolder: t('选择目标分组'),
    });
    if (!pick) return undefined;
    let target = pick.value;
    if (target === '__create__') {
      const name = await vscode.window.showInputBox({
        title: t('在 {0} 中新建分组', project.label),
        value: this._nextGroupName(project.key),
        validateInput: (value) => this._validateGroupName(project.key, value),
      });
      if (name === undefined) return undefined;
      target = name.trim();
      const groups = this._groups();
      groups[project.key] = [...(groups[project.key] || []), target];
      await this.context.globalState.update(STATE.groups, groups);
    }
    if (!target || Number(this._config().get('groupingDepth', 3)) !== 4) return target;

    const subgroupNames = this._subgroups()[project.key]?.[target] || [];
    const subgroupPick = await vscode.window.showQuickPick([
      { label: t('直接放在 {0}', target), value: '' },
      ...subgroupNames.map((name) => ({ label: name, value: name })),
      { label: t('$(add) 新建子分组…'), value: '__create__' },
    ], {
      title: t('移动“{0}”到 {1} → {2}', threadTitle, project.label, target),
      placeHolder: t('选择目标子分组'),
    });
    if (!subgroupPick) return undefined;
    let subgroup = subgroupPick.value;
    if (subgroup === '__create__') {
      const name = await vscode.window.showInputBox({
        title: t('在 {0} 中新建子分组', target),
        value: this._nextSubgroupName(project.key, target),
        validateInput: (value) => this._validateSubgroupName(project.key, target, value),
      });
      if (name === undefined) return undefined;
      subgroup = name.trim();
      const subgroups = this._subgroups();
      subgroups[project.key] ||= {};
      subgroups[project.key][target] = [...(subgroups[project.key][target] || []), subgroup];
      await this.context.globalState.update(STATE.subgroups, subgroups);
    }
    return subgroup ? { group: target, subgroup } : target;
  }

  async renameProjectLabel(node) {
    const project = node?.project;
    if (!project) return;
    const label = await vscode.window.showInputBox({
      title: t('重命名项目显示名称'),
      value: project.label,
      prompt: t('仅修改导航器中的显示名称，不重命名磁盘目录'),
      validateInput: (value) => value.trim() ? undefined : t('名称不能为空'),
    });
    if (label === undefined) return;
    const aliases = this._aliases();
    aliases[project.key] = label.trim();
    const catalog = this._projectCatalog();
    if (catalog[project.key]) catalog[project.key].label = label.trim();
    await Promise.all([
      this.context.globalState.update(STATE.aliases, aliases),
      this.context.globalState.update(STATE.projectCatalog, catalog),
    ]);
    this._applyOptions();
  }

  async resetProjectLabel(node) {
    const project = node?.project;
    if (!project) return;
    if (this._projectCatalog()[project.key]?.custom) {
      vscode.window.showInformationMessage(t('自定义项目需要保留名称；可使用“重命名项目显示名称”。'));
      return;
    }
    const aliases = this._aliases();
    delete aliases[project.key];
    await this.context.globalState.update(STATE.aliases, aliases);
    this._applyOptions();
  }

  async moveProject(node) {
    const project = node?.project;
    if (!project) return;
    const parents = this._projectParents();
    const targets = this._projectChoices().filter((candidate) => (
      candidate.key !== project.key
      && !wouldCreateProjectCycle(project.key, candidate.key, parents)
    ));
    const pick = await vscode.window.showQuickPick([
      {
        label: t('$(folder-library) 顶级项目'),
        description: parents[project.key] ? t('提升为独立项目') : t('保持顶级并移到末尾'),
        project: undefined,
      },
      ...targets.map((candidate) => ({
        label: `$(folder) ${candidate.label}`,
        description: candidate.cwd || t('Navigator 自定义项目'),
        project: candidate,
      })),
    ], {
      title: t('调整项目“{0}”的层级', project.label),
      placeHolder: t('选择父项目；只改变 Navigator 项目树'),
    });
    if (!pick) return;
    await this._setProjectParent(project, pick.project, {
      moveToEnd: !pick.project,
      message: pick.project
        ? t('已把 {0} 放入 {1}', project.label, pick.project.label)
        : t('已把 {0} 提升为顶级项目', project.label),
    });
  }

  async moveProjectBy(node, direction) {
    const project = node?.project;
    if (!project || ![-1, 1].includes(direction)) return;
    const siblings = this.provider.projectSiblings(project.key, node.scope);
    const index = siblings.indexOf(project.key);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
      vscode.window.setStatusBarMessage(direction < 0 ? t('已经是当前层级第一项') : t('已经是当前层级最后一项'), 2000);
      return;
    }
    const order = this._completeProjectOrder();
    const otherKey = siblings[targetIndex];
    const currentOrderIndex = order.indexOf(project.key);
    const otherOrderIndex = order.indexOf(otherKey);
    if (currentOrderIndex < 0 || otherOrderIndex < 0) return;
    [order[currentOrderIndex], order[otherOrderIndex]] = [order[otherOrderIndex], order[currentOrderIndex]];
    await this.context.globalState.update(STATE.projectOrder, order);
    this._applyOptions();
  }

  async promoteProject(node) {
    const project = node?.project;
    if (!project) return;
    await this._setProjectParent(project, undefined, {
      moveToEnd: true,
      message: t('已把 {0} 提升为独立项目', project.label),
    });
  }

  async promoteGroupToProject(node, options = {}) {
    const sourceProject = node?.project;
    const groupName = node?.group?.name;
    if (!sourceProject || !groupName || groupName === UNGROUPED) return;
    const members = this._threadsInGroup(sourceProject.key, groupName);
    if (members.length === 0) {
      vscode.window.showInformationMessage(t('空分组不能提升为项目。'));
      return;
    }
    let label = options.label;
    if (!label) {
      label = await vscode.window.showInputBox({
        title: t('把分组“{0}”提升为独立项目', groupName),
        value: groupName,
        prompt: t('任务对话和原始工作目录保持不变'),
        validateInput: (value) => this._validateProjectLabel(value),
      });
    }
    if (label === undefined) return;
    label = label.trim();
    const projectKey = `navigator:${randomUUID()}`;
    const cwd = sourceProject.cwd || members[0].originalCwd || members[0].cwd || '';
    const projectAssignments = this._projectAssignments();
    const assignments = this._assignments();
    for (const thread of members) {
      projectAssignments[thread.id] = { projectKey, cwd };
      delete assignments[thread.id];
    }
    const groups = this._groups();
    groups[sourceProject.key] = (groups[sourceProject.key] || []).filter((name) => name !== groupName);
    const subgroups = this._subgroups();
    if (subgroups[sourceProject.key]) delete subgroups[sourceProject.key][groupName];
    const aliases = this._aliases();
    aliases[projectKey] = label;
    const catalog = this._projectCatalog();
    catalog[projectKey] = { key: projectKey, cwd, label, custom: true };
    const parents = this._projectParents();
    if (options.parentProject?.key) parents[projectKey] = options.parentProject.key;
    const order = this._completeProjectOrder();
    const sourceIndex = order.indexOf(sourceProject.key);
    order.splice(sourceIndex >= 0 ? sourceIndex + 1 : order.length, 0, projectKey);
    await Promise.all([
      this.context.globalState.update(STATE.projectAssignments, projectAssignments),
      this.context.globalState.update(STATE.assignments, assignments),
      this.context.globalState.update(STATE.groups, groups),
      this.context.globalState.update(STATE.subgroups, subgroups),
      this.context.globalState.update(STATE.aliases, aliases),
      this.context.globalState.update(STATE.projectCatalog, catalog),
      this.context.globalState.update(STATE.projectParents, parents),
      this.context.globalState.update(STATE.projectOrder, order),
    ]);
    this._applyOptions();
    const suffix = options.parentProject ? t('，位于 {0} 下', options.parentProject.label) : '';
    vscode.window.showInformationMessage(t('已把分组“{0}”提升为项目“{1}”{2}（仅 Navigator）。', groupName, label, suffix));
  }

  async handleTreeDrop(payload, target) {
    if (!payload || !target) return;
    if (payload.kind === 'project') {
      const source = this._projectChoices().find((item) => item.key === payload.projectKey);
      if (!source) return;
      if (target.kind === 'project') {
        await this._setProjectParent(source, target.project, {
          message: t('已把 {0} 放入 {1}', source.label, target.project.label),
        });
        return;
      }
      if (target.kind === 'root' && target.rootType === 'projects') {
        await this._setProjectParent(source, undefined, {
          moveToEnd: true,
          message: t('已把 {0} 提升为顶级项目并移到末尾', source.label),
        });
      }
      return;
    }
    if (payload.kind === 'group') {
      const sourceProject = this._projectChoices().find((item) => item.key === payload.projectKey);
      if (!sourceProject) return;
      const node = { project: sourceProject, group: { name: payload.groupName } };
      if (target.kind === 'root' && target.rootType === 'projects') {
        await this.promoteGroupToProject(node, { label: payload.groupName });
      } else if (target.kind === 'project') {
        await this.promoteGroupToProject(node, {
          label: payload.groupName,
          parentProject: target.project,
        });
      }
    }
  }

  async _setProjectParent(project, parentProject, options = {}) {
    const parents = this._projectParents();
    const parentKey = parentProject?.key;
    if (wouldCreateProjectCycle(project.key, parentKey, parents)) {
      vscode.window.showErrorMessage(t('不能把项目放入自身或其子项目中。'));
      return;
    }
    if (parentKey) parents[project.key] = parentKey;
    else delete parents[project.key];
    const catalog = this._projectCatalog();
    this._rememberProject(catalog, project);
    if (parentProject) this._rememberProject(catalog, parentProject);
    const order = this._completeProjectOrder();
    if (options.moveToEnd) {
      const index = order.indexOf(project.key);
      if (index >= 0) order.splice(index, 1);
      order.push(project.key);
    }
    await Promise.all([
      this.context.globalState.update(STATE.projectParents, parents),
      this.context.globalState.update(STATE.projectCatalog, catalog),
      this.context.globalState.update(STATE.projectOrder, order),
    ]);
    this._applyOptions();
    vscode.window.setStatusBarMessage(t('{0}（仅 Navigator）', options.message || t('项目层级已更新')), 3000);
  }

  async openOfficialSidebar() {
    try {
      if (this._configuredViewMode() === VIEW_MODE_EXCLUSIVE) {
        await this._setViewMode(VIEW_MODE_COMPATIBLE, true, false);
      }
      await vscode.commands.executeCommand('chatgpt.openSidebar');
    } catch {
      vscode.window.showErrorMessage(t('未找到官方 Codex 扩展命令 chatgpt.openSidebar。'));
    }
  }

  async _mutate(operation, successMessage) {
    try {
      await this._ensureClient();
      await operation();
      vscode.window.setStatusBarMessage(successMessage, 2000);
      await this.refresh();
      return true;
    } catch (error) {
      this.output.appendLine(error.stack || String(error));
      vscode.window.showErrorMessage(t('Codex Project Navigator：{0}', error.message));
      return false;
    }
  }

  async _ensureClient() {
    if (this.client?.connected) return this.client;
    let lastError;
    for (const executable of this._executableCandidates()) {
      const client = new AppServerClient(executable, {
        log: (line) => line && this.output.appendLine(`[app-server] ${line}`),
        translate: t,
        clientInfo: {
          name: 'codex_project_navigator',
          title: 'Codex Project Navigator',
          version: this.context.extension.packageJSON.version,
        },
      });
      try {
        await client.connect();
        client.on('notification', (message) => {
          if (isThreadActivityNotification(message.method)) this._scheduleNotificationRefresh();
        });
        this.client = client;
        this.executable = executable;
        this.output.appendLine(t('已连接 Codex App Server：{0}', executable));
        return client;
      } catch (error) {
        lastError = error;
        client.dispose();
      }
    }
    throw new Error(t('无法启动 Codex App Server。请检查 codexProjectNavigator.codexCommand。{0}', lastError ? ` ${lastError.message}` : ''));
  }

  _executableCandidates() {
    const configured = this._config().get('codexCommand', 'codex');
    const candidates = [configured];
    const extension = vscode.extensions.getExtension('openai.chatgpt');
    if (extension) {
      const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64';
      const platform = process.platform === 'win32'
        ? `windows-${arch}`
        : process.platform === 'darwin'
          ? `macos-${arch}`
          : `linux-${arch}`;
      const filename = process.platform === 'win32' ? 'codex.exe' : 'codex';
      const bundled = path.join(extension.extensionPath, 'bin', platform, filename);
      if (fs.existsSync(bundled)) candidates.push(bundled);
    }
    return [...new Set(candidates.filter(Boolean))];
  }

  _scheduleNotificationRefresh() {
    clearTimeout(this.notificationTimer);
    this.notificationTimer = setTimeout(() => void this.refresh(), 750);
  }

  _startActivityWatchers() {
    const configuredHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const codexHome = path.resolve(configuredHome);
    const patterns = [
      'sessions/**/*.jsonl',
      'archived_sessions/**/*.jsonl',
      'state*.sqlite*',
    ];
    const listener = () => this._scheduleNotificationRefresh();
    for (const pattern of patterns) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(codexHome, pattern),
      );
      this.disposables.push(
        watcher,
        watcher.onDidCreate(listener),
        watcher.onDidChange(listener),
        watcher.onDidDelete(listener),
      );
    }
    this.output.appendLine(t('活动监听：App Server thread/turn 事件 + {0} 会话存储；周期轮询默认关闭。', codexHome));
  }

  _restartTimer() {
    clearInterval(this.refreshTimer);
    const seconds = this._config().get('autoRefreshSeconds', 0);
    if (seconds > 0) this.refreshTimer = setInterval(() => void this.refresh(), seconds * 1000);
  }

  _reconnect() {
    if (this.client) this.client.dispose();
    this.client = undefined;
    this.executable = undefined;
    void this.refresh();
  }

  _applyOptions() {
    const config = this._config();
    this.provider.updateOptions({
      groupingDepth: config.get('groupingDepth', 3),
      recentLimit: config.get('recentLimit', 7),
      groups: this._groups(),
      subgroups: this._subgroups(),
      assignments: this._assignments(),
      projectAssignments: this._projectAssignments(),
      aliases: this._aliases(),
      projectParents: this._projectParents(),
      projectOrder: this._projectOrder(),
      projectCatalog: this._projectCatalog(),
    });
  }

  _config() {
    return vscode.workspace.getConfiguration('codexProjectNavigator');
  }

  _configuredViewMode() {
    return normalizeViewMode(this._config().get('viewMode', VIEW_MODE_COMPATIBLE));
  }

  async _applyConfiguredViewMode(persist, notify) {
    return this._setViewMode(this._configuredViewMode(), persist, notify);
  }

  async _setViewMode(mode, persist, notify) {
    if (this.applyingViewMode) return;
    this.applyingViewMode = true;
    const normalized = normalizeViewMode(mode);
    try {
      const visible = this.treeViews.find((item) => item.view.visible);
      const result = await applyCodexViewMode(vscode.commands, normalized, visible?.id, t);
      if (persist) {
        await this._config().update('viewMode', normalized, vscode.ConfigurationTarget.Global);
      }
      await vscode.commands.executeCommand('setContext', 'codexProjectNavigator.viewMode', normalized);
      this._syncViewModePresentation(normalized);
      this.output.appendLine(
        t('已切换为{0}；命令：{1}', viewModeLabel(normalized, t), result.actionCommand),
      );
      if (notify) {
        const detail = normalized === VIEW_MODE_EXCLUSIVE
          ? t('官方任务列表已隐藏；点击任务将在原生 Codex 会话编辑器中继续。')
          : t('官方 Codex 视图与层级树同时显示。');
        vscode.window.showInformationMessage(t('已切换为{0}。{1}', viewModeLabel(normalized, t), detail));
      }
    } catch (error) {
      this.output.appendLine(error.stack || String(error));
      if (notify) vscode.window.showErrorMessage(t('切换视图模式失败：{0}', error.message));
    } finally {
      this.applyingViewMode = false;
    }
  }

  _syncViewModePresentation(mode) {
    const label = normalizeViewMode(mode) === VIEW_MODE_EXCLUSIVE ? t('独占') : t('兼容');
    for (const item of this.treeViews) item.view.description = label;
    void vscode.commands.executeCommand('setContext', 'codexProjectNavigator.viewMode', normalizeViewMode(mode));
  }

  _verifyCodexContainers() {
    const codex = vscode.extensions.getExtension('openai.chatgpt');
    if (!codex) {
      vscode.window.showErrorMessage(t('Codex Project Navigator 需要官方 OpenAI Codex 扩展。'));
      return;
    }
    const contributed = codex.packageJSON?.contributes?.viewsContainers || {};
    const containerIds = Object.values(contributed)
      .flat()
      .map((item) => item?.id)
      .filter(Boolean);
    const expected = ['codexViewContainer', 'codexSecondaryViewContainer'];
    const available = expected.filter((id) => containerIds.includes(id));
    this.output.appendLine(
      t('官方 Codex {0}；侧栏容器：{1}', codex.packageJSON?.version || 'unknown', available.join(', ') || t('未识别')),
    );
    if (available.length === 0) {
      vscode.window.showWarningMessage(
        t('当前官方 Codex 扩展未暴露兼容的侧栏容器；Project Navigator 可能需要升级。'),
      );
    }
  }

  _textList(value) {
    if (!Array.isArray(value)) return [];
    const values = new Set();
    for (const item of value) {
      const text = String(item || '').trim();
      if (text) values.add(text);
    }
    return [...values];
  }

  _toProjectKey(value) {
    return String(value ?? '').trim();
  }

  _looksLikeStringMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.values(value).every((item) => Array.isArray(item) || typeof item === 'string');
  }

  _normalizeGroups(rawGroups) {
    if (!rawGroups || typeof rawGroups !== 'object' || Array.isArray(rawGroups)) return {};
    const groups = {};
    for (const [projectKey, groupNames] of Object.entries(rawGroups)) {
      const key = this._toProjectKey(projectKey);
      if (key) groups[key] = this._textList(groupNames);
    }
    return groups;
  }

  _normalizeSubgroups(rawSubgroups) {
    if (!rawSubgroups || typeof rawSubgroups !== 'object' || Array.isArray(rawSubgroups)) return {};
    const subgroups = {};
    for (const [projectKeyRaw, byGroup] of Object.entries(rawSubgroups)) {
      const projectKey = this._toProjectKey(projectKeyRaw);
      if (!projectKey || !byGroup || typeof byGroup !== 'object' || Array.isArray(byGroup)) continue;
      const groups = {};
      for (const [groupNameRaw, subgroupNames] of Object.entries(byGroup)) {
        const groupName = this._toProjectKey(groupNameRaw);
        if (groupName) groups[groupName] = this._textList(subgroupNames);
      }
      if (Object.keys(groups).length > 0) subgroups[projectKey] = groups;
    }
    return subgroups;
  }

  _normalizeAssignments(rawAssignments) {
    if (!rawAssignments || typeof rawAssignments !== 'object' || Array.isArray(rawAssignments)) return {};
    const assignments = {};
    for (const [threadId, assignment] of Object.entries(rawAssignments)) {
      const id = this._toProjectKey(threadId);
      if (!id) continue;
      if (typeof assignment === 'string') {
        const group = this._toProjectKey(assignment);
        if (group) assignments[id] = group;
      } else if (assignment && typeof assignment === 'object') {
        const normalized = normalizeGroupAssignment(assignment);
        if (normalized.group || normalized.subgroup) assignments[id] = normalized;
      }
    }
    return assignments;
  }

  _normalizeProjectAssignments(rawProjectAssignments) {
    if (!rawProjectAssignments || typeof rawProjectAssignments !== 'object' || Array.isArray(rawProjectAssignments)) return {};
    const assignments = {};
    for (const [threadId, assignment] of Object.entries(rawProjectAssignments)) {
      const id = this._toProjectKey(threadId);
      if (!id) continue;
      if (typeof assignment === 'string') {
        const cwd = this._toProjectKey(assignment);
        if (cwd) assignments[id] = cwd;
      } else if (assignment && typeof assignment === 'object') {
        const projectKey = this._toProjectKey(assignment.projectKey);
        const cwd = this._toProjectKey(assignment.cwd);
        if (projectKey || cwd) assignments[id] = { projectKey: projectKey || normalizePathKey(cwd), cwd };
      }
    }
    return assignments;
  }

  _normalizeAliases(rawAliases) {
    if (!rawAliases || typeof rawAliases !== 'object' || Array.isArray(rawAliases)) return {};
    const aliases = {};
    for (const [projectKey, label] of Object.entries(rawAliases)) {
      const key = this._toProjectKey(projectKey);
      const value = this._toProjectKey(label);
      if (key && value) aliases[key] = value;
    }
    return aliases;
  }

  _normalizeProjectParents(rawProjectParents) {
    if (!rawProjectParents || typeof rawProjectParents !== 'object' || Array.isArray(rawProjectParents)) return {};
    const parents = {};
    for (const [projectKey, parentKey] of Object.entries(rawProjectParents)) {
      const key = this._toProjectKey(projectKey);
      const parent = this._toProjectKey(parentKey);
      if (key && parent) parents[key] = parent;
    }
    return parents;
  }

  _normalizeProjectOrder(rawProjectOrder) {
    return this._textList(rawProjectOrder);
  }

  _normalizeProjectCatalog(rawProjectCatalog) {
    if (!rawProjectCatalog || typeof rawProjectCatalog !== 'object' || Array.isArray(rawProjectCatalog)) return {};
    const catalog = {};
    for (const [projectKeyRaw, rawProject] of Object.entries(rawProjectCatalog)) {
      const key = this._toProjectKey(projectKeyRaw);
      if (!key || !rawProject || typeof rawProject !== 'object' || Array.isArray(rawProject)) continue;
      const cwd = this._toProjectKey(rawProject.cwd);
      const label = this._toProjectKey(rawProject.label);
      catalog[key] = { key, cwd, label: label || key, custom: Boolean(rawProject.custom) };
    }
    return catalog;
  }

  _needsMigration(version, groups, subgroups, assignments, projectAssignments, aliases, parents, order, catalog) {
    if (version !== CURRENT_STATE_SCHEMA_VERSION) return true;
    if (!this._looksLikeStringMap(groups)) return true;
    if (!subgroups || typeof subgroups !== 'object' || Array.isArray(subgroups)) return true;
    if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) return true;
    if (!projectAssignments || typeof projectAssignments !== 'object' || Array.isArray(projectAssignments)) return true;
    if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) return true;
    if (!parents || typeof parents !== 'object' || Array.isArray(parents)) return true;
    if (!Array.isArray(order)) return true;
    return !catalog || typeof catalog !== 'object' || Array.isArray(catalog);
  }

  async _repairPersistedState() {
    const raw = {
      groups: this.context.globalState.get(STATE.groups, {}),
      subgroups: this.context.globalState.get(STATE.subgroups, {}),
      assignments: this.context.globalState.get(STATE.assignments, {}),
      projectAssignments: this.context.globalState.get(STATE.projectAssignments, {}),
      aliases: this.context.globalState.get(STATE.aliases, {}),
      parents: this.context.globalState.get(STATE.projectParents, {}),
      order: this.context.globalState.get(STATE.projectOrder, []),
      catalog: this.context.globalState.get(STATE.projectCatalog, {}),
      version: this.context.globalState.get(STATE.schemaVersion, 0),
    };
    if (!this._needsMigration(
      raw.version, raw.groups, raw.subgroups, raw.assignments, raw.projectAssignments,
      raw.aliases, raw.parents, raw.order, raw.catalog,
    )) return;

    await Promise.all([
      this.context.globalState.update(STATE.groups, this._normalizeGroups(raw.groups)),
      this.context.globalState.update(STATE.subgroups, this._normalizeSubgroups(raw.subgroups)),
      this.context.globalState.update(STATE.assignments, this._normalizeAssignments(raw.assignments)),
      this.context.globalState.update(STATE.projectAssignments, this._normalizeProjectAssignments(raw.projectAssignments)),
      this.context.globalState.update(STATE.aliases, this._normalizeAliases(raw.aliases)),
      this.context.globalState.update(STATE.projectParents, this._normalizeProjectParents(raw.parents)),
      this.context.globalState.update(STATE.projectOrder, this._normalizeProjectOrder(raw.order)),
      this.context.globalState.update(STATE.projectCatalog, this._normalizeProjectCatalog(raw.catalog)),
      this.context.globalState.update(STATE.schemaVersion, CURRENT_STATE_SCHEMA_VERSION),
    ]);
  }

  _groups() {
    return structuredClone(this._normalizeGroups(this.context.globalState.get(STATE.groups, {})));
  }

  _subgroups() {
    return structuredClone(this._normalizeSubgroups(this.context.globalState.get(STATE.subgroups, {})));
  }

  _assignments() {
    return structuredClone(this._normalizeAssignments(this.context.globalState.get(STATE.assignments, {})));
  }

  _projectAssignments() {
    return structuredClone(this._normalizeProjectAssignments(this.context.globalState.get(STATE.projectAssignments, {})));
  }

  _aliases() {
    return structuredClone(this._normalizeAliases(this.context.globalState.get(STATE.aliases, {})));
  }

  _projectParents() {
    return structuredClone(this._normalizeProjectParents(this.context.globalState.get(STATE.projectParents, {})));
  }

  _projectOrder() {
    return structuredClone(this._normalizeProjectOrder(this.context.globalState.get(STATE.projectOrder, [])));
  }

  _projectCatalog() {
    return structuredClone(this._normalizeProjectCatalog(this.context.globalState.get(STATE.projectCatalog, {})));
  }

  _projectChoices() {
    const aliases = this._aliases();
    const projects = new Map();
    for (const [key, remembered] of Object.entries(this._projectCatalog())) {
      projects.set(key, {
        key,
        cwd: remembered.cwd || '',
        label: aliases[key] || remembered.label || projectLabel(remembered.cwd, aliases, t),
        custom: Boolean(remembered.custom),
      });
    }
    for (const thread of [...this.provider.activeThreads, ...this.provider.archivedThreads]) {
      const cwd = thread.originalCwd || thread.cwd || '';
      const key = thread.originalProjectKey || normalizePathKey(cwd);
      if (!projects.has(key)) projects.set(key, { key, cwd, label: projectLabel(cwd, aliases, t) });
    }
    for (const assignment of Object.values(this._projectAssignments())) {
      const cwd = typeof assignment === 'string' ? assignment : assignment?.cwd;
      if (!cwd) continue;
      const key = typeof assignment === 'object' && assignment?.projectKey
        ? assignment.projectKey
        : normalizePathKey(cwd);
      if (!projects.has(key)) projects.set(key, { key, cwd, label: projectLabel(cwd, aliases, t) });
    }
    return [...projects.values()].sort((a, b) => a.label.localeCompare(b.label, vscode.env.language || 'zh-CN'));
  }

  _completeProjectOrder() {
    const current = this._projectOrder();
    const known = [
      ...this.provider.projectKeysInDisplayOrder(),
      ...this._projectChoices().map((item) => item.key),
    ];
    return [...new Set([...current, ...known])];
  }

  _rememberProject(catalog, project) {
    if (!project?.key) return;
    catalog[project.key] = {
      ...(catalog[project.key] || {}),
      key: project.key,
      cwd: project.cwd || catalog[project.key]?.cwd || '',
      label: project.label || catalog[project.key]?.label || project.key,
      custom: Boolean(project.custom || catalog[project.key]?.custom),
    };
  }

  _threadsInGroup(projectKey, groupName) {
    const assignments = this._assignments();
    return applyProjectAssignments(
      [...this.provider.activeThreads, ...this.provider.archivedThreads],
      this._projectAssignments(),
    ).filter((thread) => (
      thread.projectKey === projectKey
      && normalizeGroupAssignment(assignments[thread.id]).group === groupName
    ));
  }

  _targetPlacement(node) {
    const project = node?.project;
    if (!project) return undefined;
    const rawGroupName = node.kind === 'group' || node.kind === 'subgroup'
      ? node.group?.name
      : '';
    const groupName = rawGroupName && rawGroupName !== UNGROUPED ? rawGroupName : '';
    const subgroupName = node.kind === 'subgroup' ? node.subgroup?.name || '' : '';
    const pathParts = [
      project.label,
      node.kind === 'group' && rawGroupName === UNGROUPED ? t('未分组') : groupName,
      subgroupName,
    ].filter(Boolean);
    return {
      project,
      groupName,
      subgroupName,
      label: pathParts.join(' → '),
    };
  }

  async _placeThreads(threads, target) {
    const assignments = this._assignments();
    const projectAssignments = this._projectAssignments();
    for (const thread of threads) {
      const originalProjectKey = thread.originalProjectKey
        || thread.projectKey
        || normalizePathKey(thread.originalCwd || thread.cwd);
      if (target.project.key === originalProjectKey) delete projectAssignments[thread.id];
      else {
        projectAssignments[thread.id] = {
          projectKey: target.project.key,
          cwd: target.project.cwd || thread.originalCwd || thread.cwd || '',
        };
      }
      if (target.groupName) {
        assignments[thread.id] = target.subgroupName
          ? { group: target.groupName, subgroup: target.subgroupName }
          : target.groupName;
      } else delete assignments[thread.id];
    }
    await Promise.all([
      this.context.globalState.update(STATE.assignments, assignments),
      this.context.globalState.update(STATE.projectAssignments, projectAssignments),
    ]);
    this._applyOptions();
  }

  _threadMatchesTarget(thread, target, assignments, projectAssignments) {
    const placed = applyProjectAssignments([thread], projectAssignments)[0];
    const assignment = normalizeGroupAssignment(assignments[thread.id]);
    return placed.projectKey === target.project.key
      && assignment.group === target.groupName
      && assignment.subgroup === target.subgroupName;
  }

  _placedThread(id) {
    const thread = this._findThread(id);
    if (!thread) return undefined;
    return applyProjectAssignments([thread], this._projectAssignments())[0];
  }

  _validateProjectLabel(value) {
    const label = String(value || '').trim();
    if (!label) return t('项目名不能为空');
    if (this._projectChoices().some((project) => project.label === label)) return t('该项目名已存在');
    return undefined;
  }

  async _removeLocalTaskState(threadIds) {
    const assignments = this._assignments();
    const projectAssignments = this._projectAssignments();
    const registeredThreads = structuredClone(this.context.globalState.get(STATE.registeredThreads, {}));
    for (const threadId of Array.isArray(threadIds) ? threadIds : [threadIds]) {
      delete assignments[threadId];
      delete projectAssignments[threadId];
      delete registeredThreads[threadId];
    }
    await Promise.all([
      this.context.globalState.update(STATE.assignments, assignments),
      this.context.globalState.update(STATE.projectAssignments, projectAssignments),
      this.context.globalState.update(STATE.registeredThreads, registeredThreads),
    ]);
  }

  _validateGroupName(projectKey, value) {
    const name = String(value || '').trim();
    if (!name) return t('分组名不能为空');
    if (name === UNGROUPED || name === t('未分组')) return t('该名称为系统保留名称');
    if ((this._groups()[projectKey] || []).includes(name)) return t('该分组已存在');
    return undefined;
  }

  _nextGroupName(projectKey) {
    const existing = new Set(this._groups()[projectKey] || []);
    for (let index = 1; ; index += 1) {
      const candidate = t('分组 {0}', index);
      if (!existing.has(candidate)) return candidate;
    }
  }

  _validateSubgroupName(projectKey, groupName, value) {
    const name = String(value || '').trim();
    if (!name) return t('子分组名不能为空');
    if (name === UNGROUPED || name === t('未分组')) return t('该名称为系统保留名称');
    if ((this._subgroups()[projectKey]?.[groupName] || []).includes(name)) return t('该子分组已存在');
    return undefined;
  }

  _nextSubgroupName(projectKey, groupName) {
    const existing = new Set(this._subgroups()[projectKey]?.[groupName] || []);
    for (let index = 1; ; index += 1) {
      const candidate = t('子分组 {0}', index);
      if (!existing.has(candidate)) return candidate;
    }
  }

  _thread(node) {
    return node?.thread;
  }

  _findThread(id) {
    return [...this.provider.activeThreads, ...this.provider.archivedThreads].find((item) => item.id === id);
  }

  dispose() {
    clearInterval(this.refreshTimer);
    clearTimeout(this.notificationTimer);
    if (this.client) this.client.dispose();
  }
}

module.exports = { NavigatorController, STATE, VIEW_IDS };
