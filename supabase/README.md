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
