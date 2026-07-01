import { useState, useCallback, type ElementType } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Upload, Camera, User, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Button } from '../ui/Button'
import { ErrorBanner } from '../ui/ErrorBanner'
import { WarningBanner } from '../ui/WarningBanner'
import { ReferenceUpload } from '../recognition/ReferenceUpload'
import { ReferenceCamera } from '../recognition/ReferenceCamera'
import { FacialProfileSetup } from '../account/FacialProfileSetup'
import { FacialProfileGuestPrompt, facialProfilePrivacyText } from '../account/FacialProfileSection'
import { getAuthErrorMessage, useFacialProfile } from '../../lib/auth/authClient'
import { EventCategoryPicker } from './EventCategoryPicker'
import type { EventCategory } from '../../lib/eventCategories'
import type { FaceBox, ValidateReferenceSuccess } from '../../types/recognition'
import { cn } from '../../lib/utils'

export type PersonMethod = 'upload' | 'selfie' | 'profile'

export interface PersonContinueData {
  method: PersonMethod
  category?: EventCategory | null
  extraInfo?: Record<string, string>
  referenceToken: string
  faceBox: FaceBox
  qualityTier?: ValidateReferenceSuccess['qualityTier']
  qualityWarning?: string
}

interface PersonSelectionProps {
  initialCategory?: EventCategory | null
  onContinue: (data: PersonContinueData) => void
  onBack: () => void
}

