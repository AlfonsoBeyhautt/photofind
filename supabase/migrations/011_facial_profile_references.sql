-- PhotoFind: múltiples referencias faciales por usuario (perfil avanzado Fase 1)

CREATE TABLE IF NOT EXISTS public.facial_profile_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reference_type text NOT NULL DEFAULT 'extra',
  storage_path text NOT NULL,
  face_box jsonb NOT NULL,
  confidence real NOT NULL,
  quality_tier text NOT NULL,
  quality_warning text,
  capture_method text NOT NULL DEFAULT 'upload',
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facial_profile_references_status_check
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT facial_profile_references_type_check
    CHECK (reference_type IN ('primary', 'frontal', 'left', 'right', 'smile', 'lighting', 'extra'))
);

CREATE INDEX IF NOT EXISTS facial_profile_references_user_id_idx
  ON public.facial_profile_references(user_id);

CREATE INDEX IF NOT EXISTS facial_profile_references_user_active_idx
  ON public.facial_profile_references(user_id, status)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS facial_profile_references_one_primary_per_user
  ON public.facial_profile_references(user_id)
  WHERE is_primary = true AND status = 'active';

ALTER TABLE public.facial_profile_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facial_profile_references_select_own"
  ON public.facial_profile_references FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "facial_profile_references_insert_own"
  ON public.facial_profile_references FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "facial_profile_references_update_own"
  ON public.facial_profile_references FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "facial_profile_references_delete_own"
  ON public.facial_profile_references FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS facial_profile_references_updated_at ON public.facial_profile_references;
CREATE TRIGGER facial_profile_references_updated_at
  BEFORE UPDATE ON public.facial_profile_references
  FOR EACH ROW EXECUTE FUNCTION public.set_facial_profiles_updated_at();

-- Telemetría perfil avanzado
ALTER TABLE public.recognition_quality_runs
  ADD COLUMN IF NOT EXISTS profile_mode text,
  ADD COLUMN IF NOT EXISTS reference_count integer,
  ADD COLUMN IF NOT EXISTS multi_ref_extra_matches integer,
  ADD COLUMN IF NOT EXISTS matches_by_reference jsonb;
