'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  UNGROUPED,
  normalizePathKey,
  normalizeThread,
  sortThreads,
  sortThreadsByRecency,
  collectThreadFamilyIds,
  filterThreads,
  buildProjectBuckets,
  buildProjectHierarchy,
  flattenProjectHierarchy,
  wouldCreateProjectCycle,
  normalizeGroupAssignment,
  groupAssignmentLabel,
} = require('../src/model');

test('normalizeThread derives project, title, timestamp and archive state', () => {
  const thread = normalizeThread({
    id: 't1',
    cwd: 'C:\\Work\\Alpha',
    preview: '  first   task  ',
    updatedAt: 1_700_000_000,
    isPinned: true,
  }, { archived: false });

  assert.equal(thread.projectKey, normalizePathKey('C:\\Work\\Alpha'));
  assert.equal(thread.title, 'first task');
  assert.equal(thread.timestamp, 1_700_000_000_000);
  assert.equal(thread.isPinned, true);
  assert.equal(thread.archived, false);
});

test('sortThreads puts pinned first then orders by recency', () => {
  const items = [
    { id: 'old', title: 'old', timestamp: 1, isPinned: false },
    { id: 'new', title: 'new', timestamp: 3, isPinned: false },
    { id: 'pin', title: 'pin', timestamp: 2, isPinned: true },
  ];
  assert.deepEqual(sortThreads(items).map((item) => item.id), ['pin', 'new', 'old']);
});

test('sortThreadsByRecency keeps Recent independent from pinned state', () => {
  const items = [
    { id: 'old-pin', title: 'old', timestamp: 1, isPinned: true },
    { id: 'new', title: 'new', timestamp: 3, isPinned: false },
    { id: 'middle', title: 'middle', timestamp: 2, isPinned: false },
  ];
  assert.deepEqual(sortThreadsByRecency(items).map((item) => item.id), ['new', 'middle', 'old-pin']);
});

test('filterThreads searches project alias, path, group and task fields', () => {
  const projectKey = normalizePathKey('C:\\Work\\Alpha');
  const threads = [normalizeThread({ id: 't1', cwd: 'C:\\Work\\Alpha', name: 'Literature review' })];
  assert.equal(filterThreads(threads, '文献项目', { [projectKey]: '文献项目' }, {}).length, 1);
  assert.equal(filterThreads(threads, 'methods', {}, { t1: 'Methods' }).length, 1);
  assert.equal(filterThreads(threads, 'missing', {}, {}).length, 0);
});

test('buildProjectBuckets supports two levels and optional custom groups', () => {
  const threads = [
    normalizeThread({ id: 't1', cwd: 'C:\\Work\\Alpha', name: 'One', updatedAt: 3 }),
    normalizeThread({ id: 't2', cwd: 'C:\\Work\\Alpha', name: 'Two', updatedAt: 2 }),
  ];
  const key = threads[0].projectKey;

  const twoLevel = buildProjectBuckets(threads, { groupingDepth: 2 });
  assert.equal(twoLevel.length, 1);
  assert.equal(twoLevel[0].threads.length, 2);
  assert.deepEqual(twoLevel[0].groups, []);

  const threeLevel = buildProjectBuckets(threads, {
    groupingDepth: 3,
    groups: { [key]: ['Research'] },
    assignments: { t1: 'Research' },
  });
  assert.deepEqual(threeLevel[0].groups.map((group) => group.name), ['Research']);
  assert.deepEqual(threeLevel[0].groups[0].threads.map((thread) => thread.id), ['t1']);
  assert.deepEqual(threeLevel[0].threads.map((thread) => thread.id), ['t2']);
});

test('four-level grouping adds subgroups and keeps legacy assignments compatible', () => {
  const threads = [
    normalizeThread({ id: 'direct', cwd: 'C:\\Work\\Alpha', name: 'Direct' }),
    normalizeThread({ id: 'nested', cwd: 'C:\\Work\\Alpha', name: 'Nested' }),
    normalizeThread({ id: 'legacy', cwd: 'C:\\Work\\Alpha', name: 'Legacy' }),
  ];
  const key = threads[0].projectKey;
  const options = {
    groups: { [key]: ['Research'] },
    subgroups: { [key]: { Research: ['Methods'] } },
    assignments: {
      direct: 'Research',
      nested: { group: 'Research', subgroup: 'Methods' },
      legacy: 'Research',
    },
  };
  const fourLevel = buildProjectBuckets(threads, { ...options, groupingDepth: 4 });
  const group = fourLevel[0].groups[0];
  assert.deepEqual(group.threads.map((item) => item.id).sort(), ['direct', 'legacy']);
  assert.deepEqual(group.subgroups[0].threads.map((item) => item.id), ['nested']);
  assert.equal(group.totalThreads, 3);

  const threeLevel = buildProjectBuckets(threads, { ...options, groupingDepth: 3 });
  assert.deepEqual(threeLevel[0].groups[0].threads.map((item) => item.id).sort(), ['direct', 'legacy']);
  assert.deepEqual(threeLevel[0].groups[0].children[0].threads.map((item) => item.id), ['nested']);
  assert.deepEqual(normalizeGroupAssignment('Research'), {
    group: 'Research',
    subgroup: '',
    path: ['Research'],
  });
  assert.equal(groupAssignmentLabel({ group: 'Research', subgroup: 'Methods' }), 'Research / Methods');
});

