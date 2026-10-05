import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

async function checked<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? `Yêu cầu thất bại (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function getSession(): Promise<{ authenticated: boolean }> {
  return checked(await fetch(`${apiBase}/auth/session`, { credentials: 'include' }));
}

export async function loginWithPasskey(): Promise<void> {
  const options = await checked<PublicKeyCredentialRequestOptionsJSON>(await fetch(`${apiBase}/auth/login/options`, {
    method: 'POST', credentials: 'include',
  }));
  const credential = await startAuthentication({ optionsJSON: options });
  await checked(await fetch(`${apiBase}/auth/login/verify`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential }),
  }));
}

export async function registerPasskey(authorization: string): Promise<void> {
  const options = await checked<PublicKeyCredentialCreationOptionsJSON>(await fetch(`${apiBase}/auth/register/options`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorization }),
  }));
  const credential = await startRegistration({ optionsJSON: options });
  await checked(await fetch(`${apiBase}/auth/register/verify`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorization, credential }),
  }));
}

export async function logout(): Promise<void> {
  await checked(await fetch(`${apiBase}/auth/logout`, { method: 'POST', credentials: 'include' }));
}