export function PersonSelection({ initialCategory = null, onContinue, onBack }: PersonSelectionProps) {
  const { isLoggedIn, user, facialProfile, setFacialProfile } = useAuth()
  const [method, setMethod] = useState<PersonMethod | null>(null)
  const [category, setCategory] = useState<EventCategory | null>(initialCategory)
  const [referenceToken, setReferenceToken] = useState<string | null>(null)
  const [faceBox, setFaceBox] = useState<FaceBox | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [qualityWarning, setQualityWarning] = useState<string | null>(null)
  const [qualityTier, setQualityTier] = useState<ValidateReferenceSuccess['qualityTier'] | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [creatingProfile, setCreatingProfile] = useState(false)

  const handleValidated = useCallback((result: ValidateReferenceSuccess) => {
    setReferenceToken(result.referenceToken)
    setFaceBox(result.faceBox)
    setValidationError(null)
    setQualityTier(result.qualityTier)
    setQualityWarning(result.qualityWarning ?? null)
  }, [])

  const handleCleared = useCallback(() => {
    setReferenceToken(null)
    setFaceBox(null)
    setQualityTier(null)
    setQualityWarning(null)
  }, [])

  const handleValidationError = useCallback((message: string) => {
    if (!message) {
      setValidationError(null)
      return
    }
    setReferenceToken(null)
    setFaceBox(null)
    setQualityTier(null)
    setQualityWarning(null)
    setValidationError(message)
  }, [])

  const selectMethod = (next: PersonMethod) => {
    setMethod(next)
    setReferenceToken(null)
    setFaceBox(null)
    setValidationError(null)
    setQualityTier(null)
    setQualityWarning(null)
    setCreatingProfile(false)

    if (next === 'profile' && isLoggedIn && facialProfile.hasProfile) {
      void loadSavedProfile()
    }
  }

  const loadSavedProfile = useCallback(async () => {
    setProfileLoading(true)
    setValidationError(null)
    const result = await useFacialProfile()
    setProfileLoading(false)
    if (!result.ok) {
      setReferenceToken(null)
      setFaceBox(null)
      setValidationError(getAuthErrorMessage(result.error.code, result.error.message))
      return
    }
    setReferenceToken(result.referenceToken)
    setFaceBox(result.faceBox)
    setQualityTier(result.qualityTier)
    setQualityWarning(result.qualityWarning ?? null)
  }, [])

  const canContinue = Boolean(method && referenceToken && faceBox)

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen min-h-dvh px-4 sm:px-6 page-top pb-28 max-w-5xl mx-auto safe-bottom"
    >
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-text-muted hover:text-text mb-6 sm:mb-8 transition-colors py-2 min-h-[44px]"
      >
        ← Volver
      </button>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-display text-2xl sm:text-3xl md:text-4xl font-bold mb-2"
      >
        ¿A quién querés encontrar?
      </motion.h2>
      <p className="text-text-muted mb-6">
        Subí una foto o sacate una selfie. Si hay varias personas, elegí cuál buscar.
      </p>

      {validationError && (
        <div className="mb-6">
          <ErrorBanner message={validationError} />
        </div>
      )}

      {qualityWarning && !validationError && (
        <div className="mb-6">
          <WarningBanner message={qualityWarning} />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
        <MethodCard
          icon={Upload}
          title="Subir foto"
          description="Desde galería o dispositivo"
          selected={method === 'upload'}
          onClick={() => selectMethod('upload')}
        >
          {method === 'upload' && (
            <ReferenceUpload
              onValidated={(r) => handleValidated(r)}
              onError={handleValidationError}
              onCleared={handleCleared}
            />
          )}
        </MethodCard>

        <MethodCard
          icon={Camera}
          title="Sacar selfie"
          description="Cámara frontal en vivo"
          selected={method === 'selfie'}
          onClick={() => selectMethod('selfie')}
        >
          {method === 'selfie' && (
            <ReferenceCamera
              active={method === 'selfie'}
              onValidated={(r) => handleValidated(r)}
              onError={handleValidationError}
              onCleared={handleCleared}
            />
          )}
        </MethodCard>

        {isLoggedIn && user ? (
          <MethodCard
            icon={User}
            title="Usar mi perfil guardado"
            description={facialProfile.hasProfile ? 'Referencia facial de tu cuenta' : 'Guardá tu cara para reutilizarla'}
            selected={method === 'profile'}
            onClick={() => selectMethod('profile')}
          >
            {method === 'profile' && (
              <div className="mt-4">
                <p className="text-xs text-text-dim mb-3">{facialProfilePrivacyText}</p>
                {profileLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="w-6 h-6 animate-spin text-accent" />
                  </div>
                ) : facialProfile.hasProfile ? (
                  <div className="flex flex-col items-center gap-3 py-2">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent/30 to-violet/30 flex items-center justify-center ring-2 ring-accent/30">
                      <User className="w-8 h-8 text-accent-bright" />
                    </div>
                    <span className="font-medium">{user.name}</span>
                    {referenceToken ? (
                      <p className="text-xs text-emerald-400">Perfil listo para el análisis</p>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => void loadSavedProfile()}>
                        Cargar perfil guardado
                      </Button>
                    )}
                  </div>
                ) : creatingProfile ? (
                  <FacialProfileSetup
                    onSaved={(profile) => {
                      setFacialProfile(profile)
                      setCreatingProfile(false)
                      void loadSavedProfile()
                    }}
                    onError={setValidationError}
                    onCancel={() => setCreatingProfile(false)}
                  />
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-text-muted mb-3">Todavía no creaste tu perfil facial.</p>
                    <Button size="sm" onClick={() => setCreatingProfile(true)}>
                      Crear perfil facial
                    </Button>
                    <p className="text-xs text-text-dim mt-3">
                      También podés configurarlo en{' '}
                      <Link to="/perfil" className="text-accent-bright hover:underline">Mi cuenta</Link>
                    </p>
                  </div>
                )}
              </div>
            )}
          </MethodCard>
        ) : (
          <MethodCard
            icon={User}
            title="Usar mi perfil guardado"
            description="Reutilizá tu referencia facial"
            selected={method === 'profile'}
            onClick={() => selectMethod('profile')}
          >
            {method === 'profile' && <FacialProfileGuestPrompt />}
          </MethodCard>
        )}
      </div>

      <div className="mb-8">
        <EventCategoryPicker value={category} onChange={setCategory} className="mx-0" />
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-4 mt-8 border-t border-border-subtle bg-bg/95 backdrop-blur-md safe-bottom">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 max-w-5xl mx-auto">
        {referenceToken && (
          <p className={cn(
            'text-sm sm:mr-auto text-center sm:text-left',
            qualityWarning ? 'text-amber-300' : 'text-emerald-400',
          )}>
            {qualityWarning
              ? 'Referencia aceptable — podés continuar'
              : 'Referencia validada — lista para el análisis'}
          </p>
        )}
        <Button
          size="lg"
          className="w-full sm:w-auto"
          disabled={!canContinue}
          onClick={() => {
            if (!canContinue || !method || !referenceToken || !faceBox) return
            onContinue({
              method,
              category: category ?? null,
              referenceToken,
              faceBox,
              qualityTier: qualityTier ?? undefined,
              qualityWarning: qualityWarning ?? undefined,
            })
          }}
        >
          Iniciar análisis
        </Button>
        </div>
      </div>
    </motion.div>
  )
}

function MethodCard({
  icon: Icon,
  title,
  description,
  selected,
  onClick,
  disabled,
  children,
}: {
  icon: ElementType
  title: string
  description: string
  selected: boolean
  onClick: () => void
  disabled?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'text-left p-5 rounded-2xl border transition-all',
        disabled && 'opacity-50',
        selected
          ? 'border-accent bg-accent/5 glow-blue'
          : 'border-border bg-surface/50 hover:border-accent/30 hover:bg-surface',
      )}
    >
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        className="w-full text-left min-h-[44px]"
      >
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center mb-3',
          selected ? 'bg-accent/20 text-accent-bright' : 'bg-bg-elevated text-text-muted',
        )}>
          <Icon className="w-5 h-5" />
        </div>
        <h4 className="font-semibold mb-1">{title}</h4>
        <p className="text-xs text-text-muted">{description}</p>
      </button>
      {children}
    </div>
  )
}
