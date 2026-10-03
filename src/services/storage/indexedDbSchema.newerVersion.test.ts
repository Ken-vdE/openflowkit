// @vitest-environment node
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FLOW_PERSISTENCE_DB_NAME,
  FLOW_PERSISTENCE_DB_VERSION,
  PERSISTED_DOCUMENTS_STORE_NAME,
  NEWER_APP_OPENED_EVENT,
  ensureFlowPersistenceSchema,
  openFlowPersistenceDatabase,
} from './indexedDbSchema';
import { localFirstRepository } from './localFirstRepository';
import type { PersistedDocument } from './persistenceTypes';

const NEXT_VERSION = FLOW_PERSISTENCE_DB_VERSION + 1;

function openAt(version: number, upgrade?: (database: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FLOW_PERSISTENCE_DB_NAME, version);
    request.onupgradeneeded = () => upgrade?.(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('upgrade blocked by an open connection'));
  });
}

const document: PersistedDocument = {
  id: 'doc-1',
  name: 'Checkout flow',
  content: { nodes: [], edges: [] },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  deletedAt: null,
};

async function seedOurDatabase(): Promise<IDBDatabase> {
  await ensureFlowPersistenceSchema(indexedDB);
  const ours = await openFlowPersistenceDatabase(indexedDB);
  await new Promise<void>((resolve, reject) => {
    const transaction = ours.transaction(PERSISTED_DOCUMENTS_STORE_NAME, 'readwrite');
    transaction.objectStore(PERSISTED_DOCUMENTS_STORE_NAME).put(document);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  return ours;
}

async function runNextOpenFlowKit(): Promise<void> {
  const next = await openAt(NEXT_VERSION, (database) =>
    database.createObjectStore('v2Documents', { keyPath: 'id' })
  );
  next.close();
}

// The next OpenFlowKit opens this database one version up and keeps our stores. A browser
// that has run it must still show this app's diagrams (rollback, or a tab left open).
describe('a browser that has run the next OpenFlowKit', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it('still lists the diagrams after the database moved past our version', async () => {
    (await seedOurDatabase()).close();
    await runNextOpenFlowKit();
    const events: string[] = [];
    vi.stubGlobal('dispatchEvent', (event: Event) => events.push(event.type));

    const loaded = await localFirstRepository.loadWorkspaceSnapshot();
    expect(loaded.documents.map((entry) => entry.name)).toEqual(['Checkout flow']);
    const reopened = await openFlowPersistenceDatabase(indexedDB);
    expect(reopened.version).toBe(NEXT_VERSION);
    reopened.close();
    // A tab between saves holds no connection, so it learns on its next open instead.
    expect(events[0]).toBe(NEWER_APP_OPENED_EVENT);
    vi.unstubAllGlobals();
  });

  it('a tab left open steps aside so the upgrade is not blocked, and learns it is stale', async () => {
    const events: string[] = [];
    vi.stubGlobal('dispatchEvent', (event: Event) => events.push(event.type));
    const ours = await seedOurDatabase();
    await runNextOpenFlowKit();
    expect(() => ours.transaction(PERSISTED_DOCUMENTS_STORE_NAME)).toThrow();
    expect(events).toEqual([NEWER_APP_OPENED_EVENT]);
    vi.unstubAllGlobals();
  });

  it('a fresh load on the newer database (a rollback) works without the warning', async () => {
    (await seedOurDatabase()).close();
    await runNextOpenFlowKit();
    vi.resetModules();
    const fresh = await import('./localFirstRepository');
    const events: string[] = [];
    vi.stubGlobal('dispatchEvent', (event: Event) => events.push(event.type));

    const loaded = await fresh.localFirstRepository.loadWorkspaceSnapshot();

    expect(loaded.documents.map((entry) => entry.name)).toEqual(['Checkout flow']);
    expect(events).toEqual([]);
    vi.unstubAllGlobals();
  });
});
