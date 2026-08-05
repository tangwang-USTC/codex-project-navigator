'use strict';

const vscode = require('vscode');
const { t } = require('./localization');
const {
  UNGROUPED,
  applyProjectAssignments,
  buildProjectBuckets,
  buildProjectHierarchy,
  filterThreads,
  flattenProjectHierarchy,
  sortThreads,
  sortThreadsByRecency,
} = require('./model');

const TREE_MIME = 'application/vnd.code.tree.codexprojectnavigator';

class NavigatorTreeProvider {
  constructor() {
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
    this.activeThreads = [];
    this.archivedThreads = [];
    this.searchQuery = '';
    this.loading = true;
    this.error = undefined;
    this.options = {
      groupingDepth: 3,
      recentLimit: 7,
      groups: {},
      subgroups: {},
      assignments: {},
      projectAssignments: {},
      aliases: {},
      projectParents: {},
      projectOrder: [],
      projectCatalog: {},
      t,
    };
    this.dragMimeTypes = [TREE_MIME];
    this.dropMimeTypes = [TREE_MIME];
    this.dropHandler = undefined;
  }

  setDropHandler(handler) {
    this.dropHandler = handler;
  }

  handleDrag(source, dataTransfer) {
    const element = source.find((item) => (
      item?.kind === 'task'
      || item?.kind === 'project'
      || (item?.kind === 'group' && item.group?.name !== UNGROUPED)
      || item?.kind === 'subgroup'
    ));
    if (!element) return;
    let payload;
    if (element.kind === 'task') {
      payload = { kind: 'task', threadId: element.thread.id, scope: element.scope };
    } else if (element.kind === 'project') {
      payload = { kind: 'project', projectKey: element.project.key, scope: element.scope };
    } else {
      const group = element.kind === 'subgroup' ? element.subgroup : element.group;
      payload = {
        kind: 'group',
        projectKey: element.project.key,
        groupName: group.name,
        groupPath: group.path || [group.name],
        scope: element.scope,
      };
    }
    dataTransfer.set(TREE_MIME, new vscode.DataTransferItem(JSON.stringify(payload)));
  }

  async handleDrop(target, dataTransfer) {
    const item = dataTransfer.get(TREE_MIME);
    if (!item || !this.dropHandler) return;
    const payload = JSON.parse(await item.asString());
    await this.dropHandler(payload, target);
  }

  updateData(activeThreads, archivedThreads) {
    this.activeThreads = activeThreads;
    this.archivedThreads = archivedThreads;
    this.loading = false;
    this.error = undefined;
    this.refresh();
  }

  updateOptions(options) {
    this.options = { ...this.options, ...options };
    this.refresh();
  }

  setLoading(loading) {
    this.loading = loading;
    this.refresh();
  }

  setError(error) {
    this.loading = false;
    this.error = error instanceof Error ? error.message : String(error);
    this.refresh();
  }

  setSearchQuery(query) {
    this.searchQuery = String(query || '').trim();
    this.refresh();
  }

  refresh(element) {
    this.emitter.fire(element);
  }

  getTreeItem(element) {
    if (element.kind === 'message') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(element.icon || 'info');
      item.contextValue = 'message';
      return item;
    }

