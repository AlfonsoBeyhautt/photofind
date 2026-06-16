import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLMotionProps<'div'> {
  hover?: boolean
  glow?: boolean
}

export function Card({ hover = false, glow = false, className, children, ...props }: CardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -2 } : undefined}
      className={cn(
        'glass rounded-2xl p-6',
        glow && 'glow-blue',
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  )
}
