'use strict';

const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const readline = require('readline');

function isThreadActivityNotification(method) {
  const name = String(method || '');
  return name.startsWith('thread/') || name === 'turn/started' || name === 'turn/completed';
}

class AppServerClient extends EventEmitter {
  constructor(executable, options = {}) {
    super();
    this.executable = executable;
    this.spawnFactory = options.spawnFactory || spawn;
    this.requestTimeoutMs = options.requestTimeoutMs || 15000;
    this.log = options.log || (() => {});
    this.translate = options.translate || ((message) => message);
    this.clientInfo = options.clientInfo || {
      name: 'codex_project_navigator',
      title: 'Codex Project Navigator',
      version: '1.0.0',
    };
    this.process = undefined;
    this.lines = undefined;
    this.pending = new Map();
    this.nextId = 1;
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;
    this.process = this.spawnFactory(this.executable, ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });

    this.process.on('error', (error) => this._failAll(error));
    this.process.on('exit', (code, signal) => {
      this.connected = false;
      this._failAll(new Error(this.translate('Codex App Server 已退出（code={0}, signal={1}）', code, signal)));
      this.emit('exit', { code, signal });
    });
    this.process.stderr.on('data', (chunk) => this.log(String(chunk).trimEnd()));
    this.lines = readline.createInterface({ input: this.process.stdout });
    this.lines.on('line', (line) => this._handleLine(line));

    await this.request('initialize', {
      clientInfo: this.clientInfo,
    });
    this.notify('initialized', {});
    this.connected = true;
  }

  request(method, params = {}) {
    if (!this.process || !this.process.stdin.writable) {
      return Promise.reject(new Error(this.translate('Codex App Server 尚未连接')));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(this.translate('{0} 请求超时', method)));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timeout, method });
      this._write({ id, method, params });
    });
  }

  notify(method, params = {}) {
    if (this.process?.stdin?.writable) this._write({ method, params });
  }

  async listThreads({ archived = false, sourceKinds, maxTasks = 2000 } = {}) {
    const collected = [];
    let cursor;
    let sortKey = 'recency_at';
    let retriedSortKey = false;

    while (collected.length < maxTasks) {
      const params = {
        archived,
        limit: Math.min(100, maxTasks - collected.length),
        sortKey,
        sortDirection: 'desc',
      };
      if (cursor) params.cursor = cursor;
      if (Array.isArray(sourceKinds) && sourceKinds.length) params.sourceKinds = sourceKinds;

      let response;
      try {
        response = await this.request('thread/list', params);
      } catch (error) {
        if (!retriedSortKey && sortKey === 'recency_at') {
          retriedSortKey = true;
          sortKey = 'updated_at';
          cursor = undefined;
          collected.length = 0;
          continue;
        }
        throw error;
      }

      const items = response?.data || [];
      collected.push(...items);
      const nextCursor = response?.nextCursor;
      if (!nextCursor || nextCursor === cursor || items.length === 0) break;
      cursor = nextCursor;
    }
    return collected.slice(0, maxTasks);
  }

  renameThread(threadId, name) {
    return this.request('thread/name/set', { threadId, name });
  }

  async startThread({ cwd } = {}) {
    const params = {};
    if (cwd) params.cwd = cwd;
    const response = await this.request('thread/start', params);
    const thread = response?.thread;
    if (!thread?.id) throw new Error(this.translate('Codex App Server 未返回新任务 ID'));
    return thread;
  }

  setPinned(threadId, isPinned) {
    return this.request('thread/metadata/update', { threadId, isPinned });
  }

  archiveThread(threadId) {
    return this.request('thread/archive', { threadId });
  }

  unarchiveThread(threadId) {
    return this.request('thread/unarchive', { threadId });
  }

  deleteThread(threadId) {
    return this.request('thread/delete', { threadId });
  }

  dispose() {
    this.connected = false;
    if (this.lines) this.lines.close();
    if (this.process && !this.process.killed) this.process.kill();
    this._failAll(new Error(this.translate('Codex App Server 客户端已关闭')));
  }

  _write(message) {
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  _handleLine(line) {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      this.log(this.translate('无法解析 App Server 输出：{0}', line));
      return;
    }

    if (Object.prototype.hasOwnProperty.call(message, 'id') && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      clearTimeout(pending.timeout);
      this.pending.delete(message.id);
      if (message.error) {
        const detail = message.error.message || JSON.stringify(message.error);
        pending.reject(new Error(`${pending.method}: ${detail}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (Object.prototype.hasOwnProperty.call(message, 'id') && message.method) {
      this._write({
        id: message.id,
        error: { code: -32601, message: `Unsupported server request: ${message.method}` },
      });
      return;
    }

    if (message.method) this.emit('notification', message);
  }

  _failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

module.exports = { AppServerClient, isThreadActivityNotification };
