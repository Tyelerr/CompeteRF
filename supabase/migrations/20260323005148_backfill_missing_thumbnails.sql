
-- Thumbnail slug map
-- tournaments
UPDATE tournaments
SET thumbnail = CASE
  WHEN game_type ILIKE '9 Ball Scotch Doubles'   THEN '9-ball-scotch-doubles'
  WHEN game_type ILIKE '8 Ball Scotch Doubles'   THEN '8-ball-scotch-doubles'
  WHEN game_type ILIKE '10 Ball Scotch Doubles'  THEN '10-ball-scotch-doubles'
  WHEN game_type ILIKE '10 Ball'                 THEN '10-ball'
  WHEN game_type ILIKE '9 Ball'                  THEN '9-ball'
  WHEN game_type ILIKE '8 Ball'                  THEN '8-ball'
  WHEN game_type ILIKE '9-ball%'                 THEN '9-ball'
  WHEN game_type ILIKE '8-ball%'                 THEN '8-ball'
  WHEN game_type ILIKE 'One Pocket'              THEN 'one-pocket'
  WHEN game_type ILIKE 'Banks'                   THEN 'banks'
  WHEN game_type ILIKE 'Straight Pool'           THEN 'straight-pool'
  ELSE thumbnail  -- leave unchanged if no match
END
WHERE thumbnail IS NULL
  AND game_type IS NOT NULL
  AND game_type <> '';

-- tournament_templates
UPDATE tournament_templates
SET thumbnail = CASE
  WHEN game_type ILIKE '9 Ball Scotch Doubles'   THEN '9-ball-scotch-doubles'
  WHEN game_type ILIKE '8 Ball Scotch Doubles'   THEN '8-ball-scotch-doubles'
  WHEN game_type ILIKE '10 Ball Scotch Doubles'  THEN '10-ball-scotch-doubles'
  WHEN game_type ILIKE '10 Ball'                 THEN '10-ball'
  WHEN game_type ILIKE '9 Ball'                  THEN '9-ball'
  WHEN game_type ILIKE '8 Ball'                  THEN '8-ball'
  WHEN game_type ILIKE '9-ball%'                 THEN '9-ball'
  WHEN game_type ILIKE '8-ball%'                 THEN '8-ball'
  WHEN game_type ILIKE 'One Pocket'              THEN 'one-pocket'
  WHEN game_type ILIKE 'Banks'                   THEN 'banks'
  WHEN game_type ILIKE 'Straight Pool'           THEN 'straight-pool'
  ELSE thumbnail
END
WHERE thumbnail IS NULL
  AND game_type IS NOT NULL
  AND game_type <> '';
