-- PhotoFind: métricas de fetch paralelo de imágenes

ALTER TABLE public.recognition_quality_runs
  ADD COLUMN IF NOT EXISTS ms_image_fetch integer,
  ADD COLUMN IF NOT EXISTS image_fetch_concurrency integer,
  ADD COLUMN IF NOT EXISTS image_fetch_requests integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_fetch_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_fetch_retries integer NOT NULL DEFAULT 0;
