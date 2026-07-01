-- PhotoFind: optional organisational event category per album
-- Does not affect recognition — metadata only.

ALTER TABLE public.album_collections
  ADD COLUMN IF NOT EXISTS event_category text;

CREATE INDEX IF NOT EXISTS album_collections_event_category_idx
  ON public.album_collections(event_category)
  WHERE event_category IS NOT NULL;

ALTER TABLE public.search_history
  ALTER COLUMN event_category DROP NOT NULL;
