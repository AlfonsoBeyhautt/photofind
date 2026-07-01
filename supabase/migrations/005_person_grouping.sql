-- PhotoFind Premium: agrupación lazy por persona (SearchFaces clustering)

-- ---------------------------------------------------------------------------
-- album_person_grouping_access — permisos (Premium individual / Plan fotógrafo)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.album_person_grouping_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_collection_id uuid NOT NULL REFERENCES public.album_collections(id) ON DELETE CASCADE,
  access_mode text NOT NULL CHECK (access_mode IN ('disabled', 'user_premium', 'photographer_license')),
  granted_to_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_slug text,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS album_person_grouping_access_premium_uidx
  ON public.album_person_grouping_access(album_collection_id, granted_to_user_id)
  WHERE access_mode = 'user_premium' AND granted_to_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS album_person_grouping_access_license_uidx
  ON public.album_person_grouping_access(album_collection_id)
  WHERE access_mode = 'photographer_license';

CREATE INDEX IF NOT EXISTS album_person_grouping_access_collection_idx
  ON public.album_person_grouping_access(album_collection_id);

-- ---------------------------------------------------------------------------
-- album_person_groupings — ejecución de clustering por álbum + versión
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.album_person_groupings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_collection_id uuid NOT NULL REFERENCES public.album_collections(id) ON DELETE CASCADE,
  algorithm_version text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  total_face_instances integer NOT NULL DEFAULT 0,
  total_groups integer NOT NULL DEFAULT 0,
  visible_groups integer NOT NULL DEFAULT 0,
  search_faces_calls integer NOT NULL DEFAULT 0,
  min_photos_threshold integer NOT NULL DEFAULT 2,
  min_quality_threshold numeric,
  cluster_state jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS album_person_groupings_collection_version_uidx
  ON public.album_person_groupings(album_collection_id, algorithm_version);

CREATE INDEX IF NOT EXISTS album_person_groupings_status_idx
  ON public.album_person_groupings(status);

-- ---------------------------------------------------------------------------
-- album_person_groups — personas detectadas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.album_person_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grouping_id uuid NOT NULL REFERENCES public.album_person_groupings(id) ON DELETE CASCADE,
  album_collection_id uuid NOT NULL REFERENCES public.album_collections(id) ON DELETE CASCADE,
  person_index integer NOT NULL,
  photo_count integer NOT NULL DEFAULT 0,
  face_instance_count integer NOT NULL DEFAULT 0,
  representative_image_id text NOT NULL,
  representative_crop jsonb,
  quality_score numeric,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS album_person_groups_grouping_idx
  ON public.album_person_groups(grouping_id, person_index);

-- ---------------------------------------------------------------------------
-- album_person_group_faces — membresía interna (face_id no expuesto al cliente)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.album_person_group_faces (
  grouping_id uuid NOT NULL REFERENCES public.album_person_groupings(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.album_person_groups(id) ON DELETE CASCADE,
  face_id text NOT NULL,
  image_id text NOT NULL,
  similarity numeric,
  PRIMARY KEY (group_id, face_id)
);

CREATE INDEX IF NOT EXISTS album_person_group_faces_grouping_idx
  ON public.album_person_group_faces(grouping_id);

-- ---------------------------------------------------------------------------
-- album_person_group_images — fotos por grupo (servido al frontend)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.album_person_group_images (
  group_id uuid NOT NULL REFERENCES public.album_person_groups(id) ON DELETE CASCADE,
  image_id text NOT NULL,
  best_similarity numeric,
  PRIMARY KEY (group_id, image_id)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_album_person_grouping_access_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS album_person_grouping_access_updated_at ON public.album_person_grouping_access;
CREATE TRIGGER album_person_grouping_access_updated_at
  BEFORE UPDATE ON public.album_person_grouping_access
  FOR EACH ROW EXECUTE FUNCTION public.set_album_person_grouping_access_updated_at();

CREATE OR REPLACE FUNCTION public.set_album_person_groupings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS album_person_groupings_updated_at ON public.album_person_groupings;
CREATE TRIGGER album_person_groupings_updated_at
  BEFORE UPDATE ON public.album_person_groupings
  FOR EACH ROW EXECUTE FUNCTION public.set_album_person_groupings_updated_at();

ALTER TABLE public.album_person_grouping_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_person_groupings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_person_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_person_group_faces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.album_person_group_images ENABLE ROW LEVEL SECURITY;
