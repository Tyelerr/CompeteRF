
-- Fix all tournaments in LA with missing/wrong thumbnails
UPDATE tournaments
SET thumbnail = CASE
  WHEN game_type ILIKE '9 Ball Scotch Doubles'  THEN '9-ball-scotch-doubles'
  WHEN game_type ILIKE '8 Ball Scotch Doubles'  THEN '8-ball-scotch-doubles'
  WHEN game_type ILIKE '10 Ball Scotch Doubles' THEN '10-ball-scotch-doubles'
  WHEN game_type ILIKE '10 Ball'                THEN '10-ball'
  WHEN game_type ILIKE '9 Ball'                 THEN '9-ball'
  WHEN game_type ILIKE '8 Ball'                 THEN '8-ball'
  WHEN game_type ILIKE 'One Pocket'             THEN 'one-pocket'
  WHEN game_type ILIKE 'Straight Pool'          THEN 'straight-pool'
  WHEN game_type ILIKE 'Banks'                  THEN 'banks'
END
WHERE venue_id IN (SELECT id FROM venues WHERE state = 'LA')
  AND thumbnail IS NULL
  AND game_type IS NOT NULL;

-- Also fix the templates so future cron instances inherit correctly
UPDATE tournament_templates
SET thumbnail = CASE
  WHEN game_type ILIKE '9 Ball Scotch Doubles'  THEN '9-ball-scotch-doubles'
  WHEN game_type ILIKE '8 Ball Scotch Doubles'  THEN '8-ball-scotch-doubles'
  WHEN game_type ILIKE '10 Ball Scotch Doubles' THEN '10-ball-scotch-doubles'
  WHEN game_type ILIKE '10 Ball'                THEN '10-ball'
  WHEN game_type ILIKE '9 Ball'                 THEN '9-ball'
  WHEN game_type ILIKE '8 Ball'                 THEN '8-ball'
  WHEN game_type ILIKE 'One Pocket'             THEN 'one-pocket'
  WHEN game_type ILIKE 'Straight Pool'          THEN 'straight-pool'
  WHEN game_type ILIKE 'Banks'                  THEN 'banks'
END
WHERE venue_id IN (SELECT id FROM venues WHERE state = 'LA')
  AND thumbnail IS NULL
  AND game_type IS NOT NULL;
