-- PhotoFind Phase 2B: AWS Rekognition collection metadata (30-day retention)
-- Ejecutar en Supabase SQL Editor o con supabase db push

-- ---------------------------------------------------------------------------
-- album_collections
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.album_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_fingerprint text NOT NULL UNIQUE,
  provider text NOT NULL,
  album_url_hash text,
  folder_id text,
  folder_name text,
  collection_id text NOT NULL,
  total_images integer NOT NULL DEFAULT 0,
  indexed_images integer NOT NULL DEFAULT 0,
  indexed_faces integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS album_collections_collection_id_idx
  ON public.album_collections(collection_id);

CREATE INDEX IF NOT EXISTS album_collections_expires_at_idx
  ON public.album_collections(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS album_collections_status_idx
  ON public.album_collections(status);

ALTER TABLE public.album_collections ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- album_collection_faces
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.album_collection_faces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_collection_id uuid NOT NULL REFERENCES public.album_collections(id) ON DELETE CASCADE,
  image_id text NOT NULL,
  image_name text,
  face_id text NOT NULL,
  external_image_id text,
  bounding_box jsonb,
  confidence numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS album_collection_faces_collection_idx
  ON public.album_collection_faces(album_collection_id);

CREATE INDEX IF NOT EXISTS album_collection_faces_face_id_idx
  ON public.album_collection_faces(face_id);

CREATE UNIQUE INDEX IF NOT EXISTS album_collection_faces_face_unique
  ON public.album_collection_faces(album_collection_id, face_id);

CREATE INDEX IF NOT EXISTS album_collection_faces_image_idx
  ON public.album_collection_faces(album_collection_id, image_id);

ALTER TABLE public.album_collection_faces ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_album_collections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS album_collections_updated_at ON public.album_collections;
CREATE TRIGGER album_collections_updated_at
  BEFORE UPDATE ON public.album_collections
  FOR EACH ROW EXECUTE FUNCTION public.set_album_collections_updated_at();
