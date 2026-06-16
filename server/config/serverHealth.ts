import { REKOGNITION_REGION } from '../recognize/config'
import { getAwsCredentials } from '../env'
import {
  isSupabaseServiceRoleConfigured,
  isSupabaseUrlConfigured,
} from '../supabase/config'
import { tryGetSupabaseAdmin } from '../supabase/client'

export interface ServerHealthStatus {
  supabaseUrlConfigured: boolean
  supabaseServiceRoleConfigured: boolean
  awsAccessKeyConfigured: boolean
  awsSecretConfigured: boolean
  awsRegionConfigured: boolean
  supabaseInitOk?: boolean
  supabaseInitError?: string
  awsInitOk?: boolean
  awsInitError?: string
  sharpLoadOk?: boolean
  sharpLoadError?: string
}

export function getConfigStatus(): ServerHealthStatus {
  const aws = getAwsCredentials()
  const awsRegion = process.env.AWS_REGION?.trim() || REKOGNITION_REGION

  return {
    supabaseUrlConfigured: isSupabaseUrlConfigured(),
    supabaseServiceRoleConfigured: isSupabaseServiceRoleConfigured(),
    awsAccessKeyConfigured: Boolean(aws?.accessKeyId),
    awsSecretConfigured: Boolean(aws?.secretAccessKey),
    awsRegionConfigured: Boolean(awsRegion),
  }
}

export async function testSupabaseInit(): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = tryGetSupabaseAdmin()
  if ('error' in result) return { ok: false, error: result.error }
  return { ok: true }
}

export async function testAwsInit(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { RekognitionClient } = await import('@aws-sdk/client-rekognition')
    const creds = getAwsCredentials()
    new RekognitionClient({
      region: process.env.AWS_REGION?.trim() || REKOGNITION_REGION,
      ...(creds ? { credentials: creds } : {}),
    })
    console.log('[PhotoFind:Server] aws_init_ok')
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[PhotoFind:Server] aws_init_error', message)
    return { ok: false, error: message }
  }
}

export async function testSharpLoad(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const sharp = (await import('sharp')).default
    await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).jpeg().toBuffer()
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

export function logStartupConfig(): void {
  const status = getConfigStatus()
  console.log('[Startup] SUPABASE_URL present=%s', status.supabaseUrlConfigured)
  console.log('[Startup] VITE_SUPABASE_URL present=%s', Boolean(process.env.VITE_SUPABASE_URL?.trim()))
  console.log('[Startup] SUPABASE_SERVICE_ROLE_KEY present=%s', status.supabaseServiceRoleConfigured)
  console.log('[Startup] AWS_ACCESS_KEY_ID present=%s', status.awsAccessKeyConfigured)
  console.log('[Startup] AWS_SECRET_ACCESS_KEY present=%s', status.awsSecretConfigured)
  console.log('[Startup] AWS_REGION present=%s (effective=%s)', status.awsRegionConfigured, process.env.AWS_REGION?.trim() || REKOGNITION_REGION)

  const supabase = tryGetSupabaseAdmin()
  if ('error' in supabase) {
    console.error('[PhotoFind:Server] supabase_init_error', supabase.error)
  } else {
    console.log('[PhotoFind:Server] supabase_init_ok')
  }
}
