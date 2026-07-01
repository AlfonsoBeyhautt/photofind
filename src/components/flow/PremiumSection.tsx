import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Crown, Users, ScanFace, Sparkles, ArrowRight } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { useAuth } from '../../context/AuthContext'
import { isPersonGroupingEnabled } from '../../types/personGrouping'

export function PremiumSection() {
  const { isLoggedIn } = useAuth()
  const premiumEnabled = isPersonGroupingEnabled()

  if (!premiumEnabled) return null

  const dashboardTarget = isLoggedIn
    ? '/dashboard#premium-personas'
    : '/login?redirect=' + encodeURIComponent('/dashboard#premium-personas')

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
            Descubrí quién más aparece en el álbum. La IA detecta y agrupa automáticamente a cada persona — sin selfie ni búsqueda individual.
          </p>
        </div>

        <div className="glass rounded-2xl p-6 md:p-8 glow-blue border border-violet/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[
              {
                icon: ScanFace,
                title: 'Indexá el álbum',
                desc: 'Analizamos todas las caras del álbum una sola vez.',
              },
              {
                icon: Sparkles,
                title: 'Agrupación inteligente',
                desc: 'Clustering automático con reconocimiento facial avanzado.',
              },
              {
                icon: Users,
                title: 'Navegá por persona',
                desc: 'Persona 1, Persona 2… con todas sus fotos listas para descargar.',
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="rounded-xl border border-border bg-bg-elevated p-5"
              >
                <item.icon className="w-8 h-8 text-violet-soft mb-3" />
                <p className="font-semibold mb-1">{item.title}</p>
                <p className="text-sm text-text-muted">{item.desc}</p>
              </motion.div>
            ))}
          </div>

          <div className="pt-6 border-t border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-text-muted text-center sm:text-left">
              {isLoggedIn
                ? 'Accedé a tus álbumes procesados y generá la agrupación desde el Dashboard.'
                : 'Iniciá sesión para probar la agrupación premium con tus álbumes.'}
            </p>
            <Link to={dashboardTarget}>
              <Button variant="primary" size="sm">
                <Crown className="w-4 h-4" />
                Probar Premium
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
