'use strict';

const path = require('path');

const UNGROUPED = '__ungrouped__';
const NO_PROJECT = '__no_project__';
const ROOT_PROJECT = '__root_projects__';

function normalizePathKey(value) {
  if (!value) return NO_PROJECT;
  const normalized = path.normalize(value).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function toMillis(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function threadTimestamp(thread) {
  return toMillis(thread.recencyAt ?? thread.updatedAt ?? thread.createdAt);
}

function threadTitle(thread, translate = (message) => message) {
  const title = String(thread.name || thread.preview || thread.id || translate('未命名任务')).trim().replace(/\s+/g, ' ');
  return title.length > 160 ? `${title.slice(0, 157)}…` : title;
}

function sourceLabel(source) {
  if (typeof source === 'string') return source;
  if (source?.custom) return source.custom;
  if (source?.subAgent) return 'subAgent';
  return 'unknown';
}

function projectLabel(cwd, aliases = {}, translate = (message) => message) {
  const key = normalizePathKey(cwd);
  if (aliases[key]) return aliases[key];
  if (!cwd) return translate('无项目目录');
  return path.basename(path.normalize(cwd)) || cwd;
}

function normalizeThread(raw, options = {}) {
  const cwd = raw.cwd || '';
  return {
    ...raw,
    id: String(raw.id),
    cwd,
    projectKey: normalizePathKey(cwd),
    title: threadTitle(raw, options.t),
    timestamp: threadTimestamp(raw),
    archived: Boolean(options.archived ?? raw.archived),
    isPinned: Boolean(raw.isPinned),
    sourceLabel: sourceLabel(raw.source),
  };
}

function sortThreads(threads) {
  return [...threads].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    return a.title.localeCompare(b.title, 'zh-CN');
  });
}

function sortThreadsByRecency(threads) {
  return [...threads].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    return a.title.localeCompare(b.title, 'zh-CN');
  });
}

function resolveProjectPlacement(thread, projectAssignments = {}) {
  const originalProjectKey = thread.originalProjectKey || thread.projectKey || normalizePathKey(thread.cwd);
  const originalCwd = thread.originalCwd ?? thread.cwd ?? '';
  const assignment = projectAssignments[thread.id];
  const targetCwd = typeof assignment === 'string'
    ? assignment
    : assignment?.cwd;
  const targetKey = typeof assignment === 'object' && assignment?.projectKey
    ? assignment.projectKey
    : normalizePathKey(targetCwd);
  if (!assignment || !targetKey || targetKey === originalProjectKey) {
    return {
      ...thread,
      projectKey: originalProjectKey,
      originalProjectKey,
      originalCwd,
      navigationCwd: originalCwd,
      projectMoved: false,
    };
  }
  return {
    ...thread,
    projectKey: targetKey,
    originalProjectKey,
    originalCwd,
    navigationCwd: targetCwd || originalCwd,
    projectMoved: true,
  };
}

function applyProjectAssignments(threads, projectAssignments = {}) {
  return threads.map((thread) => resolveProjectPlacement(thread, projectAssignments));
}

function normalizeGroupAssignment(value) {
  if (typeof value === 'string') {
    return value ? { group: value, subgroup: '' } : { group: '', subgroup: '' };
  }
  if (!value || typeof value !== 'object') return { group: '', subgroup: '' };
  return {
    group: String(value.group || ''),
    subgroup: String(value.subgroup || ''),
  };
}

function groupAssignmentLabel(value) {
  const assignment = normalizeGroupAssignment(value);
  return [assignment.group, assignment.subgroup].filter(Boolean).join(' / ');
}

function collectThreadFamilyIds(threads, rootId) {
  const ids = new Set([String(rootId)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const thread of threads) {
      const id = String(thread.id);
      const parentId = thread.parentThreadId || thread.forkedFromId;
      if (parentId && ids.has(String(parentId)) && !ids.has(id)) {
        ids.add(id);
        changed = true;
      }
    }
  }
  return [...ids];
}

function filterThreads(threads, query, aliases = {}, assignments = {}, projectAssignments = {}) {
  const placed = applyProjectAssignments(threads, projectAssignments);
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return sortThreads(placed);
  return sortThreads(placed.filter((thread) => {
    const fields = [
      thread.title,
      thread.id,
      thread.cwd,
      thread.navigationCwd,
      aliases[thread.projectKey],
      projectLabel(thread.navigationCwd, aliases),
      groupAssignmentLabel(assignments[thread.id]),
      thread.sourceLabel,
    ];
    return fields.some((field) => String(field || '').toLocaleLowerCase().includes(needle));
  }));
}

