import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile, link, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CredentialStore, StoredCredential } from './credential-store.js';

interface CredentialFile {
  version: 1;
  userHandle: string;
  credentials: StoredCredential[];
}

interface StoreState {
  version: 1;
  credentialsExpected: boolean;
}

export class FileCredentialStore implements CredentialStore {
  private cached?: CredentialFile;
  private loading?: Promise<CredentialFile>;
  private writes: Promise<unknown> = Promise.resolve();
  private readonly filePath: string;
  private readonly statePath: string;

  constructor(directory: string, stateDirectory: string) {
    this.filePath = join(directory, 'passkeys.json');
    this.statePath = join(stateDirectory, 'state.json');
  }

  async initialize(): Promise<void> {
    await this.load();
  }

  async getUserHandle(): Promise<string> {
    return (await this.load()).userHandle;
  }

  async list(): Promise<StoredCredential[]> {
    return structuredClone((await this.load()).credentials);
  }

  async findById(id: string): Promise<StoredCredential | undefined> {
    const credential = (await this.load()).credentials.find((item) => item.id === id);
    return credential ? structuredClone(credential) : undefined;
  }

  async add(credential: StoredCredential): Promise<void> {
    await this.mutate((store) => {
      if (store.credentials.some((item) => item.id === credential.id)) {
        throw new Error('Credential is already registered');
      }
      store.credentials.push(structuredClone(credential));
    });
  }

  async update(credential: StoredCredential): Promise<void> {
    await this.mutate((store) => {
      const index = store.credentials.findIndex((item) => item.id === credential.id);
      if (index < 0) throw new Error('Credential is not registered');
      store.credentials[index] = structuredClone(credential);
    });
  }

  private async load(): Promise<CredentialFile> {
    if (this.cached) return this.cached;
    this.loading ??= this.readOrInitialize();
    this.cached = await this.loading;
    return this.cached;
  }

  private async readOrInitialize(): Promise<CredentialFile> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    await mkdir(dirname(this.statePath), { recursive: true, mode: 0o700 });
    const state = await this.readState();
    let store: CredentialFile | undefined;
    try {
      const data = await readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(data);
      store = validateCredentialFile(parsed);
      await chmod(this.filePath, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (error instanceof SyntaxError) throw new Error('Passkey credential file contains invalid JSON');
        throw error;
      }
    }

    if (store) {
      if (state?.credentialsExpected && store.credentials.length === 0) {
        throw new Error('Passkey credential file is empty but registered credentials are expected; restore it from backup');
      }
      if (!state || (store.credentials.length > 0 && !state.credentialsExpected)) {
        await this.writeState({ version: 1, credentialsExpected: store.credentials.length > 0 });
      }
      return store;
    }

    if (state?.credentialsExpected) {
      throw new Error('Passkey credential file is missing but registered credentials are expected; restore it from backup');
    }

    const initial: CredentialFile = {
      version: 1,
      userHandle: randomBytes(32).toString('base64url'),
      credentials: [],
    };
    const created = await this.createInitial(initial);
    if (!state) await this.writeState({ version: 1, credentialsExpected: false });
    return created;
  }

  private async readState(): Promise<StoreState | undefined> {
    try {
      const value: unknown = JSON.parse(await readFile(this.statePath, 'utf8'));
      if (!value || typeof value !== 'object') throw new Error('Passkey storage state has an invalid shape');
      const state = value as Partial<StoreState>;
      if (state.version !== 1 || typeof state.credentialsExpected !== 'boolean') {
        throw new Error('Passkey storage state has an invalid shape');
      }
      await chmod(this.statePath, 0o600);
      return state as StoreState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      if (error instanceof SyntaxError) throw new Error('Passkey storage state contains invalid JSON');
      throw error;
    }
  }

  private async writeState(state: StoreState): Promise<void> {
    const temporary = `${this.statePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporary, this.statePath);
      await chmod(this.statePath, 0o600);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async createInitial(store: CredentialFile): Promise<CredentialFile> {
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      try {
        await link(temporary, this.filePath);
        return store;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        const existing: unknown = JSON.parse(await readFile(this.filePath, 'utf8'));
        return validateCredentialFile(existing);
      }
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private mutate(change: (store: CredentialFile) => void): Promise<void> {
    const operation = this.writes.then(async () => {
      const store = structuredClone(await this.load());
      change(store);
      const temporary = `${this.filePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        await rename(temporary, this.filePath);
        this.cached = store;
      } finally {
        await rm(temporary, { force: true });
      }
      if (store.credentials.length > 0) await this.writeState({ version: 1, credentialsExpected: true });
    });
    this.writes = operation.catch(() => undefined);
    return operation;
  }
}

function validateCredentialFile(value: unknown): CredentialFile {
  if (!value || typeof value !== 'object') throw new Error('Passkey credential file has an invalid shape');
  const record = value as Partial<CredentialFile>;
  if (record.version !== 1 || typeof record.userHandle !== 'string' || !/^[A-Za-z0-9_-]{40,}$/.test(record.userHandle) || !Array.isArray(record.credentials)) {
    throw new Error('Passkey credential file has an invalid shape');
  }
  const ids = new Set<string>();
  for (const item of record.credentials) {
    if (!item || typeof item !== 'object') throw new Error('Passkey credential entry has an invalid shape');
    const credential = item as StoredCredential;
    if (
      typeof credential.id !== 'string' || !credential.id || ids.has(credential.id) ||
      typeof credential.publicKey !== 'string' || !/^[A-Za-z0-9_-]+$/.test(credential.publicKey) ||
      !Number.isSafeInteger(credential.counter) || credential.counter < 0 ||
      !['singleDevice', 'multiDevice'].includes(credential.deviceType) || typeof credential.backedUp !== 'boolean' ||
      (credential.transports !== undefined && (!Array.isArray(credential.transports) || credential.transports.some((transport) => typeof transport !== 'string')))
    ) throw new Error('Passkey credential entry has an invalid shape');
    ids.add(credential.id);
  }
  return record as CredentialFile;
}
