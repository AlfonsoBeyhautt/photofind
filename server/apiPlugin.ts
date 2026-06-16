import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fetchGoogleDriveAlbum } from './driveService'
import { fetchDropboxAlbum } from './dropboxService'
import { fetchPixiesetAlbum } from './pixiesetService'
import { fetchOneDriveAlbum } from './onedriveService'
import { getGoogleDriveApiKey, loadServerEnv, logApiKeyStatus } from './env'
import { handleThumbnailRequest, parseThumbnailPath } from './thumbnailHandler'
import {
  handleDropboxFileRequest,
  handleDropboxThumbnailRequest,
  parseDropboxFilePath,
  parseDropboxThumbnailPath,
} from './dropboxThumbnailHandler'
import {
  handleOneDriveFileRequest,
  handleOneDriveThumbnailRequest,
  parseOneDriveFilePath,
  parseOneDriveThumbnailPath,
} from './onedriveThumbnailHandler'
import {
  handleWeTransferFileRequest,
  handleWeTransferThumbnailRequest,
  parseWeTransferFilePath,
  parseWeTransferThumbnailPath,
} from './wetransferThumbnailHandler'
import { fetchWeTransferAlbum } from './wetransferService'
import { handleCompareAlbumRequest } from './recognize/compareSearchHandler'
import { handleSelectReferenceFaceRequest, handleValidateReferenceRequest } from './recognize/referenceHandler'
import {
  handleDeleteFacialProfileRequest,
  handleDashboardRequest,
  handleGetFacialProfileRequest,
  handleMeRequest,
  handleRecordSearchRequest,
  handleSaveFacialProfileRequest,
  handleUseFacialProfileRequest,
} from './auth/authHandler'

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

