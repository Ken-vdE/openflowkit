import { inlineNodeAssetsForTransfer } from './assetInlining';
import { localFirstRepository } from './localFirstRepository';
import type { PersistedDocument, PersistedDocumentContent } from './persistenceTypes';

export const V1_BACKUP_FORMAT = 'openflowkit-v1-backup';

/** Every diagram in this browser, one file. The next OpenFlowKit opens it as-is. */
export interface V1Backup {
  format: typeof V1_BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  documents: PersistedDocument[];
}

// Undo history stays behind: it is large and its asset ids only resolve in this browser.
async function inlineContent({
  history: _history,
  ...content
}: PersistedDocumentContent): Promise<PersistedDocumentContent> {
  return { ...content, nodes: await inlineNodeAssetsForTransfer(content.nodes) };
}

async function inlineDocument(document: PersistedDocument): Promise<PersistedDocument> {
  return {
    ...document,
    content: document.content && (await inlineContent(document.content)),
    pages:
      document.pages &&
      (await Promise.all(
        document.pages.map(async (page) => ({ ...page, content: await inlineContent(page.content) }))
      )),
  };
}

// Images move inline: asset ids only resolve in the browser that stored the bytes.
export async function buildV1Backup(now = new Date()): Promise<V1Backup> {
  const { documents } = await localFirstRepository.loadWorkspaceSnapshot();
  return {
    format: V1_BACKUP_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    documents: await Promise.all(documents.map(inlineDocument)),
  };
}

export function v1BackupFileName(now = new Date()): string {
  return `openflowkit-backup-${now.toISOString().slice(0, 10)}.json`;
}
