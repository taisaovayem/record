import type { AuthenticatorTransport, CredentialDeviceType } from '@simplewebauthn/server';

export const CREDENTIAL_STORE = 'CREDENTIAL_STORE';

export interface StoredCredential {
  id: string;
  publicKey: string;
  counter: number;
  transports?: AuthenticatorTransport[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
}

export interface CredentialStore {
  getUserHandle(): Promise<string>;
  list(): Promise<StoredCredential[]>;
  findById(id: string): Promise<StoredCredential | undefined>;
  add(credential: StoredCredential): Promise<void>;
  update(credential: StoredCredential): Promise<void>;
}
