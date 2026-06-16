export type AlbumProvider =
  | 'google-drive'
  | 'dropbox'
  | 'onedrive'
  | 'pixieset'
  | 'wetransfer'
  | 'unknown'

export interface AlbumSourceInput {
  provider: AlbumProvider
  url: string
  folderId?: string
}

export type ProviderStatus = 'active' | 'prepared' | 'beta' | 'coming-soon'

export interface ProviderMeta {
  id: AlbumProvider
  label: string
  status: ProviderStatus
  statusLabel: string
  placeholder: string
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'google-drive',
    label: 'Google Drive',
    status: 'active',
    statusLabel: 'Activo',
    placeholder: 'https://drive.google.com/drive/folders/...',
  },
  {
    id: 'dropbox',
    label: 'Dropbox',
    status: 'active',
    statusLabel: 'Activo',
    placeholder: 'https://www.dropbox.com/scl/fo/...',
  },
  {
    id: 'pixieset',
    label: 'Pixieset',
    status: 'active',
    statusLabel: 'Activo',
    placeholder: 'https://fotografo.pixieset.com/album/',
  },
  {
    id: 'wetransfer',
    label: 'WeTransfer',
    status: 'active',
    statusLabel: 'Activo',
    placeholder: 'https://we.tl/t-... o wetransfer.com/downloads/...',
  },
  {
    id: 'onedrive',
    label: 'OneDrive',
    status: 'coming-soon',
    statusLabel: 'Próximamente',
    placeholder: 'https://1drv.ms/f/s!...',
  },
]

export function getProviderMeta(provider: AlbumProvider): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === provider)
}
