import express, { type Express } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchGoogleDriveAlbum } from './driveService'
import { fetchDropboxAlbum } from './dropboxService'
import { fetchPixiesetAlbum } from './pixiesetService'
import { fetchWeTransferAlbum } from './wetransferService'
import { fetchOneDriveAlbum } from './onedriveService'
import { handleThumbnailRequest } from './thumbnailHandler'
import {
  handleDropboxFileRequest,
  handleDropboxThumbnailRequest,
  parseDropboxFilePath,
  parseDropboxThumbnailPath,
} from './dropboxThumbnailHandler'
import {
  handleWeTransferFileRequest,
  handleWeTransferThumbnailRequest,
  parseWeTransferFilePath,
  parseWeTransferThumbnailPath,
} from './wetransferThumbnailHandler'
import {
  handleOneDriveFileRequest,
  handleOneDriveThumbnailRequest,
  parseOneDriveFilePath,
  parseOneDriveThumbnailPath,
} from './onedriveThumbnailHandler'
import { getGoogleDriveApiKey } from './env'
import { logStartupConfig } from './config/serverHealth'
import { handleHealthRequest } from './debug/healthHandler'
import { handleCompareAlbumRequest } from './recognize/compareSearchHandler'
import {
  handleAlbumJobProcessRequest,
  handleAlbumJobSearchRequest,
  handleAlbumJobStartRequest,
  handleAlbumJobStatusRequest,
} from './recognize/albumJobHandler'
import {
  handleIndexAlbumBatchRequest,
  handlePrepareCollectionRequest,
  handleSearchCollectionRequest,
} from './recognize/collectionSearchHandler'
import { handleSelectReferenceFaceRequest, handleValidateReferenceRequest } from './recognize/referenceHandler'
import {
  handlePersonGroupDetailRequest,
  handlePersonGroupingEnsureRequest,
  handlePersonGroupingProcessRequest,
  handlePersonGroupsListRequest,
} from './recognize/personGroupingHandler'
import {
  handleDeleteFacialProfileRequest,
  handleDashboardRequest,
  handleCancelActiveAlbumJobRequest,
  handleGetFacialProfileRequest,
  handleMeRequest,
  handleRecordSearchRequest,
  handleSaveFacialProfileRequest,
  handleUseFacialProfileRequest,
} from './auth/authHandler'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export interface CreateAppOptions {
  /** Serve Vite build + SPA fallback (local `npm start`). Off on Vercel — CDN serves static. */
  serveStatic?: boolean
}

