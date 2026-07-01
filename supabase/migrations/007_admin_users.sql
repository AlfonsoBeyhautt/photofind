-- PhotoFind: administradores autorizados (acceso exclusivo al panel /admin)

CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  granted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_users_user_id_unique UNIQUE (user_id),
  CONSTRAINT admin_users_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS admin_users_email_idx ON public.admin_users (lower(email));

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Sin políticas para roles anon/authenticated: solo service_role accede vía backend.

COMMENT ON TABLE public.admin_users IS
  'Usuarios autorizados para /admin. Gestionado exclusivamente por el backend con service_role.';

-- Insertá tu cuenta después de registrarte, por ejemplo:
-- INSERT INTO public.admin_users (user_id, email, notes)
-- SELECT id, email, 'bootstrap'
-- FROM auth.users WHERE email = 'tu@email.com' LIMIT 1;
