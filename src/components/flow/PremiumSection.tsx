import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Crown, ChevronRight, X } from 'lucide-react'
import { DETECTED_PEOPLE, generatePhotoUrls } from '../../data/mock'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'

export function PremiumSection() {
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null)
  const person = DETECTED_PEOPLE.find((p) => p.id === selectedPerson)

  return (
    <section id="premium" className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <Badge variant="violet" className="mb-4">
            <Crown className="w-3 h-3 mr-1" />
            Función Premium
          </Badge>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            Agrupar todas las personas
          </h2>
          <p className="text-text-muted max-w-xl mx-auto">
            Descubrí quién más aparece en el álbum. La IA detecta y agrupa automáticamente a cada persona.
          </p>
        </div>

        <div className="glass rounded-2xl p-6 md:p-8 glow-blue">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {DETECTED_PEOPLE.map((p, i) => (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ y: -4, scale: 1.02 }}
                onClick={() => setSelectedPerson(p.id)}
                className={cn(
                  'flex items-center gap-4 p-4 rounded-xl border text-left transition-all',
                  'border-border bg-bg-elevated hover:border-violet/40 hover:bg-violet/5'
                )}
              >
                <img
                  src={`https://i.pravatar.cc/80?img=${p.avatarSeed}`}
                  alt={p.name}
                  className="w-14 h-14 rounded-full ring-2 ring-violet/30"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  <p className="text-sm text-text-muted">{p.photoCount} fotos</p>
                  <p className="text-xs text-violet-soft mt-0.5">{p.confidence}% confianza</p>
                </div>
                <ChevronRight className="w-4 h-4 text-text-dim shrink-0" />
              </motion.button>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-text-muted">
              Desbloqueá el agrupamiento completo con PhotoFind Premium
            </p>
            <Button variant="primary" size="sm">
              <Crown className="w-4 h-4" />
              Probar Premium
            </Button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {person && (
          <PersonGalleryModal person={person} onClose={() => setSelectedPerson(null)} />
        )}
      </AnimatePresence>
    </section>
  )
}

function PersonGalleryModal({
  person,
  onClose,
}: {
  person: (typeof DETECTED_PEOPLE)[0]
  onClose: () => void
}) {
  const photos = generatePhotoUrls(Math.min(person.photoCount, 12), person.avatarSeed * 10)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[85vh] overflow-hidden glass rounded-2xl"
      >
        <div className="flex items-center justify-between p-6 border-b border-border-subtle">
          <div className="flex items-center gap-4">
            <img
              src={`https://i.pravatar.cc/80?img=${person.avatarSeed}`}
              alt={person.name}
              className="w-12 h-12 rounded-full ring-2 ring-violet/30"
            />
            <div>
              <h3 className="font-display font-bold text-xl">{person.name}</h3>
              <p className="text-sm text-text-muted">{person.photoCount} fotos encontradas</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            {photos.map((url, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className="aspect-square rounded-lg overflow-hidden"
              >
                <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
