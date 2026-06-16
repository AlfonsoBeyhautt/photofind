import type { DriveError, DriveErrorCode } from '../../types/album'

const MESSAGES: Record<DriveErrorCode, string> = {
  INVALID_URL:
    'El enlace no parece ser una carpeta válida de Google Drive.',
  PRIVATE_FOLDER:
    'No pudimos acceder a la carpeta. Verificá que esté compartida como "Cualquier persona con el enlace".',
  EMPTY_FOLDER:
    'La carpeta está vacía.',
  NO_IMAGES:
    'Encontramos archivos, pero no imágenes compatibles.',
  API_KEY_MISSING:
    'Falta configurar la API key de Google Drive.',
  UNKNOWN_ERROR:
    'Ocurrió un error al leer el álbum.',
  PROVIDER_NOT_READY:
    'Este proveedor aún no está disponible.',
  DROPBOX_TOKEN_INVALID:
    'El token de Dropbox es inválido o expiró. Regenerá DROPBOX_ACCESS_TOKEN y reiniciá el servidor.',
  DROPBOX_PERMISSION_MISSING:
    'El token de Dropbox no tiene permisos suficientes (sharing.read, files.metadata.read).',
  DROPBOX_INVALID_SHARED_LINK:
    'El enlace de Dropbox parece incompleto o mal formado. Copiá la URL completa desde el navegador.',
  PRIVATE_OR_INACCESSIBLE_FOLDER:
    'No pudimos acceder a esta carpeta compartida de Dropbox.',
  PIXIESET_PASSWORD_REQUIRED:
    'Esta galería de Pixieset requiere contraseña. Solo soportamos galerías públicas.',
  PIXIESET_UNSUPPORTED_GALLERY:
    'No pudimos leer esta galería de Pixieset. Usá el link directo a una galería (ej. …/highlights/).',
  PIXIESET_BLOCKED:
    'Pixieset bloquea el acceso automático en algunas galerías. Por ahora no podemos analizar este enlace directamente.',
  PIXIESET_NO_IMAGES_FOUND:
    'No encontramos imágenes públicas en esta galería de Pixieset.',
  PIXIESET_FETCH_FAILED:
    'No pudimos obtener las fotos de Pixieset.',
  ONEDRIVE_INVALID_URL:
    'El enlace no parece ser una carpeta pública válida de OneDrive o SharePoint.',
  ONEDRIVE_PRIVATE_OR_INACCESSIBLE:
    'No pudimos acceder a esta carpeta de OneDrive. Verificá que el enlace sea público.',
  ONEDRIVE_EMPTY_FOLDER:
    'La carpeta de OneDrive está vacía.',
  ONEDRIVE_NO_IMAGES:
    'Encontramos archivos, pero no imágenes compatibles en OneDrive.',
  ONEDRIVE_PROVIDER_ERROR:
    'No pudimos conectar con OneDrive. Verificá la configuración del servidor.',
  WETRANSFER_INVALID_URL:
    'El enlace no parece ser un transfer válido de WeTransfer (we.tl o wetransfer.com/downloads).',
  WETRANSFER_EXPIRED:
    'Este enlace de WeTransfer expiró o ya no está disponible.',
  WETRANSFER_PASSWORD_REQUIRED:
    'Este transfer de WeTransfer está protegido con contraseña. Solo soportamos enlaces públicos sin contraseña.',
  WETRANSFER_NO_IMAGES:
    'Este transfer no contiene imágenes compatibles.',
  WETRANSFER_NOT_READY:
    'El transfer de WeTransfer aún no está listo para descargar. Probá de nuevo en unos minutos.',
  WETRANSFER_FETCH_FAILED:
    'No pudimos leer el transfer de WeTransfer.',
}

export function driveError(code: DriveErrorCode, message?: string): DriveError {
  return { code, message: message ?? MESSAGES[code] }
}

export function getDriveErrorMessage(error: DriveError): string {
  return error.message
}
