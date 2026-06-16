import { config } from 'dotenv'
import { resolve } from 'path'
import { existsSync } from 'fs'

let loaded = false

export function loadServerEnv(root = process.cwd()): void {
  if (loaded) return

  const candidates = ['.env.local', '.env']
  for (const file of candidates) {
    const path = resolve(root, file)
    if (existsSync(path)) {
      config({ path })
      loaded = true
      return
    }
  }

  config()
  loaded = true
}

export function getGoogleDriveApiKey(): string | undefined {
  const key = process.env.GOOGLE_DRIVE_API_KEY?.trim()
  return key || undefined
}

export function getDropboxAccessToken(): string | undefined {
  const token = process.env.DROPBOX_ACCESS_TOKEN?.trim()
  return token || undefined
}

export function getMicrosoftGraphAccessToken(): string | undefined {
  const token = process.env.MICROSOFT_GRAPH_ACCESS_TOKEN?.trim()
  return token || undefined
}

export function getMicrosoftGraphClientCredentials(): {
  clientId: string
  clientSecret: string
  tenantId: string
} | null {
  const clientId = process.env.MICROSOFT_GRAPH_CLIENT_ID?.trim()
  const clientSecret = process.env.MICROSOFT_GRAPH_CLIENT_SECRET?.trim()
  const tenantId =
    process.env.MICROSOFT_GRAPH_TENANT_ID?.trim()
    ?? process.env.AZURE_TENANT_ID?.trim()

  if (!clientId || !clientSecret || !tenantId) return null
  return { clientId, clientSecret, tenantId }
}

export function getAwsCredentials(): { accessKeyId: string; secretAccessKey: string } | undefined {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  if (!accessKeyId || !secretAccessKey) return undefined
  return { accessKeyId, secretAccessKey }
}

export function logApiKeyStatus(root = process.cwd()): void {
  loadServerEnv(root)
  const driveKey = getGoogleDriveApiKey()
  const dropboxToken = getDropboxAccessToken()
  const graphToken = getMicrosoftGraphAccessToken()
  const graphCreds = getMicrosoftGraphClientCredentials()

  if (!driveKey) {
    console.warn('\n⚠️  [PhotoFind] GOOGLE_DRIVE_API_KEY no configurada.')
    console.warn('   Creá un archivo .env en la raíz del proyecto:')
    console.warn('   GOOGLE_DRIVE_API_KEY=tu_api_key')
    console.warn('   Reiniciá el servidor: npm run dev\n')
  } else {
    console.log('✓ [PhotoFind] Google Drive API key cargada correctamente')
  }

  if (!dropboxToken) {
    console.warn('⚠️  [PhotoFind] DROPBOX_ACCESS_TOKEN no configurado (Dropbox deshabilitado).')
    console.warn('   Generá un token en https://www.dropbox.com/developers/apps')
    console.warn('   DROPBOX_ACCESS_TOKEN=tu_token\n')
  } else {
    console.log('✓ [PhotoFind] Dropbox access token cargado correctamente')
  }

  if (!graphToken && !graphCreds) {
    console.warn('⚠️  [PhotoFind] Microsoft Graph no configurado (OneDrive deshabilitado).')
    console.warn('   Opción A: MICROSOFT_GRAPH_ACCESS_TOKEN=tu_token')
    console.warn('   Opción B: MICROSOFT_GRAPH_CLIENT_ID, MICROSOFT_GRAPH_CLIENT_SECRET, MICROSOFT_GRAPH_TENANT_ID\n')
  } else {
    console.log('✓ [PhotoFind] Microsoft Graph configurado para OneDrive')
  }

  const aws = getAwsCredentials()
  if (!aws && !process.env.AWS_EXECUTION_ENV) {
    console.warn('⚠️  [PhotoFind] AWS Rekognition no configurado (validación de referencia deshabilitada).')
    console.warn('   AWS_ACCESS_KEY_ID=...')
    console.warn('   AWS_SECRET_ACCESS_KEY=...')
    console.warn('   Región: us-east-1 (ver server/recognize/config.ts)\n')
  } else {
    console.log('✓ [PhotoFind] AWS Rekognition configurado (us-east-1)')
  }
}
