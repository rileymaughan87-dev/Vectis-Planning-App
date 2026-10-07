// Google sign-in and the three Drive calls sharing needs.
//
// Publishing: you sign in once with the narrow `drive.file` scope, which
// lets Vectis see only the files it created itself — nothing else in
// your Drive. It keeps one file there and makes it readable by anyone
// with the link.
//
// Reading a partner's file needs no sign-in: a link-shared file can be
// fetched with the app's API key alone.

const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const TOKEN_KEY = 'vectis:google-token'
const CONFIG_KEY = 'vectis:google-config'

export interface GoogleConfig {
  clientId: string
  apiKey: string
}

/** Build-time settings win; otherwise whatever was entered in the app. */
export function googleConfig(): GoogleConfig {
  let saved: Partial<GoogleConfig> = {}
  try {
    saved = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}')
  } catch {
    saved = {}
  }
  return {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || saved.clientId || '',
    apiKey: import.meta.env.VITE_GOOGLE_API_KEY || saved.apiKey || '',
  }
}

export function saveGoogleConfig(config: GoogleConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch {
    // Storage unavailable; the fields just won't stick.
  }
}

export const isConfiguredFromBuild = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID && import.meta.env.VITE_GOOGLE_API_KEY)

// MARK: - Sign-in

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
            error_callback?: (error: { type: string; message?: string }) => void
          }): TokenClient
          revoke(token: string, done?: () => void): void
        }
      }
    }
  }
}

let gisLoading: Promise<void> | null = null

function loadGIS(): Promise<void> {
  if (window.google?.accounts) return Promise.resolve()
  gisLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      gisLoading = null
      reject(new Error("Couldn't reach Google. Check your connection."))
    }
    document.head.appendChild(script)
  })
  return gisLoading
}

/** A token still valid for at least another minute, if there is one. */
export function currentToken(): string | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as { token: string; expires: number } | null
    if (saved && saved.expires > Date.now() + 60_000) return saved.token
  } catch {
    // Fall through to "no token".
  }
  return null
}

/**
 * Asks Google for access. Must be called from a tap or click — browsers
 * block the sign-in popup otherwise. After the first consent, Google
 * returns straight away without asking again.
 */
export async function signIn(): Promise<string> {
  const { clientId } = googleConfig()
  if (!clientId) throw new Error('Google sign-in isn\'t set up yet. Add a client ID under "Google setup".')
  await loadGIS()
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: response => {
        if (!response.access_token) {
          reject(new Error(response.error_description || response.error || 'Google sign-in was cancelled.'))
          return
        }
        const expires = Date.now() + (response.expires_in ?? 3600) * 1000
        try {
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: response.access_token, expires }))
        } catch {
          // The token still works for this call.
        }
        resolve(response.access_token)
      },
      error_callback: error => reject(new Error(error.message || 'Google sign-in was closed.')),
    })
    client.requestAccessToken({ prompt: '' })
  })
}

export function signOut() {
  const token = currentToken()
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Nothing to clear.
  }
  if (token) window.google?.accounts.oauth2.revoke(token)
}

// MARK: - Drive

export class DriveError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function driveFetch(url: string, init: RequestInit, token: string): Promise<Response> {
  const response = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
  if (!response.ok) {
    if (response.status === 401) sessionStorage.removeItem(TOKEN_KEY)
    throw new DriveError(await describe(response), response.status)
  }
  return response
}

async function describe(response: Response): Promise<string> {
  try {
    const body = await response.json()
    return body?.error?.message || `Google Drive returned ${response.status}.`
  } catch {
    return `Google Drive returned ${response.status}.`
  }
}

/**
 * Writes the share file, creating it (and its link-sharing permission)
 * the first time. Returns the file's id. If the old file was deleted
 * from Drive, a new one is made — the link changes, so the caller shows it.
 */
export async function publishFile(token: string, fileID: string | undefined, name: string, body: unknown): Promise<string> {
  const json = JSON.stringify(body)
  if (fileID) {
    try {
      await driveFetch(
        `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileID)}?uploadType=media`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json },
        token,
      )
      return fileID
    } catch (error) {
      if (!(error instanceof DriveError) || error.status !== 404) throw error
    }
  }

  const boundary = 'vectis' + Math.random().toString(36).slice(2)
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, mimeType: 'application/json', description: 'Shared from Planner for an accountability partner.' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`
  const created = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart },
    token,
  )
  const { id } = (await created.json()) as { id: string }

  await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'reader', type: 'anyone' }) },
    token,
  )
  return id
}

/** Reads a link-shared file with the API key. No sign-in needed. */
export async function fetchSharedFile(fileID: string): Promise<unknown> {
  const { apiKey } = googleConfig()
  if (!apiKey) throw new Error('Reading shared files isn\'t set up yet. Add an API key under "Google setup".')
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileID)}?alt=media&key=${encodeURIComponent(apiKey)}`,
  )
  if (response.status === 404) throw new Error("That file wasn't found. It may have been deleted, or the link is wrong.")
  if (response.status === 403) throw new Error("That file isn't shared publicly, or the API key isn't allowed to read Drive.")
  if (!response.ok) throw new Error(await describe(response))
  return response.json()
}

export function driveLink(fileID: string): string {
  return `https://drive.google.com/file/d/${fileID}/view?usp=sharing`
}

/** Pulls a Drive file id out of a pasted link, or accepts a bare id. */
export function fileIDFromLink(input: string): string | null {
  const text = input.trim()
  const patterns = [/\/file\/d\/([\w-]{10,})/, /[?&#]id=([\w-]{10,})/, /[#&]partner=([\w-]{10,})/]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) return m[1]
  }
  return /^[\w-]{20,}$/.test(text) ? text : null
}
