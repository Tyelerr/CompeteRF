
-- Add all new venues to venue_owners for id_auto 47
INSERT INTO venue_owners (venue_id, owner_id, assigned_by, assigned_at)
SELECT v.id, 47, 47, now()
FROM venues v
WHERE v.id NOT IN (
  SELECT venue_id FROM venue_owners WHERE owner_id = 47
)
AND v.id >= 106; -- all newly imported venues

-- Add all new venues to venue_directors for id_auto 47
INSERT INTO venue_directors (venue_id, director_id, assigned_by, assigned_at)
SELECT v.id, 47, 47, now()
FROM venues v
WHERE v.id NOT IN (
  SELECT venue_id FROM venue_directors WHERE director_id = 47
)
AND v.id >= 106;