function buildProjectBuckets(threads, options = {}) {
  const requestedDepth = Number(options.groupingDepth);
  const groupingDepth = [2, 3, 4].includes(requestedDepth) ? requestedDepth : 3;
  const aliases = options.aliases || {};
  const groups = options.groups || {};
  const subgroups = options.subgroups || {};
  const assignments = options.assignments || {};
  const projectAssignments = options.projectAssignments || {};
  const projects = new Map();

  for (const thread of sortThreads(applyProjectAssignments(threads, projectAssignments))) {
    let project = projects.get(thread.projectKey);
    if (!project) {
      project = {
        key: thread.projectKey,
        cwd: thread.navigationCwd,
        label: aliases[thread.projectKey] || projectLabel(thread.navigationCwd, aliases, options.t),
        threads: [],
        groups: [],
      };
      projects.set(thread.projectKey, project);
    }
    project.threads.push(thread);
  }

  const output = [...projects.values()].sort((a, b) => {
    const timeA = Math.max(0, ...a.threads.map((item) => item.timestamp));
    const timeB = Math.max(0, ...b.threads.map((item) => item.timestamp));
    return timeB - timeA || a.label.localeCompare(b.label, 'zh-CN');
  });

  if (groupingDepth >= 3) {
    for (const project of output) {
      const configured = Array.isArray(groups[project.key]) ? groups[project.key] : [];
      const names = [...new Set(configured.filter(Boolean))];
      const configuredSubgroups = subgroups[project.key] || {};
      const groupMap = new Map(names.map((name) => {
        const childNames = Array.isArray(configuredSubgroups[name])
          ? [...new Set(configuredSubgroups[name].filter(Boolean))]
          : [];
        return [name, {
          name,
          threads: [],
          subgroups: childNames.map((childName) => ({ name: childName, threads: [] })),
          totalThreads: 0,
        }];
      }));
      groupMap.set(UNGROUPED, {
        name: UNGROUPED,
        threads: [],
        subgroups: [],
        totalThreads: 0,
      });
      for (const thread of project.threads) {
        const assignment = normalizeGroupAssignment(assignments[thread.id]);
        const target = assignment.group && groupMap.has(assignment.group)
          ? assignment.group
          : UNGROUPED;
        const group = groupMap.get(target);
        const subgroup = groupingDepth === 4 && assignment.subgroup
          ? group.subgroups.find((item) => item.name === assignment.subgroup)
          : undefined;
        if (subgroup) subgroup.threads.push(thread);
        else group.threads.push(thread);
      }
      project.groups = [...names.map((name) => groupMap.get(name)), groupMap.get(UNGROUPED)]
        .filter((group) => group.name !== UNGROUPED || group.threads.length > 0);
      for (const group of project.groups) {
        group.totalThreads = group.threads.length
          + group.subgroups.reduce((sum, subgroup) => sum + subgroup.threads.length, 0);
      }
    }
  }
  return output;
}

function wouldCreateProjectCycle(projectKey, targetParentKey, parents = {}) {
  if (!targetParentKey) return false;
  if (projectKey === targetParentKey) return true;
  const seen = new Set([projectKey]);
  let current = targetParentKey;
  while (current) {
    if (seen.has(current)) return true;
    seen.add(current);
    current = parents[current];
  }
  return false;
}

function buildProjectHierarchy(projects, options = {}) {
  const parents = options.projectParents || {};
  const order = Array.isArray(options.projectOrder) ? options.projectOrder : [];
  const catalog = options.projectCatalog || {};
  const orderIndex = new Map(order.map((key, index) => [key, index]));
  const fallbackIndex = new Map(projects.map((project, index) => [project.key, index]));
  const nodes = new Map(projects.map((project) => [project.key, {
    ...project,
    childProjects: [],
    parentKey: undefined,
    totalThreads: project.threads.length,
  }]));

  for (const project of projects) {
    const seen = new Set([project.key]);
    let parentKey = parents[project.key];
    while (parentKey && !seen.has(parentKey)) {
      seen.add(parentKey);
      if (!nodes.has(parentKey)) {
        const remembered = catalog[parentKey];
        if (!remembered) break;
        nodes.set(parentKey, {
          key: parentKey,
          cwd: remembered.cwd || '',
          label: remembered.label || projectLabel(remembered.cwd || '', {}, options.t),
          threads: [],
          groups: [],
          childProjects: [],
          parentKey: undefined,
          totalThreads: 0,
        });
      }
      parentKey = parents[parentKey];
    }
  }

  const compare = (a, b) => {
    const orderedA = orderIndex.has(a.key);
    const orderedB = orderIndex.has(b.key);
    if (orderedA && orderedB) return orderIndex.get(a.key) - orderIndex.get(b.key);
    if (orderedA !== orderedB) return orderedA ? -1 : 1;
    const fallbackA = fallbackIndex.get(a.key) ?? Number.MAX_SAFE_INTEGER;
    const fallbackB = fallbackIndex.get(b.key) ?? Number.MAX_SAFE_INTEGER;
    return fallbackA - fallbackB || a.label.localeCompare(b.label, 'zh-CN');
  };

  const roots = [];
  for (const node of nodes.values()) {
    const parentKey = parents[node.key];
    if (
      parentKey
      && nodes.has(parentKey)
      && !wouldCreateProjectCycle(node.key, parentKey, parents)
    ) {
      node.parentKey = parentKey;
      nodes.get(parentKey).childProjects.push(node);
    } else {
      roots.push(node);
    }
  }

  const annotate = (items) => {
    items.sort(compare);
    for (const item of items) {
      annotate(item.childProjects);
      item.totalThreads = item.threads.length
        + item.childProjects.reduce((sum, child) => sum + child.totalThreads, 0);
    }
  };
  annotate(roots);
  return roots;
}

function flattenProjectHierarchy(projects) {
  const output = [];
  const visit = (items) => {
    for (const item of items) {
      output.push(item);
      visit(item.childProjects || []);
    }
  };
  visit(projects);
  return output;
}

module.exports = {
  UNGROUPED,
  NO_PROJECT,
  ROOT_PROJECT,
  normalizePathKey,
  toMillis,
  threadTimestamp,
  threadTitle,
  sourceLabel,
  projectLabel,
  normalizeThread,
  sortThreads,
  sortThreadsByRecency,
  resolveProjectPlacement,
  applyProjectAssignments,
  normalizeGroupAssignment,
  groupAssignmentLabel,
  collectThreadFamilyIds,
  filterThreads,
  buildProjectBuckets,
  wouldCreateProjectCycle,
  buildProjectHierarchy,
  flattenProjectHierarchy,
};
