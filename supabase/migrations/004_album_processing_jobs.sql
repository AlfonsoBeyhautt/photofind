-- PhotoFind: jobs async para indexación de álbumes grandes (30-day retention)

CREATE TABLE IF NOT EXISTS public.album_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_collection_id uuid NOT NULL REFERENCES public.album_collections(id) ON DELETE CASCADE,
  album_fingerprint text NOT NULL,
  provider text NOT NULL,
  album_url_hash text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  status text NOT NULL DEFAULT 'pending',
  total_images integer NOT NULL DEFAULT 0,
  processed_images integer NOT NULL DEFAULT 0,
  indexed_images integer NOT NULL DEFAULT 0,
  indexed_faces integer NOT NULL DEFAULT 0,
  failed_images integer NOT NULL DEFAULT 0,
  current_batch integer NOT NULL DEFAULT 0,
  total_batches integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS album_processing_jobs_fingerprint_idx
  ON public.album_processing_jobs(album_fingerprint);

CREATE INDEX IF NOT EXISTS album_processing_jobs_status_idx
  ON public.album_processing_jobs(status);

CREATE INDEX IF NOT EXISTS album_processing_jobs_session_idx
  ON public.album_processing_jobs(session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS album_processing_jobs_expires_at_idx
  ON public.album_processing_jobs(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS album_processing_jobs_active_fingerprint_idx
  ON public.album_processing_jobs(album_fingerprint, status)
  WHERE status IN ('pending', 'processing', 'retrying');

ALTER TABLE public.album_processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_album_processing_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS album_processing_jobs_updated_at ON public.album_processing_jobs;
CREATE TRIGGER album_processing_jobs_updated_at
  BEFORE UPDATE ON public.album_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_album_processing_jobs_updated_at();
