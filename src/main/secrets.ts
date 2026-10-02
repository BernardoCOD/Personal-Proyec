import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SecretName } from '@shared/api'
import type { SecretStatus } from '@shared/types'

export interface OAuthTokens {
  accessToken: string
  refreshToken: string
  /** epoch ms */
  expiresAt: number
}

interface SecretData {
  anthropicApiKey: string
  googleClientSecret: string
  notionToken: string
  tokens: Record<string, OAuthTokens>
}

const empty = (): SecretData => ({ anthropicApiKey: '', googleClientSecret: '', notionToken: '', tokens: {} })

/**
 * Claves y tokens cifrados con el sistema operativo (DPAPI en Windows):
 * solo tu usuario de Windows puede descifrarlos. Nunca se envían a la interfaz.
 */
export class Secrets {
  private data: SecretData
  private readonly file: string

  constructor(dir = app.getPath('userData')) {
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'secretos.bin')
    this.data = this.load()
  }

  private load(): SecretData {
    if (!existsSync(this.file)) return empty()
    try {
      const buf = readFileSync(this.file)
      const json = buf.subarray(0, 6).toString() === 'PLAIN:' ? buf.subarray(6).toString('utf8') : safeStorage.decryptString(buf)
      return { ...empty(), ...(JSON.parse(json) as Partial<SecretData>) }
    } catch (err) {
      console.error('No se pudieron leer los secretos; se empieza de cero.', err)
      return empty()
    }
  }

  private save(): void {
    const json = JSON.stringify(this.data)
    const buf = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(json) : Buffer.from(`PLAIN:${json}`, 'utf8')
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, buf)
    renameSync(tmp, this.file)
  }

  get(name: SecretName): string {
    return this.data[name]
  }

  set(name: SecretName, value: string): void {
    this.data[name] = value.trim()
    this.save()
  }

  getTokens(accountId: string): OAuthTokens | null {
    return this.data.tokens[accountId] ?? null
  }

  setTokens(accountId: string, tokens: OAuthTokens | null): void {
    if (tokens) this.data.tokens[accountId] = tokens
    else delete this.data.tokens[accountId]
    this.save()
  }

  status(): SecretStatus {
    return {
      anthropicApiKey: Boolean(this.data.anthropicApiKey),
      googleClientSecret: Boolean(this.data.googleClientSecret),
      notionToken: Boolean(this.data.notionToken),
      encryptionAvailable: safeStorage.isEncryptionAvailable()
    }
  }
}
