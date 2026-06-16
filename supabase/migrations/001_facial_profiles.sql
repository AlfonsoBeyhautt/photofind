-- PhotoFind: perfiles faciales guardados (1 por usuario)
-- Ejecutar en Supabase SQL Editor o con supabase db push

-- ---------------------------------------------------------------------------
-- Tabla facial_profiles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.facial_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  face_box jsonb NOT NULL,
  confidence real NOT NULL,
  quality_tier text NOT NULL,
  quality_warning text,
  source text NOT NULL DEFAULT 'upload',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facial_profiles_user_id_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS facial_profiles_user_id_idx ON public.facial_profiles(user_id);

ALTER TABLE public.facial_profiles ENABLE ROW LEVEL SECURITY;

-- RLS: cada usuario solo accede a su fila
CREATE POLICY "facial_profiles_select_own"
  ON public.facial_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "facial_profiles_insert_own"
  ON public.facial_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "facial_profiles_update_own"
  ON public.facial_profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "facial_profiles_delete_own"
  ON public.facial_profiles FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_facial_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS facial_profiles_updated_at ON public.facial_profiles;
CREATE TRIGGER facial_profiles_updated_at
  BEFORE UPDATE ON public.facial_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_facial_profiles_updated_at();

-- ---------------------------------------------------------------------------
-- Storage bucket privado facial-profiles
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'facial-profiles',
  'facial-profiles',
  false,
  5242880,
  ARRAY['image/jpeg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg']::text[];

-- RLS storage: path = {user_id}/profile.jpg
CREATE POLICY "facial_storage_select_own"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'facial-profiles'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "facial_storage_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'facial-profiles'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "facial_storage_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'facial-profiles'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "facial_storage_delete_own"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'facial-profiles'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
