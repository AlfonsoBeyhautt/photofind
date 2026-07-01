-- PhotoFind: telemetría de calidad del reconocimiento (métricas, sin datos biométricos)

CREATE TABLE IF NOT EXISTS public.recognition_quality_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL UNIQUE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  provider text,
  album_url_hash text,
  search_method text,
  similarity_threshold numeric NOT NULL DEFAULT 85,
  pipeline_mode text,
  reference_source text,
  collection_reused boolean,
  images_analyzed integer,
  faces_indexed integer,
  matches_found integer NOT NULL DEFAULT 0,
  images_downloaded integer NOT NULL DEFAULT 0,
  images_selected integer NOT NULL DEFAULT 0,
  similarity_max numeric,
  similarity_avg numeric,
  fallback_reason text,
  outcome text NOT NULL DEFAULT 'started',
  retried_reference boolean NOT NULL DEFAULT false,
  repeat_search boolean NOT NULL DEFAULT false,
  downloaded_immediately boolean NOT NULL DEFAULT false,
  ms_album_fetch integer,
  ms_indexing integer,
  ms_search integer,
  ms_preload integer,
  ms_total integer,
  aws_compare_faces_calls integer NOT NULL DEFAULT 0,
  aws_search_faces_by_image_calls integer NOT NULL DEFAULT 0,
  event_category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  first_download_at timestamptz
);

CREATE INDEX IF NOT EXISTS recognition_quality_runs_created_idx
  ON public.recognition_quality_runs(created_at DESC);

CREATE INDEX IF NOT EXISTS recognition_quality_runs_provider_idx
  ON public.recognition_quality_runs(provider);

CREATE INDEX IF NOT EXISTS recognition_quality_runs_outcome_idx
  ON public.recognition_quality_runs(outcome);

CREATE TABLE IF NOT EXISTS public.recognition_grouping_quality (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grouping_id uuid,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  album_url_hash text,
  provider text,
  algorithm_version text,
  initial_groups integer,
  final_groups integer,
  visible_groups integer,
  groups_merged integer,
  low_confidence_groups integer,
  hidden_by_min_photos integer,
  ungrouped_faces_count integer NOT NULL DEFAULT 0,
  search_faces_calls integer,
  merge_search_faces_calls integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recognition_grouping_quality_created_idx
  ON public.recognition_grouping_quality(created_at DESC);

ALTER TABLE public.recognition_quality_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recognition_grouping_quality ENABLE ROW LEVEL SECURITY;

-- Solo backend (service_role) escribe y lee.