    if (element.kind === 'root') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon(element.icon);
      item.contextValue = `root.${element.rootType}`;
      item.description = element.count === undefined ? undefined : String(element.count);
      return item;
    }

    if (element.kind === 'project') {
      const item = new vscode.TreeItem(element.project.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `${element.scope}:project:${element.project.key}`;
      item.iconPath = new vscode.ThemeIcon(element.archived ? 'folder' : 'root-folder');
      item.description = element.project.totalThreads === element.project.threads.length
        ? String(element.project.threads.length)
        : `${element.project.threads.length}/${element.project.totalThreads}`;
      item.tooltip = element.project.parentKey
        ? t('{0}\nNavigator 子项目；任务工作目录未改变', element.project.cwd || t('无项目目录'))
        : element.project.cwd || t('无项目目录');
      item.contextValue = element.project.parentKey ? 'project.nested' : 'project.root';
      return item;
    }

    if (element.kind === 'group') {
      const label = element.group.name === UNGROUPED ? t('未分组') : element.group.name;
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `${element.scope}:group:${element.project.key}:${(element.group.path || [element.group.name]).join(':')}`;
      item.iconPath = new vscode.ThemeIcon(element.group.name === UNGROUPED ? 'inbox' : 'folder');
      item.description = String(element.group.totalThreads ?? element.group.threads.length);
      item.contextValue = element.group.name === UNGROUPED ? 'group.ungrouped' : 'group';
      return item;
    }

    if (element.kind === 'subgroup') {
      const item = new vscode.TreeItem(element.subgroup.name, vscode.TreeItemCollapsibleState.Expanded);
      item.id = `${element.scope}:subgroup:${element.project.key}:${element.subgroup.path.join(':')}`;
      item.iconPath = new vscode.ThemeIcon('folder');
      item.description = String(element.subgroup.totalThreads ?? element.subgroup.threads.length);
      item.contextValue = 'subgroup';
      return item;
    }

    const thread = element.thread;
    const item = new vscode.TreeItem(thread.title, vscode.TreeItemCollapsibleState.None);
    item.id = `${element.scope}:${thread.id}`;
    item.iconPath = new vscode.ThemeIcon(
      thread.archived ? 'archive' : thread.isPinned ? 'star-full' : 'comment-discussion',
    );
    item.description = this._taskDescription(thread, element.scope);
    item.tooltip = this._taskTooltip(thread);
    item.contextValue = thread.archived
      ? 'task.archived.item'
      : thread.localOnly
        ? 'task.active.localOnly'
        : `task.active.${thread.isPinned ? 'pinned' : 'unpinned'}`;
    item.command = {
      command: 'codexProjectNavigator.openTask',
      title: t('打开任务'),
      arguments: [element],
    };
    return item;
  }

  getChildren(element) {
    if (!element) return this._getRoots();
    if (element.kind === 'root') return this._getRootChildren(element);
    if (element.kind === 'project') return this._getProjectChildren(element);
    if (element.kind === 'group') return this._getGroupChildren(element);
    if (element.kind === 'subgroup') return this._getGroupChildren(element);
    return [];
  }

  _getRoots() {
    const roots = [];
    if (this.error) {
      roots.push({ kind: 'message', label: t('连接失败：{0}', this.error), icon: 'error' });
    } else if (this.loading && this.activeThreads.length === 0) {
      roots.push({ kind: 'message', label: t('正在读取 Codex 任务…'), icon: 'loading~spin' });
    }

    const all = [...this.activeThreads, ...this.archivedThreads];
    if (this.searchQuery) {
      roots.push(this._root('search', t('搜索：{0}', this.searchQuery), 'search',
        filterThreads(
          all,
          this.searchQuery,
          this.options.aliases,
          this.options.assignments,
          this.options.projectAssignments,
        ).length));
    }
    roots.push(this._root('recent', t('最近'), 'history', Math.min(this.activeThreads.length, this.options.recentLimit)));
    roots.push(this._root('pinned', t('置顶'), 'star-full', this.activeThreads.filter((item) => item.isPinned).length));
    roots.push(this._root(
      'projects',
      t('项目'),
      'folder-library',
      flattenProjectHierarchy(this._projects(this.activeThreads)).length,
    ));
    roots.push(this._root('archived', t('已归档'), 'archive', this.archivedThreads.length));
    return roots;
  }

  _getRootChildren(root) {
    switch (root.rootType) {
      case 'search':
        return filterThreads(
          [...this.activeThreads, ...this.archivedThreads],
          this.searchQuery,
          this.options.aliases,
          this.options.assignments,
          this.options.projectAssignments,
        ).map((thread) => this._taskNode(thread, 'search'));
      case 'recent':
        return sortThreadsByRecency(applyProjectAssignments(
          this.activeThreads,
          this.options.projectAssignments,
        ))
          .slice(0, this.options.recentLimit)
          .map((thread) => this._taskNode(thread, 'recent'));
      case 'pinned':
        return sortThreads(applyProjectAssignments(
          this.activeThreads,
          this.options.projectAssignments,
        ).filter((thread) => thread.isPinned))
          .map((thread) => this._taskNode(thread, 'pinned'));
      case 'projects':
        return this._projects(this.activeThreads).map((project) => this._projectNode(
          project,
          false,
          'project',
        ));
      case 'archived':
        return sortThreadsByRecency(this.archivedThreads)
          .map((thread) => this._taskNode(thread, 'archived'));
      default:
        return [];
    }
  }

  _getProjectChildren(node) {
    const children = (node.project.childProjects || []).map((project) => this._projectNode(
      project,
      node.archived,
      node.scope,
    ));
    if (Number(this.options.groupingDepth) === 2) {
      return [
        ...children,
        ...node.project.threads.map((thread) => this._taskNode(thread, node.scope, {
          project: node.project,
          groupPath: [],
        })),
      ];
    }
    return [
      ...children,
      ...node.project.threads.map((thread) => this._taskNode(thread, node.scope, {
        project: node.project,
        groupPath: [],
      })),
      ...node.project.groups.map((group) => ({
        kind: 'group',
        group,
        project: node.project,
        archived: node.archived,
        scope: node.scope,
      })),
    ];
  }

  _getGroupChildren(node) {
    const current = node.kind === 'subgroup' ? node.subgroup : node.group;
    const subgroups = (current.children || current.subgroups || []).map((subgroup) => ({
        kind: 'subgroup',
        subgroup,
        group: current,
        project: node.project,
        archived: node.archived,
        scope: node.scope,
      }));
    return [
      ...subgroups,
      ...current.threads.map((thread) => this._taskNode(thread, node.scope, {
        project: node.project,
        groupPath: current.path || [current.name],
      })),
    ];
  }

  _projects(threads) {
    return buildProjectHierarchy(buildProjectBuckets(threads, this.options), this.options);
  }

  _projectNode(project, archived, scope) {
    return { kind: 'project', project, archived, scope };
  }

  projectKeysInDisplayOrder() {
    const keys = [];
    for (const project of [
      ...flattenProjectHierarchy(this._projects(this.activeThreads)),
      ...flattenProjectHierarchy(this._projects(this.archivedThreads)),
    ]) {
      if (!keys.includes(project.key)) keys.push(project.key);
    }
    return keys;
  }

  projectSiblings(projectKey, scope = 'project') {
    const threads = scope === 'archived' ? this.archivedThreads : this.activeThreads;
    const find = (items) => {
      if (items.some((item) => item.key === projectKey)) return items.map((item) => item.key);
      for (const item of items) {
        const result = find(item.childProjects || []);
        if (result) return result;
      }
      return undefined;
    };
    return find(this._projects(threads)) || [];
  }

  _root(rootType, label, icon, count) {
    return { kind: 'root', rootType, label, icon, count };
  }

  _taskNode(thread, scope, placement = {}) {
    return { kind: 'task', thread, scope, ...placement };
  }

  _taskDescription(thread, scope) {
    const age = relativeTime(thread.timestamp);
    if (thread.localOnly) return t('{0} · 本机未验证', age);
    if (['recent', 'pinned', 'search'].includes(scope)) {
      const project = this.options.aliases[thread.projectKey]
        || (thread.navigationCwd ? require('path').basename(thread.navigationCwd) : t('无项目'));
      return t('{0} · {1}', project, age);
    }
    return age;
  }

  _taskTooltip(thread) {
    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.appendMarkdown(`**${escapeMarkdown(thread.title)}**\n\n`);
    markdown.appendMarkdown(t('导航归属：{0}  \n', escapeMarkdown(thread.navigationCwd || thread.cwd || t('无项目目录'))));
    if (thread.projectMoved) {
      markdown.appendMarkdown(t('原始工作目录：{0}  \n', escapeMarkdown(thread.originalCwd || t('无项目目录'))));
      markdown.appendMarkdown(t('说明：跨项目移动只改变 Navigator 层级，不修改 Codex thread 的原始工作目录。  \n'));
    }
    markdown.appendMarkdown(t('任务 ID：`{0}`  \n', thread.id));
    if (thread.sourceLabel) markdown.appendMarkdown(t('来源：{0}  \n', escapeMarkdown(thread.sourceLabel)));
    markdown.appendMarkdown(t('状态：{0}', thread.archived ? t('已归档') : thread.localOnly ? t('本机未验证') : thread.isPinned ? t('已置顶') : t('活跃')));
    if (thread.localOnly) {
      markdown.appendMarkdown(t('  \n说明：此记录不在 Codex App Server 列表中；可右键移除 Navigator 本地记录。'));
    }
    return markdown;
  }
}

function relativeTime(timestamp) {
  const delta = Math.max(0, Date.now() - Number(timestamp || 0));
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return t('刚刚');
  if (minutes < 60) return t('{0} 分钟前', minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('{0} 小时前', hours);
  const days = Math.floor(hours / 24);
  if (days < 30) return t('{0} 天前', days);
  return new Date(timestamp).toLocaleDateString(vscode.env.language || 'zh-CN');
}

function escapeMarkdown(value) {
  return String(value).replace(/[\\`*_{}\[\]()<>#+\-.!|]/g, '\\$&');
}

module.exports = { NavigatorTreeProvider, TREE_MIME, relativeTime, escapeMarkdown };
