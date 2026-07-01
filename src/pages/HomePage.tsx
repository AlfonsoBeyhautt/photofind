import { useState, useCallback, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Navbar } from '../components/layout/Navbar'
import { GlowOrbs } from '../components/effects/GlowOrbs'
import { ParticleBackground } from '../components/effects/ParticleBackground'
import { HeroSection, type AlbumFlowMode } from '../components/flow/HeroSection'
import { PersonSelection, type PersonContinueData } from '../components/flow/PersonSelection'
import { ProcessingScreen } from '../components/flow/ProcessingScreen'
import { ResultsScreen } from '../components/flow/ResultsScreen'
import { PremiumSection } from '../components/flow/PremiumSection'
import { useAlbum } from '../context/AlbumContext'
import { useAuth } from '../context/AuthContext'
import { recordSearch } from '../lib/auth/authClient'
import { resetAllProcessingRuns } from '../lib/processing/processingRunGuard'
import type { EventCategory } from '../lib/eventCategories'
import type {
  DashboardStartSearchState,
  DashboardViewResultsState,
} from '../lib/dashboard/dashboardNavigation'

import type { ResumeAlbumJobState } from '../lib/recognition/activeAlbumJobs'
import type { RecognitionSearchResult, RecognitionSearchMethod } from '../types/recognition'

type FlowStep = 'hero' | 'person' | 'processing' | 'results'

type FlowData = PersonContinueData & {
  albumUrl: string
  flowMode?: AlbumFlowMode
  category?: EventCategory | null
}

