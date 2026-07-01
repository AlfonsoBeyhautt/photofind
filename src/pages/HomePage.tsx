import { useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Navbar } from '../components/layout/Navbar'
import { GlowOrbs } from '../components/effects/GlowOrbs'
import { ParticleBackground } from '../components/effects/ParticleBackground'
import { HeroSection } from '../components/flow/HeroSection'
import { PersonSelection, type PersonContinueData } from '../components/flow/PersonSelection'
import { ProcessingScreen } from '../components/flow/ProcessingScreen'
import { ResultsScreen } from '../components/flow/ResultsScreen'
import { PremiumSection } from '../components/flow/PremiumSection'
import { useAlbum } from '../context/AlbumContext'
import { useAuth } from '../context/AuthContext'
import { recordSearch } from '../lib/auth/authClient'
import { resetAllProcessingRuns } from '../lib/processing/processingRunGuard'
import type { RecognitionSearchResult } from '../types/recognition'

type FlowStep = 'hero' | 'person' | 'processing' | 'results'

type FlowData = PersonContinueData & {
  albumUrl: string
}

export function HomePage() {
  const { album, thumbnailsReady, setAlbumUrl, resetAlbum } = useAlbum()
  const { isLoggedIn, user } = useAuth()
  const [step, setStep] = useState<FlowStep>('hero')
  const [flowData, setFlowData] = useState<FlowData | null>(null)
  const [searchResult, setSearchResult] = useState<RecognitionSearchResult | null>(null)

  const handleAnalyze = useCallback((url: string) => {
    setAlbumUrl(url)
    setSearchResult(null)
    setFlowData({
      albumUrl: url,
      method: 'upload',
      category: 'fiesta',
      extraInfo: {},
      referenceToken: '',
      faceBox: { left: 0, top: 0, width: 0, height: 0 },
    })
    setStep('person')
  }, [setAlbumUrl])

  const handlePersonContinue = useCallback((data: PersonContinueData) => {
    setFlowData((prev) => prev ? { ...prev, ...data } : null)
    setSearchResult(null)
    setStep('processing')
  }, [])

  const handleProcessingComplete = useCallback((result: RecognitionSearchResult) => {
    setSearchResult(result)
    setStep('results')

    if (isLoggedIn && album && flowData) {
      void recordSearch({
        albumName: album.folderName,
        albumUrl: flowData.albumUrl,
        provider: album.source,
        eventCategory: flowData.category,
        photosFound: result.matchedImageIds.length,
        totalPhotos: result.albumTotal,
      })
    }
  }, [isLoggedIn, album, flowData])

  const handleProcessingError = useCallback(() => {
    resetAllProcessingRuns()
    setStep('hero')
    setFlowData(null)
    setSearchResult(null)
  }, [])

  const handleRestart = useCallback(() => {
    resetAllProcessingRuns()
    resetAlbum()
    setStep('hero')
    setFlowData(null)
    setSearchResult(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [resetAlbum])

  return (
    <div className="relative min-h-screen">
      <GlowOrbs />
      <ParticleBackground />
      <Navbar />

      <main className="relative z-10">
        <AnimatePresence mode="wait">
          {step === 'hero' && (
            <HeroSection key="hero" onAnalyze={handleAnalyze} />
          )}
          {step === 'person' && (
            <PersonSelection
              key="person"
              onContinue={handlePersonContinue}
              onBack={() => { setStep('hero'); setFlowData(null) }}
            />
          )}
          {step === 'processing' && flowData && flowData.referenceToken && (
            <ProcessingScreen
              key={`processing-${flowData.albumUrl}-${flowData.referenceToken}`}
              albumUrl={flowData.albumUrl}
              referenceToken={flowData.referenceToken}
              qualityWarning={flowData.qualityWarning}
              userId={user?.id ?? null}
              onComplete={handleProcessingComplete}
              onError={handleProcessingError}
            />
          )}
          {step === 'results' && flowData && album && thumbnailsReady && searchResult && (
            <ResultsScreen
              key="results"
              album={album}
              category={flowData.category}
              searchResult={searchResult}
              qualityWarning={flowData.qualityWarning}
              onRestart={handleRestart}
            />
          )}
        </AnimatePresence>

        {step === 'hero' && <PremiumSection />}
      </main>
    </div>
  )
}
