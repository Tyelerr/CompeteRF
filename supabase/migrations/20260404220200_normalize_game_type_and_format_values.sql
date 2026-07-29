
-- ============================================================
-- TOURNAMENTS table
-- ============================================================

-- game_type normalization
UPDATE tournaments SET game_type = '8-ball'               WHERE game_type IN ('8 Ball', '8-Ball');
UPDATE tournaments SET game_type = '9-ball'               WHERE game_type IN ('9 Ball', '9-Ball');
UPDATE tournaments SET game_type = '10-ball'              WHERE game_type IN ('10 Ball', '10-Ball');
UPDATE tournaments SET game_type = '8-ball-scotch-doubles' WHERE game_type IN ('8 Ball Scotch Doubles');
UPDATE tournaments SET game_type = '9-ball-scotch-doubles' WHERE game_type IN ('9 Ball Scotch Doubles');
UPDATE tournaments SET game_type = '10-ball-scotch-doubles' WHERE game_type IN ('10 Ball Scotch Doubles');
UPDATE tournaments SET game_type = 'one-pocket'           WHERE game_type IN ('One Pocket');
UPDATE tournaments SET game_type = 'straight-pool'        WHERE game_type IN ('Straight Pool');
UPDATE tournaments SET game_type = 'bank-pool'            WHERE game_type IN ('Banks', 'Bank Pool');

-- tournament_format normalization
UPDATE tournaments SET tournament_format = 'double-elim'  WHERE tournament_format IN ('double_elimination', 'double-elimination');
UPDATE tournaments SET tournament_format = 'single-elim'  WHERE tournament_format IN ('single_elimination', 'single-elimination');

-- ============================================================
-- TOURNAMENT_TEMPLATES table
-- ============================================================

-- game_type normalization
UPDATE tournament_templates SET game_type = '8-ball'               WHERE game_type IN ('8 Ball', '8-Ball');
UPDATE tournament_templates SET game_type = '9-ball'               WHERE game_type IN ('9 Ball', '9-Ball');
UPDATE tournament_templates SET game_type = '10-ball'              WHERE game_type IN ('10 Ball', '10-Ball');
UPDATE tournament_templates SET game_type = '8-ball-scotch-doubles' WHERE game_type IN ('8 Ball Scotch Doubles');
UPDATE tournament_templates SET game_type = '9-ball-scotch-doubles' WHERE game_type IN ('9 Ball Scotch Doubles');
UPDATE tournament_templates SET game_type = '10-ball-scotch-doubles' WHERE game_type IN ('10 Ball Scotch Doubles');
UPDATE tournament_templates SET game_type = 'one-pocket'           WHERE game_type IN ('One Pocket');
UPDATE tournament_templates SET game_type = 'straight-pool'        WHERE game_type IN ('Straight Pool');
UPDATE tournament_templates SET game_type = 'bank-pool'            WHERE game_type IN ('Banks', 'Bank Pool');

-- tournament_format normalization
UPDATE tournament_templates SET tournament_format = 'double-elim'  WHERE tournament_format IN ('double_elimination', 'double-elimination');
UPDATE tournament_templates SET tournament_format = 'single-elim'  WHERE tournament_format IN ('single_elimination', 'single-elimination');