export function driveApiPlugin(): Plugin {
  return {
    name: 'photofind-drive-api',
    configureServer(server) {
      const root = server.config.envDir || process.cwd()
      loadServerEnv(root)
      logApiKeyStatus(root)

      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/auth/')) {
          try {
            const body = req.method === 'GET' || req.method === 'DELETE' ? '' : await readBody(req)

            if (req.url.startsWith('/api/auth/me') && req.method === 'GET') {
              await handleMeRequest(req, res)
              return
            }
            if (req.url.startsWith('/api/auth/dashboard') && req.method === 'GET') {
              await handleDashboardRequest(req, res)
              return
            }
            if (req.url.startsWith('/api/auth/search-history') && req.method === 'POST') {
              await handleRecordSearchRequest(req, res, body)
              return
            }
            if (req.url.startsWith('/api/auth/facial-profile/use') && req.method === 'POST') {
              await handleUseFacialProfileRequest(req, res)
              return
            }
            if (req.url === '/api/auth/facial-profile' && req.method === 'GET') {
              await handleGetFacialProfileRequest(req, res)
              return
            }
            if (req.url === '/api/auth/facial-profile' && req.method === 'POST') {
              await handleSaveFacialProfileRequest(req, res, body)
              return
            }
            if (req.url === '/api/auth/facial-profile' && req.method === 'DELETE') {
              await handleDeleteFacialProfileRequest(req, res)
              return
            }
          } catch {
            sendJson(res, 500, { ok: false, error: { code: 'AUTH_FAILED', message: 'No pudimos completar la solicitud.' } })
            return
          }
        }

        const wetransferThumb = req.url ? parseWeTransferThumbnailPath(req.url) : null
        if (wetransferThumb && req.method === 'GET') {
          await handleWeTransferThumbnailRequest(req, res, wetransferThumb.token, req.url!)
          return
        }

        const wetransferFile = req.url ? parseWeTransferFilePath(req.url) : null
        if (wetransferFile && req.method === 'GET') {
          await handleWeTransferFileRequest(req, res, wetransferFile.token, req.url!)
          return
        }

        if (req.url?.startsWith('/api/wetransfer/folder') && req.method === 'POST') {
          try {
            const body = await readBody(req)
            const { url: wetransferUrl } = JSON.parse(body) as { url?: string }

            if (!wetransferUrl) {
              sendJson(res, 400, { ok: false, error: { code: 'WETRANSFER_INVALID_URL', message: 'Falta el campo url.' } })
              return
            }

            const result = await fetchWeTransferAlbum(wetransferUrl)
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 400, { ok: false, error: { code: 'WETRANSFER_FETCH_FAILED', message: 'Solicitud inválida.' } })
          }
          return
        }

        const onedriveThumb = req.url ? parseOneDriveThumbnailPath(req.url) : null
        if (onedriveThumb && req.method === 'GET') {
          await handleOneDriveThumbnailRequest(req, res, onedriveThumb.token, req.url!)
          return
        }

        const onedriveFile = req.url ? parseOneDriveFilePath(req.url) : null
        if (onedriveFile && req.method === 'GET') {
          await handleOneDriveFileRequest(req, res, onedriveFile.token, req.url!)
          return
        }

        const dropboxThumb = req.url ? parseDropboxThumbnailPath(req.url) : null
        if (dropboxThumb && req.method === 'GET') {
          await handleDropboxThumbnailRequest(req, res, dropboxThumb.token, req.url!)
          return
        }

        const dropboxFile = req.url ? parseDropboxFilePath(req.url) : null
        if (dropboxFile && req.method === 'GET') {
          await handleDropboxFileRequest(req, res, dropboxFile.token, req.url!)
          return
        }

        if (req.url?.startsWith('/api/onedrive/folder') && req.method === 'POST') {
          try {
            const body = await readBody(req)
            const { url: onedriveUrl } = JSON.parse(body) as { url?: string }

            if (!onedriveUrl) {
              sendJson(res, 400, { ok: false, error: { code: 'ONEDRIVE_INVALID_URL', message: 'Falta el campo url.' } })
              return
            }

            const result = await fetchOneDriveAlbum(onedriveUrl)
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 400, { ok: false, error: { code: 'ONEDRIVE_PROVIDER_ERROR', message: 'Solicitud inválida.' } })
          }
          return
        }

        if (req.url?.startsWith('/api/pixieset/folder') && req.method === 'POST') {
          try {
            const body = await readBody(req)
            const { url: pixiesetUrl } = JSON.parse(body) as { url?: string }

            if (!pixiesetUrl) {
              sendJson(res, 400, { ok: false, error: { code: 'INVALID_URL', message: 'Falta el campo url.' } })
              return
            }

            const result = await fetchPixiesetAlbum(pixiesetUrl)
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 400, { ok: false, error: { code: 'PIXIESET_FETCH_FAILED', message: 'Solicitud inválida.' } })
          }
          return
        }

        if (req.url?.startsWith('/api/dropbox/folder') && req.method === 'POST') {
          try {
            const body = await readBody(req)
            const { url: dropboxUrl } = JSON.parse(body) as { url?: string }

            if (!dropboxUrl) {
              sendJson(res, 400, { ok: false, error: { code: 'INVALID_URL', message: 'Falta el campo url.' } })
              return
            }

            const result = await fetchDropboxAlbum(dropboxUrl)
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 400, { ok: false, error: { code: 'UNKNOWN_ERROR', message: 'Solicitud inválida.' } })
          }
          return
        }

        if (req.url?.startsWith('/api/recognize/compare-album') && req.method === 'POST') {
          try {
            const body = await readBody(req)
            await handleCompareAlbumRequest(req, res, body)
          } catch {
            sendJson(res, 500, {
              ok: false,
              error: { code: 'RECOGNITION_SEARCH_FAILED', message: 'No pudimos buscar coincidencias en el álbum.' },
            })
          }
          return
        }

        if (req.url?.startsWith('/api/recognize/select-reference-face') && req.method === 'POST') {
          try {
            const body = await readBody(req)
            await handleSelectReferenceFaceRequest(req, res, body)
          } catch {
            sendJson(res, 500, {
              ok: false,
              error: { code: 'REFERENCE_VALIDATION_FAILED', message: 'No pudimos validar la cara seleccionada.' },
            })
          }
          return
        }

        if (req.url?.startsWith('/api/recognize/validate-reference') && req.method === 'POST') {
          try {
            const body = await readBody(req)
            await handleValidateReferenceRequest(req, res, body)
          } catch {
            sendJson(res, 500, {
              ok: false,
              error: { code: 'REFERENCE_VALIDATION_FAILED', message: 'No pudimos validar la foto de referencia.' },
            })
          }
          return
        }

        if (!req.url?.startsWith('/api/drive/')) {
          next()
          return
        }

        const thumb = parseThumbnailPath(req.url)
        if (thumb && req.method === 'GET') {
          await handleThumbnailRequest(req, res, thumb.fileId, req.url!)
          return
        }

        if (!req.url.startsWith('/api/drive/folder')) {
          next()
          return
        }

        const apiKey = getGoogleDriveApiKey()

        if (req.method === 'GET') {
          const url = new URL(req.url, 'http://localhost')
          const driveUrl = url.searchParams.get('url')

          if (!driveUrl) {
            sendJson(res, 400, { ok: false, error: { code: 'INVALID_URL', message: 'Falta el parámetro url.' } })
            return
          }

          const result = await fetchGoogleDriveAlbum(driveUrl, apiKey)
          sendJson(res, result.ok ? 200 : 400, result)
          return
        }

        if (req.method === 'POST') {
          try {
            const body = await readBody(req)
            const { url: driveUrl } = JSON.parse(body) as { url?: string }

            if (!driveUrl) {
              sendJson(res, 400, { ok: false, error: { code: 'INVALID_URL', message: 'Falta el campo url.' } })
              return
            }

            const result = await fetchGoogleDriveAlbum(driveUrl, apiKey)
            sendJson(res, result.ok ? 200 : 400, result)
          } catch {
            sendJson(res, 400, { ok: false, error: { code: 'UNKNOWN_ERROR', message: 'Solicitud inválida.' } })
          }
          return
        }

        sendJson(res, 405, { ok: false, error: { code: 'UNKNOWN_ERROR', message: 'Método no permitido.' } })
      })
    },
  }
}
