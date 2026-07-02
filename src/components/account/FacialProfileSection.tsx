import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, User, RefreshCw } from 'lucide-react'
import { Button } from '../ui/Button'
import { ErrorBanner } from '../ui/ErrorBanner'
import { useAuth } from '../../context/AuthContext'
import { deleteFacialProfile } from '../../lib/auth/authClient'
import { FacialProfileSetup } from './FacialProfileSetup'
import { FacialProfileAdvancedSection } from './FacialProfileAdvancedSection'
import { cn } from '../../lib/utils'

interface FacialProfileSectionProps {
  compact?: boolean
}

const PRIVACY_TEXT =
  'Tu perfil facial se usa solo para encontrar tus fotos en álbumes que vos pegás. Podés borrarlo cuando quieras.'

export function FacialProfileSection({ compact }: FacialProfileSectionProps) {
  const { facialProfile, setFacialProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [referenceCount, setReferenceCount] = useState(
    facialProfile.hasProfile ? (facialProfile.referenceCount ?? 1) : 0,
  )
  const [hasAdvancedProfile, setHasAdvancedProfile] = useState(
    facialProfile.hasProfile ? (facialProfile.hasAdvancedProfile ?? false) : false,
  )

  const handleDelete = async () => {
    if (!confirm('¿Borrar tu perfil facial? No podrás reutilizarlo en búsquedas hasta crear uno nuevo.')) return
    setDeleting(true)
    setError(null)
    try {
      const result = await deleteFacialProfile()
      if (!result.ok) {
        setError('error' in result ? result.error.message : 'No pudimos borrar el perfil facial.')
        return
      }
      setFacialProfile(result.facialProfile)
      setReferenceCount(0)
      setHasAdvancedProfile(false)
      setEditing(false)
    } catch {
      setError('No pudimos borrar el perfil facial.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={cn('glass rounded-2xl p-4 sm:p-6', compact ? '' : 'mb-8')}>
      <h3 className="font-display font-semibold text-lg mb-1 flex items-center gap-2">
        <User className="w-5 h-5 text-accent-bright" />
        Mi perfil facial
      </h3>
      <p className="text-sm text-text-muted mb-4">{PRIVACY_TEXT}</p>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {facialProfile.hasProfile && !editing ? (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm text-emerald-400 font-medium">
                Perfil facial guardado
                {hasAdvancedProfile && ` · ${referenceCount} referencias`}
              </p>
              <p className="text-xs text-text-dim mt-1">
                Creado {new Date(facialProfile.createdAt).toLocaleDateString('es-AR')}
                {' · '}
                Actualizado {new Date(facialProfile.updatedAt).toLocaleDateString('es-AR')}
              </p>
              {facialProfile.qualityWarning && (
                <p className="text-xs text-amber-300 mt-1">{facialProfile.qualityWarning}</p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2">
              <Button variant="outline" size="md" className="w-full sm:w-auto" onClick={() => setEditing(true)} disabled={deleting}>
                <RefreshCw className="w-4 h-4" />
                Reemplazar
              </Button>
              <Button variant="ghost" size="md" className="w-full sm:w-auto" onClick={handleDelete} disabled={deleting}>
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Borrando…' : 'Borrar'}
              </Button>
            </div>
          </div>
          <FacialProfileAdvancedSection
            onAdvancedProfileChange={(advanced, count) => {
              setHasAdvancedProfile(advanced)
              setReferenceCount(count)
              if (facialProfile.hasProfile) {
                setFacialProfile({
                  ...facialProfile,
                  referenceCount: count,
                  hasAdvancedProfile: advanced,
                })
              }
            }}
          />
        </>
      ) : (
        <FacialProfileSetup
          onSaved={(profile) => {
            setFacialProfile(profile)
            setEditing(false)
            setError(null)
          }}
          onError={(msg) => setError(msg || null)}
          onCancel={facialProfile.hasProfile ? () => setEditing(false) : undefined}
        />
      )}
    </div>
  )
}

export function FacialProfileGuestPrompt() {
  return (
    <div className="mt-4 text-center py-4 px-3 rounded-xl bg-bg-elevated/50 border border-border-subtle">
      <p className="text-sm text-text-muted mb-3">
        Creá una cuenta para guardar tu perfil facial y reutilizarlo.
      </p>
      <Link to="/registro">
        <Button variant="outline" size="sm">Crear cuenta</Button>
      </Link>
    </div>
  )
}

export { PRIVACY_TEXT as facialProfilePrivacyText }
