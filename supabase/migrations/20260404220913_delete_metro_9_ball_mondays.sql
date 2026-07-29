
-- Remove dependent favorites first
DELETE FROM favorites
WHERE tournament_id IN (67,68,69,70,71,266,267,268,269,270,574,643);

-- Delete all tournament instances
DELETE FROM tournaments
WHERE id IN (67,68,69,70,71,266,267,268,269,270,574,643);

-- End and archive the template so it never generates new instances
UPDATE tournament_templates
SET
  status = 'ended',
  archived_at = now()
WHERE id = 8;