export function HomePage() {
  const { album, thumbnailsReady, setAlbumUrl, setThumbnailsReady, fetchAlbum, resetAlbum } = useAlbum()
  const { isLoggedIn, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [step, setStep] = useState<FlowStep>('hero')
  const [flowData, setFlowData] = useState<FlowData | null>(null)
  const [searchResult, setSearchResult] = useState<RecognitionSearchResult | null>(null)
  const [initialRetry, setInitialRetry] = useState(false)

  useEffect(() => {
    const resume = (location.state as { resumeAlbumJob?: ResumeAlbumJobState } | null)?.resumeAlbumJob
    if (!resume?.albumUrl || !resume.referenceToken) return

    setAlbumUrl(resume.albumUrl)
    setSearchResult(null)
    setInitialRetry(Boolean(resume.retry))
    setFlowData({
      albumUrl: resume.albumUrl,
      method: 'upload',
      referenceToken: resume.referenceToken,
      faceBox: { left: 0, top: 0, width: 0, height: 0 },
    })
    setStep('processing')
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate, setAlbumUrl])

  useEffect(() => {
    const start = (location.state as { startSearch?: DashboardStartSearchState } | null)?.startSearch
    if (!start?.albumUrl) return

    setAlbumUrl(start.albumUrl)
    setSearchResult(null)
    setInitialRetry(false)

    if (start.mode === 'group') {
      setFlowData({
        albumUrl: start.albumUrl,
        method: 'upload',
        category: (start.eventCategory ?? null) as EventCategory | null,
        referenceToken: '',
        faceBox: { left: 0, top: 0, width: 0, height: 0 },
        flowMode: 'group',
      })
      setStep('processing')
    } else {
      setFlowData({
        albumUrl: start.albumUrl,
        method: 'upload',
        category: (start.eventCategory ?? null) as EventCategory | null,
        referenceToken: '',
        faceBox: { left: 0, top: 0, width: 0, height: 0 },
        flowMode: 'search',
      })
      setStep('person')
    }

    navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate, setAlbumUrl])

  useEffect(() => {
    const view = (location.state as { viewResults?: DashboardViewResultsState } | null)?.viewResults
    if (!view?.albumUrl || !view.matchedImageIds?.length) return

    let cancelled = false

    const open = async () => {
      setAlbumUrl(view.albumUrl)
      setSearchResult(null)
      setInitialRetry(false)
      setFlowData({
        albumUrl: view.albumUrl,
        method: 'upload',
        category: (view.eventCategory ?? null) as EventCategory | null,
        referenceToken: '',
        faceBox: { left: 0, top: 0, width: 0, height: 0 },
        flowMode: 'search',
      })

      const { album: fetched, error } = await fetchAlbum(view.albumUrl)
      if (cancelled) return
      if (error || !fetched) {
        setStep('person')
        return
      }

      const method = (view.searchMethod === 'compare-fallback' ? 'compare-fallback' : 'collection') as RecognitionSearchMethod
      setSearchResult({
        matchedImageIds: view.matchedImageIds,
        analyzedCount: view.analyzedCount ?? fetched.totalImages,
        albumTotal: fetched.totalImages,
        truncated: false,
        collectionReused: true,
        searchMethod: method,
      })
      setThumbnailsReady(true)
      setStep('results')
      navigate(location.pathname, { replace: true, state: null })
    }

    void open()
    return () => { cancelled = true }
  }, [location.state, location.pathname, navigate, setAlbumUrl, fetchAlbum, setThumbnailsReady])

  const handleAnalyze = useCallback((url: string, mode: AlbumFlowMode = 'search') => {
    setAlbumUrl(url)
    setSearchResult(null)
    setInitialRetry(false)

    if (mode === 'group') {
      setFlowData({
        albumUrl: url,
        method: 'upload',
        category: null,
        referenceToken: '',
        faceBox: { left: 0, top: 0, width: 0, height: 0 },
        flowMode: 'group',
      })
      setStep('processing')
      return
    }

    setFlowData({
      albumUrl: url,
      method: 'upload',
      category: null,
      referenceToken: '',
      faceBox: { left: 0, top: 0, width: 0, height: 0 },
      flowMode: 'search',
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
        ...(flowData.category ? { eventCategory: flowData.category } : {}),
        photosFound: result.matchedImageIds.length,
        totalPhotos: result.albumTotal,
        matchedImageIds: result.matchedImageIds,
        analyzedCount: result.analyzedCount,
        searchMethod: result.searchMethod ?? null,
      })
    }
  }, [isLoggedIn, album, flowData])

  const handleProcessingError = useCallback(() => {
    resetAllProcessingRuns()
    setStep('hero')
    setFlowData(null)
    setSearchResult(null)
  }, [])

  const handleIndexComplete = useCallback(() => {
    if (!flowData?.albumUrl) return
    navigate(`/personas?albumUrl=${encodeURIComponent(flowData.albumUrl)}`)
  }, [flowData?.albumUrl, navigate])

  const handleRestart = useCallback(() => {
    resetAllProcessingRuns()
    resetAlbum()
    setStep('hero')
    setFlowData(null)
    setSearchResult(null)
    setInitialRetry(false)
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
              initialCategory={flowData?.category ?? null}
              onContinue={handlePersonContinue}
              onBack={() => { setStep('hero'); setFlowData(null) }}
            />
          )}
          {step === 'processing' && flowData && flowData.flowMode === 'group' && (
            <ProcessingScreen
              key={`indexing-${flowData.albumUrl}-${initialRetry ? 'retry' : 'run'}`}
              albumUrl={flowData.albumUrl}
              mode="index-only"
              eventCategory={flowData.category ?? null}
              userId={user?.id ?? null}
              initialRetry={initialRetry}
              onIndexComplete={handleIndexComplete}
              onError={handleProcessingError}
            />
          )}
          {step === 'processing' && flowData && flowData.flowMode !== 'group' && flowData.referenceToken && (
            <ProcessingScreen
              key={`processing-${flowData.albumUrl}-${flowData.referenceToken}-${initialRetry ? 'retry' : 'run'}`}
              albumUrl={flowData.albumUrl}
              referenceToken={flowData.referenceToken}
              eventCategory={flowData.category ?? null}
              qualityWarning={flowData.qualityWarning}
              userId={user?.id ?? null}
              initialRetry={initialRetry}
              onComplete={handleProcessingComplete}
              onError={handleProcessingError}
            />
          )}
          {step === 'results' && flowData && album && thumbnailsReady && searchResult && (
            <ResultsScreen
              key="results"
              album={album}
              category={flowData.category ?? null}
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
