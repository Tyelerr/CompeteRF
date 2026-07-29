
UPDATE tournament_templates SET open_tournament = true WHERE id = (
  SELECT template_id FROM tournaments WHERE name = 'Top Shooter Sunday 8-Ball Tournament' AND venue_id = 279 LIMIT 1
);

UPDATE tournaments SET open_tournament = true
WHERE name = 'Top Shooter Sunday 8-Ball Tournament' AND venue_id = 279;
