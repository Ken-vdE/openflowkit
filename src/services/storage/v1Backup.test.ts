// @vitest-environment node
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { putFlowAsset } from './assetStore';
import { localFirstRepository } from './localFirstRepository';
import type { PersistedDocument } from './persistenceTypes';
import { buildV1Backup, v1BackupFileName } from './v1Backup';

const IMAGE_ID = `sha256:${'1'.repeat(64)}`;
const NOW = new Date('2026-10-03T12:00:00.000Z');

function document(id: string, pageNames: string[]): PersistedDocument {
  return {
    id,
    name: id,
    pages: pageNames.map((name) => ({
      id: `${id}-${name}`,
      name,
      content: {
        nodes: [{ id: 'img', position: { x: 0, y: 0 }, data: { label: '', imageAssetId: IMAGE_ID } }],
        edges: [],
      },
    })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    deletedAt: null,
  };
}

describe('v1 backup', () => {
  it('holds every page of every diagram, images inline', async () => {
    await putFlowAsset({
      id: IMAGE_ID,
      kind: 'image',
      mimeType: 'image/png',
      bytes: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      byteLength: 3,
      createdAt: NOW.toISOString(),
    });
    await localFirstRepository.saveDocuments(
      [document('Roadmap', ['Q1', 'Q2']), document('Checkout', ['Main'])],
      'Roadmap'
    );
    // v1 hard-deletes: a removed diagram is simply gone from the store.
    const legacy: PersistedDocument = {
      ...document('Legacy', []),
      pages: undefined,
      content: { nodes: [], edges: [], history: { past: [{ nodes: [], edges: [] }], future: [] } },
    };
    await localFirstRepository.saveDocuments([document('Roadmap', ['Q1', 'Q2']), legacy], 'Roadmap');

    const backup = await buildV1Backup(NOW);

    expect(backup).toMatchObject({
      format: 'openflowkit-v1-backup',
      version: 1,
      exportedAt: NOW.toISOString(),
    });
    expect(backup.documents.map((entry) => entry.pages?.map((page) => page.name))).toEqual([
      ['Q1', 'Q2'],
      undefined,
    ]);
    // A pre-pages document keeps its single content; undo history stays behind.
    expect(backup.documents[1].content).toEqual({ nodes: [], edges: [] });
    const imageData = backup.documents[0].pages?.[1].content.nodes[0].data;
    expect(imageData?.imageUrl).toBe('data:image/png;base64,AQID');
    expect(imageData?.imageAssetId).toBeUndefined();
    expect(JSON.parse(JSON.stringify(backup))).toEqual(backup);
    expect(v1BackupFileName(NOW)).toBe('openflowkit-backup-2026-10-03.json');
  });
});