export function createApp(options: CreateAppOptions = {}): Express {
  const { serveStatic = true } = options
  const app = express()

  logStartupConfig()

  app.use((req, _res, next) => {
    if (req.url?.startsWith('/api')) {
      console.log('[PhotoFind:Backend] request', { method: req.method, url: req.url })
    }
    next()
  })

  app.use(express.json({ limit: '15mb' }))

  app.get('/api/debug/health', async (req, res) => {
    const deep = req.query.deep === '1' || req.query.deep === 'true'
    await handleHealthRequest(req, res, { deep })
  })

  app.get('/api/drive/thumbnail/:fileId', async (req, res) => {
    await handleThumbnailRequest(req, res, req.params.fileId, req.originalUrl)
  })

  app.get('/api/wetransfer/thumbnail/:token', async (req, res) => {
    const parsed = parseWeTransferThumbnailPath(req.originalUrl)
    if (!parsed) {
      res.status(404).json({ error: 'Invalid path' })
      return
    }
    await handleWeTransferThumbnailRequest(req, res, parsed.token, req.originalUrl)
  })

  app.get('/api/wetransfer/file/:token', async (req, res) => {
    const parsed = parseWeTransferFilePath(req.originalUrl)
    if (!parsed) {
      res.status(404).json({ error: 'Invalid path' })
      return
    }
    await handleWeTransferFileRequest(req, res, parsed.token, req.originalUrl)
  })

  app.post('/api/wetransfer/folder', async (req, res) => {
    const wetransferUrl = req.body?.url as string | undefined
    if (!wetransferUrl) {
      res.status(400).json({ ok: false, error: { code: 'WETRANSFER_INVALID_URL', message: 'Falta el campo url.' } })
      return
    }
    const result = await fetchWeTransferAlbum(wetransferUrl)
    res.status(result.ok ? 200 : 400).json(result)
  })

  app.get('/api/onedrive/thumbnail/:token', async (req, res) => {
    const parsed = parseOneDriveThumbnailPath(req.originalUrl)
    if (!parsed) {
      res.status(404).json({ error: 'Invalid path' })
      return
    }
    await handleOneDriveThumbnailRequest(req, res, parsed.token, req.originalUrl)
  })

  app.get('/api/onedrive/file/:token', async (req, res) => {
    const parsed = parseOneDriveFilePath(req.originalUrl)
    if (!parsed) {
      res.status(404).json({ error: 'Invalid path' })
      return
    }
    await handleOneDriveFileRequest(req, res, parsed.token, req.originalUrl)
  })

  app.get('/api/dropbox/thumbnail/:token', async (req, res) => {
    const parsed = parseDropboxThumbnailPath(req.originalUrl)
    if (!parsed) {
      res.status(404).json({ error: 'Invalid path' })
      return
    }
    await handleDropboxThumbnailRequest(req, res, parsed.token, req.originalUrl)
  })

  app.get('/api/dropbox/file/:token', async (req, res) => {
    const parsed = parseDropboxFilePath(req.originalUrl)
    if (!parsed) {
      res.status(404).json({ error: 'Invalid path' })
      return
    }
    await handleDropboxFileRequest(req, res, parsed.token, req.originalUrl)
  })

  app.get('/api/drive/folder', async (req, res) => {
    const driveUrl = req.query.url as string | undefined
    if (!driveUrl) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_URL', message: 'Falta el parámetro url.' } })
      return
    }
    const result = await fetchGoogleDriveAlbum(driveUrl, getGoogleDriveApiKey())
    res.status(result.ok ? 200 : 400).json(result)
  })

  app.post('/api/drive/folder', async (req, res) => {
    const driveUrl = req.body?.url as string | undefined
    if (!driveUrl) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_URL', message: 'Falta el campo url.' } })
      return
    }
    const result = await fetchGoogleDriveAlbum(driveUrl, getGoogleDriveApiKey())
    res.status(result.ok ? 200 : 400).json(result)
  })

  app.post('/api/onedrive/folder', async (req, res) => {
    const onedriveUrl = req.body?.url as string | undefined
    if (!onedriveUrl) {
      res.status(400).json({ ok: false, error: { code: 'ONEDRIVE_INVALID_URL', message: 'Falta el campo url.' } })
      return
    }
    const result = await fetchOneDriveAlbum(onedriveUrl)
    res.status(result.ok ? 200 : 400).json(result)
  })

  app.post('/api/pixieset/folder', async (req, res) => {
    const pixiesetUrl = req.body?.url as string | undefined
    if (!pixiesetUrl) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_URL', message: 'Falta el campo url.' } })
      return
    }
    const result = await fetchPixiesetAlbum(pixiesetUrl)
    res.status(result.ok ? 200 : 400).json(result)
  })

  app.post('/api/dropbox/folder', async (req, res) => {
    const dropboxUrl = req.body?.url as string | undefined
    if (!dropboxUrl) {
      res.status(400).json({ ok: false, error: { code: 'INVALID_URL', message: 'Falta el campo url.' } })
      return
    }
    const result = await fetchDropboxAlbum(dropboxUrl)
    res.status(result.ok ? 200 : 400).json(result)
  })

  app.post('/api/recognize/compare-album', async (req, res) => {
    try {
      const body = JSON.stringify(req.body ?? {})
      await handleCompareAlbumRequest(req, res, body)
    } catch (err) {
      console.error('[PhotoFind:Backend] compare_album_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'RECOGNITION_SEARCH_FAILED', message: 'No pudimos buscar coincidencias en el álbum.' },
      })
    }
  })

  app.post('/api/recognize/album-job-search', async (req, res) => {
    try {
      const body = JSON.stringify(req.body ?? {})
      await handleAlbumJobSearchRequest(req, res, body)
    } catch (err) {
      console.error('[PhotoFind:Backend] album_job_search_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'RECOGNITION_SEARCH_FAILED', message: 'No pudimos buscar coincidencias en el álbum.' },
      })
    }
  })

  app.post('/api/recognize/album-job-start', async (req, res) => {
    try {
      const body = JSON.stringify(req.body ?? {})
      await handleAlbumJobStartRequest(req, res, body)
    } catch (err) {
      console.error('[PhotoFind:Backend] album_job_start_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'ALBUM_JOB_FAILED', message: 'No pudimos iniciar el análisis del álbum.' },
      })
    }
  })

  app.get('/api/recognize/album-job-status', async (req, res) => {
    try {
      await handleAlbumJobStatusRequest(req, res)
    } catch (err) {
      console.error('[PhotoFind:Backend] album_job_status_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'ALBUM_JOB_FAILED', message: 'No pudimos consultar el estado del análisis.' },
      })
    }
  })

  app.post('/api/recognize/album-job-process', async (req, res) => {
    try {
      const body = JSON.stringify(req.body ?? {})
      await handleAlbumJobProcessRequest(req, res, body)
    } catch (err) {
      console.error('[PhotoFind:Backend] album_job_process_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'ALBUM_JOB_FAILED', message: 'No pudimos procesar el siguiente lote del álbum.' },
      })
    }
  })

  app.post('/api/recognize/person-grouping/ensure', async (req, res) => {
    try {
      const body = JSON.stringify(req.body ?? {})
      await handlePersonGroupingEnsureRequest(req, res, body)
    } catch (err) {
      console.error('[PhotoFind:Backend] person_grouping_ensure_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'PERSON_GROUPING_FAILED', message: 'No pudimos iniciar la agrupación por personas.' },
      })
    }
  })

  app.post('/api/recognize/person-grouping/process', async (req, res) => {
    try {
      const body = JSON.stringify(req.body ?? {})
      await handlePersonGroupingProcessRequest(req, res, body)
    } catch (err) {
      console.error('[PhotoFind:Backend] person_grouping_process_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'PERSON_GROUPING_FAILED', message: 'No pudimos procesar la agrupación por personas.' },
      })
    }
  })

  app.get('/api/recognize/person-groups', async (req, res) => {
    try {
      await handlePersonGroupsListRequest(req, res)
    } catch (err) {
      console.error('[PhotoFind:Backend] person_groups_list_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'PERSON_GROUPING_FAILED', message: 'No pudimos listar las personas del álbum.' },
      })
    }
  })

  app.get('/api/recognize/person-group', async (req, res) => {
    try {
      await handlePersonGroupDetailRequest(req, res)
    } catch (err) {
      console.error('[PhotoFind:Backend] person_group_detail_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'PERSON_GROUPING_FAILED', message: 'No pudimos cargar el grupo.' },
      })
    }
  })

  app.post('/api/recognize/collection-prepare', async (req, res) => {
    try {
      const body = JSON.stringify(req.body ?? {})
      await handlePrepareCollectionRequest(req, res, body)
    } catch (err) {
      console.error('[PhotoFind:Backend] collection_prepare_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'RECOGNITION_SEARCH_FAILED', message: 'No pudimos preparar el análisis del álbum.' },
      })
    }
  })

  app.post('/api/recognize/collection-index', async (req, res) => {
    try {
      const body = JSON.stringify(req.body ?? {})
      await handleIndexAlbumBatchRequest(req, res, body)
    } catch (err) {
      console.error('[PhotoFind:Backend] collection_index_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'RECOGNITION_INDEXING_FAILED', message: 'No pudimos indexar caras del álbum.' },
      })
    }
  })

  app.post('/api/recognize/collection-search', async (req, res) => {
    try {
      const body = JSON.stringify(req.body ?? {})
      await handleSearchCollectionRequest(req, res, body)
    } catch (err) {
      console.error('[PhotoFind:Backend] collection_search_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'RECOGNITION_SEARCH_FAILED', message: 'No pudimos buscar coincidencias en el álbum.' },
      })
    }
  })

  app.post('/api/recognize/validate-reference', async (req, res) => {
    try {
      const body = JSON.stringify(req.body ?? {})
      await handleValidateReferenceRequest(req, res, body)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      console.error('[PhotoFind:Server] validate_reference_error', { stage: 'express_wrapper', message, stack })
      res.status(500).json({
        ok: false,
        error: { code: 'REFERENCE_VALIDATION_FAILED', message },
      })
    }
  })

  app.post('/api/recognize/select-reference-face', async (req, res) => {
    try {
      const body = JSON.stringify(req.body ?? {})
      await handleSelectReferenceFaceRequest(req, res, body)
    } catch (err) {
      console.error('[PhotoFind:Backend] select_face_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'REFERENCE_VALIDATION_FAILED', message: 'No pudimos validar la cara seleccionada.' },
      })
    }
  })

  app.get('/api/auth/me', async (req, res) => {
    try {
      await handleMeRequest(req, res)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      console.error('[PhotoFind:Server] auth_me_error', { stage: 'express_wrapper', message, stack })
      res.status(500).json({
        ok: false,
        error: { code: 'AUTH_ME_FAILED', message },
      })
    }
  })

  app.get('/api/auth/dashboard', async (req, res) => {
    await handleDashboardRequest(req, res)
  })

  app.post('/api/auth/active-album-job/cancel', async (req, res) => {
    try {
      await handleCancelActiveAlbumJobRequest(req, res, JSON.stringify(req.body ?? {}))
    } catch (err) {
      console.error('[PhotoFind:Backend] cancel_active_album_job_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'ALBUM_JOB_FAILED', message: 'No pudimos cancelar el análisis.' },
      })
    }
  })

  app.post('/api/auth/search-history', async (req, res) => {
    await handleRecordSearchRequest(req, res, JSON.stringify(req.body ?? {}))
  })

  app.get('/api/auth/facial-profile', async (req, res) => {
    await handleGetFacialProfileRequest(req, res)
  })

  app.post('/api/auth/facial-profile', async (req, res) => {
    try {
      await handleSaveFacialProfileRequest(req, res, JSON.stringify(req.body ?? {}))
    } catch (err) {
      console.error('[PhotoFind:Backend] facial_profile_save_unhandled', err instanceof Error ? err.message : err)
      res.status(500).json({
        ok: false,
        error: { code: 'PROFILE_SAVE_FAILED', message: 'No pudimos guardar el perfil facial.' },
      })
    }
  })

  app.delete('/api/auth/facial-profile', async (req, res) => {
    await handleDeleteFacialProfileRequest(req, res)
  })

  app.post('/api/auth/facial-profile/use', async (req, res) => {
    await handleUseFacialProfileRequest(req, res)
  })

  if (serveStatic) {
    const distPath = path.join(__dirname, '../dist')
    app.use(express.static(distPath))
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  return app
}
