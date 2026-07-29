
-- Fix Sullivan's missing thumbnail on template and all instances
UPDATE tournament_templates
SET thumbnail = '8-ball'
WHERE venue_id = (SELECT id FROM venues WHERE venue = 'Sullivan''s Sports Bar')
  AND thumbnail IS NULL;

UPDATE tournaments
SET thumbnail = '8-ball'
WHERE venue_id = (SELECT id FROM venues WHERE venue = 'Sullivan''s Sports Bar')
  AND thumbnail IS NULL;

-- Add Breakers Grill Friday Scotch Doubles template + first instance
DO $$
DECLARE
  new_tmpl_id INT;
BEGIN
  INSERT INTO tournament_templates (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    entry_fee,
    phone_number,
    recurrence_type, recurrence_day,
    start_time, series_start_date,
    horizon_days, status, thumbnail,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    215, 47,
    'Friday Night Scotch Doubles Tournament',
    'TAP rules. $20 per player. 7:30 PM start. Unknown players start as a 6. TD reserves the right to refuse anyone. Unsportsmanlike conduct results in non-refundable ejection.',
    '8 Ball Scotch Doubles', 'double_elimination',
    20.00,
    '859-918-5110',
    'weekly', 'friday',
    '19:30:00', '2026-03-27',
    30, 'active', '8-ball-scotch-doubles',
    false, false, false
  )
  RETURNING id INTO new_tmpl_id;

  INSERT INTO tournaments (
    venue_id, director_id, template_id, parent_template_id,
    name, description,
    game_type, tournament_format,
    tournament_date, start_time, timezone,
    entry_fee, thumbnail,
    phone_number,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    215, 47, new_tmpl_id, new_tmpl_id,
    'Friday Night Scotch Doubles Tournament',
    'TAP rules. $20 per player. 7:30 PM start. Unknown players start as a 6. TD reserves the right to refuse anyone. Unsportsmanlike conduct results in non-refundable ejection.',
    '8 Ball Scotch Doubles', 'double_elimination',
    '2026-03-27', '19:30:00', 'America/New_York',
    20.00, '8-ball-scotch-doubles',
    '859-918-5110',
    true, 'active',
    false, false, false
  );
END;
$$;
