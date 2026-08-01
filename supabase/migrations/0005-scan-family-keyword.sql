-- The Hanger Family dropdown could come back empty: the keyword narrowing the
-- family list matched nothing, and an empty list is indistinguishable from a
-- model with no hanger families in it. The add-in now falls back to every
-- loaded family and reports that it did, so the web app can say the keyword
-- was the problem rather than showing a dead end.

ALTER TABLE cable_tray_scans
  -- What the family list was narrowed by, so the web app can quote it back.
  ADD COLUMN hanger_family_keyword TEXT,

  -- False when the list is the unfiltered fallback rather than a real match.
  ADD COLUMN hanger_families_matched_keyword BOOLEAN;
