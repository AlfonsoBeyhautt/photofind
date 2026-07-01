import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { AuthLayout } from '../components/layout/AuthLayout'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { ErrorBanner } from '../components/ui/ErrorBanner'
import { useAuth } from '../context/AuthContext'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const result = await register(name, email, password)
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'No pudimos crear la cuenta.')
      return
    }
    navigate('/perfil')
  }

  return (
    <AuthLayout
      title="Crear tu cuenta"
      subtitle="Registrate para guardar tu perfil facial y reutilizarlo en futuras búsquedas"
    >
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Nombre completo"
          placeholder="Tu nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="Email"
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Contraseña"
          type="password"
          placeholder="Mínimo 8 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />

        <p className="text-xs text-text-dim">
          Podés crear tu perfil facial después del registro, desde Mi cuenta o al buscar fotos.
        </p>

        <Button type="submit" className="w-full" size="lg" disabled={loading}>
          {loading ? (
            <motion.div
              className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
          ) : (
            <>
              Crear cuenta
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </form>

      <p className="text-center text-sm text-text-muted mt-6">
        ¿Ya tenés cuenta?{' '}
        <Link to="/login" className="inline-flex items-center min-h-[44px] text-accent-bright hover:underline font-medium py-1">
          Iniciar sesión
        </Link>
      </p>
    </AuthLayout>
  )
}
