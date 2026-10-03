export const FLOW_PERSISTENCE_DB_NAME = 'openflowkit-persistence';
export const FLOW_PERSISTENCE_DB_VERSION = 3;
/** Fired on `globalThis` when a newer OpenFlowKit upgrades the database under this tab. */
export const NEWER_APP_OPENED_EVENT = 'openflowkit:newer-app-opened';
export const FLOW_DOCUMENT_STORE_NAME = 'flowDocuments';
export const FLOW_METADATA_STORE_NAME = 'flowMetadata';
export const SCHEMA_META_STORE_NAME = 'schemaMeta';
export const PERSISTED_DOCUMENTS_STORE_NAME = 'documents';
export const DOCUMENT_SESSIONS_STORE_NAME = 'documentSessions';
export const CHAT_THREADS_STORE_NAME = 'chatThreads';
export const CHAT_MESSAGES_STORE_NAME = 'chatMessages';
export const WORKSPACE_META_STORE_NAME = 'workspaceMeta';
export const AI_SETTINGS_PERSISTENT_STORE_NAME = 'aiSettingsPersistent';
export const PREFERENCES_STORE_NAME = 'preferences';
export const ASSETS_STORE_NAME = 'assets';
export const CHAT_MESSAGES_BY_DOCUMENT_ID_INDEX = 'byDocumentId';
export const CHAT_MESSAGES_BY_DOCUMENT_ID_AND_CREATED_AT_INDEX =
  'byDocumentIdAndCreatedAt';

type ObjectStoreIndexDefinition = {
  name: string;
  keyPath: string | string[];
  options?: IDBIndexParameters;
};

type ObjectStoreDefinition = {
  name: string;
  keyPath?: string;
  indexes?: ObjectStoreIndexDefinition[];
};

const OBJECT_STORE_DEFINITIONS: ObjectStoreDefinition[] = [
  { name: FLOW_DOCUMENT_STORE_NAME, keyPath: 'id' },
  { name: FLOW_METADATA_STORE_NAME, keyPath: 'id' },
  { name: SCHEMA_META_STORE_NAME, keyPath: 'id' },
  { name: PERSISTED_DOCUMENTS_STORE_NAME, keyPath: 'id' },
  { name: DOCUMENT_SESSIONS_STORE_NAME, keyPath: 'id' },
  { name: CHAT_THREADS_STORE_NAME, keyPath: 'id' },
  {
    name: CHAT_MESSAGES_STORE_NAME,
    keyPath: 'id',
    indexes: [
      {
        name: CHAT_MESSAGES_BY_DOCUMENT_ID_INDEX,
        keyPath: 'documentId',
      },
      {
        name: CHAT_MESSAGES_BY_DOCUMENT_ID_AND_CREATED_AT_INDEX,
        keyPath: ['documentId', 'createdAt'],
      },
    ],
  },
  { name: WORKSPACE_META_STORE_NAME, keyPath: 'id' },
  { name: AI_SETTINGS_PERSISTENT_STORE_NAME, keyPath: 'id' },
  { name: PREFERENCES_STORE_NAME, keyPath: 'id' },
  { name: ASSETS_STORE_NAME, keyPath: 'id' },
];

function ensureObjectStore(
  database: IDBDatabase,
  definition: ObjectStoreDefinition,
  upgradeTransaction: IDBTransaction | null
): IDBObjectStore {
  if (!database.objectStoreNames.contains(definition.name)) {
    return database.createObjectStore(definition.name, {
      keyPath: definition.keyPath ?? 'id',
    });
  }

  if (!upgradeTransaction) {
    throw new Error(
      `Missing upgrade transaction while ensuring IndexedDB store "${definition.name}".`
    );
  }

  return upgradeTransaction.objectStore(definition.name);
}

function ensureObjectStoreIndex(
  store: IDBObjectStore,
  definition: ObjectStoreIndexDefinition
): void {
  if (!store.indexNames.contains(definition.name)) {
    store.createIndex(definition.name, definition.keyPath, definition.options);
  }
}

// True once this page opened the database at our own version.
let openedAtOurVersion = false;

export function openFlowPersistenceDatabase(indexedDbFactory: IDBFactory): Promise<IDBDatabase> {
  return openDatabase(indexedDbFactory, FLOW_PERSISTENCE_DB_VERSION).then(
    (database) => {
      openedAtOurVersion = true;
      return database;
    },
    (error: unknown) => {
      // The next OpenFlowKit upgrades this database past our version and keeps every store we
      // use. Open whatever version is there, so this app still sees its diagrams in a browser
      // that has run the new one (a rollback loads straight into this path, silently).
      if (error instanceof DOMException && error.name === 'VersionError') {
        if (openedAtOurVersion) announceNewerApp();
        return openDatabase(indexedDbFactory);
      }
      throw error;
    }
  );
}

// The database moved on under this tab: edits made here after a newer app imported its copy
// would not carry over.
function announceNewerApp(): void {
  globalThis.dispatchEvent?.(new Event(NEWER_APP_OPENED_EVENT));
}

function openDatabase(indexedDbFactory: IDBFactory, version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request =
      version === undefined
        ? indexedDbFactory.open(FLOW_PERSISTENCE_DB_NAME)
        : indexedDbFactory.open(FLOW_PERSISTENCE_DB_NAME, version);

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to open IndexedDB persistence database.'));
    };

    request.onupgradeneeded = () => {
      const database = request.result;
      const upgradeTransaction = request.transaction;
      for (const definition of OBJECT_STORE_DEFINITIONS) {
        const store = ensureObjectStore(database, definition, upgradeTransaction);
        for (const indexDefinition of definition.indexes ?? []) {
          ensureObjectStoreIndex(store, indexDefinition);
        }
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = (event) => {
        // Never block a newer app's upgrade from an open tab.
        database.close();
        if (event.newVersion !== null && event.newVersion > FLOW_PERSISTENCE_DB_VERSION) {
          announceNewerApp();
        }
      };
      resolve(database);
    };
  });
}

export async function ensureFlowPersistenceSchema(indexedDbFactory: IDBFactory): Promise<void> {
  const database = await openFlowPersistenceDatabase(indexedDbFactory);
  database.close();
}