test('project assignment moves only the Navigator bucket and preserves original cwd', () => {
  const thread = normalizeThread({ id: 't1', cwd: 'C:\\Work\\Original', name: 'Move me' });
  const targetKey = normalizePathKey('D:\\Workspace\\Destination');
  const projects = buildProjectBuckets([thread], {
    groupingDepth: 3,
    groups: { [targetKey]: ['System Build'] },
    assignments: { t1: 'System Build' },
    projectAssignments: {
      t1: { projectKey: targetKey, cwd: 'D:\\Workspace\\Destination' },
    },
  });

  assert.equal(projects.length, 1);
  assert.equal(projects[0].key, targetKey);
  assert.equal(projects[0].cwd, 'D:\\Workspace\\Destination');
  assert.deepEqual(projects[0].groups[0].threads.map((item) => item.id), ['t1']);
  assert.equal(projects[0].groups[0].threads[0].cwd, 'C:\\Work\\Original');
  assert.equal(projects[0].groups[0].threads[0].projectMoved, true);
});

test('filterThreads finds a task by its Navigator target project', () => {
  const thread = normalizeThread({ id: 't1', cwd: 'C:\\Work\\Original', name: 'Move me' });
  const targetKey = normalizePathKey('D:\\Workspace\\Destination');
  const result = filterThreads(
    [thread],
    'Destination System',
    { [targetKey]: 'Destination System' },
    {},
    { t1: { projectKey: targetKey, cwd: 'D:\\Workspace\\Destination' } },
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].projectKey, targetKey);
});

test('collectThreadFamilyIds includes known nested descendants for local-state cleanup', () => {
  const threads = [
    { id: 'root' },
    { id: 'child', parentThreadId: 'root' },
    { id: 'fork', forkedFromId: 'child' },
    { id: 'other', parentThreadId: 'missing' },
  ];
  assert.deepEqual(collectThreadFamilyIds(threads, 'root').sort(), ['child', 'fork', 'root']);
});

test('project hierarchy supports manual order, nesting and remembered empty parents', () => {
  const projects = [
    { key: 'a', cwd: 'A', label: 'A', threads: [{ id: 'a1' }], groups: [] },
    { key: 'b', cwd: 'B', label: 'B', threads: [{ id: 'b1' }], groups: [] },
    { key: 'c', cwd: 'C', label: 'C', threads: [{ id: 'c1' }], groups: [] },
  ];
  const hierarchy = buildProjectHierarchy(projects, {
    projectParents: { b: 'a' },
    projectOrder: ['c', 'a', 'b'],
  });
  assert.deepEqual(hierarchy.map((item) => item.key), ['c', 'a']);
  assert.deepEqual(hierarchy[1].childProjects.map((item) => item.key), ['b']);
  assert.equal(hierarchy[1].totalThreads, 2);
  assert.deepEqual(flattenProjectHierarchy(hierarchy).map((item) => item.key), ['c', 'a', 'b']);

  const rememberedParent = buildProjectHierarchy([projects[1]], {
    projectParents: { b: 'a' },
    projectCatalog: { a: { cwd: 'A', label: 'A' } },
  });
  assert.equal(rememberedParent[0].key, 'a');
  assert.equal(rememberedParent[0].threads.length, 0);
  assert.equal(rememberedParent[0].childProjects[0].key, 'b');
});

test('project hierarchy rejects self and descendant cycles', () => {
  assert.equal(wouldCreateProjectCycle('a', 'a', {}), true);
  assert.equal(wouldCreateProjectCycle('a', 'c', { b: 'a', c: 'b' }), true);
  assert.equal(wouldCreateProjectCycle('c', 'a', { b: 'a' }), false);
});

test('custom Navigator projects can organize tasks without a working directory', () => {
  const thread = normalizeThread({ id: 't1', cwd: '', name: 'No cwd' });
  const projects = buildProjectBuckets([thread], {
    projectAssignments: { t1: { projectKey: 'navigator:custom', cwd: '' } },
    aliases: { 'navigator:custom': '项目 C' },
  });
  assert.equal(projects[0].key, 'navigator:custom');
  assert.equal(projects[0].label, '项目 C');
  assert.equal(projects[0].threads[0].cwd, '');
  assert.equal(projects[0].threads[0].projectMoved, true);
});
