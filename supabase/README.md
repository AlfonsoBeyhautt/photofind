# Supabase — PhotoFind

## 1. Crear proyecto

1. [supabase.com](https://supabase.com) → New project
2. Copiá **Project URL**, **anon key** y **service_role key**

## 2. Variables de entorno

En `.env` (y en el hosting de producción):

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # solo backend, nunca en frontend
```

## 3. Ejecutar migración SQL

En **SQL Editor** del dashboard, pegá y ejecutá el contenido de:

`supabase/migrations/001_facial_profiles.sql`

Esto crea:

- Tabla `public.facial_profiles` con RLS
- Bucket privado `facial-profiles` con políticas por usuario

Luego ejecutá también:

`supabase/migrations/002_search_history.sql`

Esto crea la tabla `public.search_history` para búsquedas y álbumes procesados en el dashboard.

Luego ejecutá también las migraciones `003`–`008` (ver lista en `supabase/README.md`).

## 3b. Panel de administración (`/admin`)

1. Ejecutá `007_admin_users.sql`.
2. Insertá tu cuenta como admin (reemplazá el email):

```sql
INSERT INTO public.admin_users (user_id, email, notes)
SELECT id, email, 'bootstrap'
FROM auth.users
WHERE email = 'tu@email.com'
LIMIT 1;
```

Alternativa: definí `PHOTOFIND_BOOTSTRAP_ADMIN_EMAIL=tu@email.com` en el backend. Si `admin_users` está vacía, el primer acceso autorizado crea el registro automáticamente (solo si ya existe la cuenta en Auth).

La ruta `/admin` no aparece en la navegación. Solo usuarios en `admin_users` pueden cargar las APIs `/api/admin/*`.

## 4. Auth (registro sin confirmación de email — recomendado para MVP)

**Authentication → Providers → Email** → desactivá **Confirm email** si querés login inmediato tras registrarse.

El nombre del usuario se guarda en `user_metadata.name` al registrarse.

## 5. Arquitectura

| Capa | Responsabilidad |
|------|-----------------|
| Frontend (anon key) | Registro, login, logout, sesión persistente |
| Backend (service role) | Subir/leer JPEG en Storage, CRUD metadata, generar `referenceToken` |
| RLS | Respaldo si en el futuro el cliente accede directo a DB/Storage |

## 6. Path de archivos

```
facial-profiles/{user_id}/profile.jpg
```

JPEG normalizado (no la foto original). Se borra al eliminar el perfil o la cuenta (`ON DELETE CASCADE`).
