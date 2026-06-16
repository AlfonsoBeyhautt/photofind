import 'dotenv/config'
import express from 'express'
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
import { getGoogleDriveApiKey, loadServerEnv, logApiKeyStatus } from './env'
import { handleCompareAlbumRequest } from './recognize/compareSearchHandler'
import { handleSelectReferenceFaceRequest, handleValidateReferenceRequest } from './recognize/referenceHandler'
import {
  handleDeleteFacialProfileRequest,
  handleGetFacialProfileRequest,
  handleMeRequest,
  handleSaveFacialProfileRequest,
  handleUseFacialProfileRequest,
} from './auth/authHandler'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT) || 3001

loadServerEnv(path.join(__dirname, '..'))
logApiKeyStatus(path.join(__dirname, '..'))

const app = express()
app.use(express.json({ limit: '15mb' }))

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
  } catch {
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
  } catch {
    res.status(500).json({
      ok: false,
      error: { code: 'REFERENCE_VALIDATION_FAILED', message: 'No pudimos validar la foto de referencia.' },
    })
  }
})

app.post('/api/recognize/select-reference-face', async (req, res) => {
  try {
    const body = JSON.stringify(req.body ?? {})
    await handleSelectReferenceFaceRequest(req, res, body)
  } catch {
    res.status(500).json({
      ok: false,
      error: { code: 'REFERENCE_VALIDATION_FAILED', message: 'No pudimos validar la cara seleccionada.' },
    })
  }
})

app.get('/api/auth/me', async (req, res) => {
  await handleMeRequest(req, res)
})

app.get('/api/auth/facial-profile', async (req, res) => {
  await handleGetFacialProfileRequest(req, res)
})

app.post('/api/auth/facial-profile', async (req, res) => {
  await handleSaveFacialProfileRequest(req, res, JSON.stringify(req.body ?? {}))
})

app.delete('/api/auth/facial-profile', async (req, res) => {
  await handleDeleteFacialProfileRequest(req, res)
})

app.post('/api/auth/facial-profile/use', async (req, res) => {
  await handleUseFacialProfileRequest(req, res)
})

const distPath = path.join(__dirname, '../dist')
app.use(express.static(distPath))
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`PhotoFind server running on http://localhost:${PORT}`)
})
