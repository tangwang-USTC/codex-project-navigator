'use strict';

const NATIVE_SCHEME = 'openai-codex';
const NATIVE_AUTHORITY = 'route';
const NATIVE_VIEW_TYPE = 'chatgpt.conversationEditor';

function nativeThreadUriParts(threadId, translate = (message) => message) {
  const id = String(threadId || '').trim();
  if (!id) throw new Error(translate('Codex 任务 ID 不能为空。'));
  return {
    scheme: NATIVE_SCHEME,
    authority: NATIVE_AUTHORITY,
    path: `/local/${id}`,
  };
}

function supportsNativeConversationEditor(codexExtension) {
  const editors = codexExtension?.packageJSON?.contributes?.customEditors;
  return Array.isArray(editors)
    && editors.some((item) => item?.viewType === NATIVE_VIEW_TYPE);
}

async function openNativeThread(vscode, codexExtension, threadId, translate = (message) => message) {
  if (!supportsNativeConversationEditor(codexExtension)) {
    throw new Error(translate('当前官方 Codex 扩展未提供原生会话编辑器。'));
  }
  if (!codexExtension.isActive && typeof codexExtension.activate === 'function') {
    await codexExtension.activate();
  }
  const uri = vscode.Uri.from(nativeThreadUriParts(threadId, translate));
  const viewColumn = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Active;
  await vscode.commands.executeCommand('vscode.openWith', uri, NATIVE_VIEW_TYPE, {
    viewColumn,
    preserveFocus: false,
    preview: false,
  });
  return uri;
}

module.exports = {
  NATIVE_SCHEME,
  NATIVE_AUTHORITY,
  NATIVE_VIEW_TYPE,
  nativeThreadUriParts,
  supportsNativeConversationEditor,
  openNativeThread,
};
