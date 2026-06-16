-- PhotoFind: historial de búsquedas por usuario
-- Ejecutar después de 001_facial_profiles.sql

CREATE TABLE IF NOT EXISTS public.search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  album_name text NOT NULL,
  album_url text NOT NULL,
  provider text NOT NULL,
  event_category text NOT NULL,
  photos_found integer NOT NULL DEFAULT 0,
  total_photos integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS search_history_user_created_idx
  ON public.search_history(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS search_history_user_album_idx
  ON public.search_history(user_id, album_url);

ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "search_history_select_own"
  ON public.search_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "search_history_insert_own"
  ON public.search_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "search_history_delete_own"
  ON public.search_history FOR DELETE
  USING (auth.uid() = user_id);
