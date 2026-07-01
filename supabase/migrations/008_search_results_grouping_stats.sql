-- PhotoFind: resultados de búsqueda persistidos + telemetría de agrupación

ALTER TABLE public.search_history
  ADD COLUMN IF NOT EXISTS matched_image_ids jsonb,
  ADD COLUMN IF NOT EXISTS analyzed_count integer,
  ADD COLUMN IF NOT EXISTS search_method text;

ALTER TABLE public.album_person_groupings
  ADD COLUMN IF NOT EXISTS clustering_stats jsonb;

COMMENT ON COLUMN public.search_history.matched_image_ids IS
  'IDs de imágenes con coincidencia (para reabrir resultados sin re-ejecutar Rekognition).';

COMMENT ON COLUMN public.album_person_groupings.clustering_stats IS
  'Métricas internas del algoritmo de agrupación (merge, calidad, costos).';
