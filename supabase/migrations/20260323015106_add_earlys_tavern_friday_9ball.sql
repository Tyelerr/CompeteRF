
DO $$
DECLARE
  new_tmpl_id INT;
BEGIN

  INSERT INTO tournament_templates (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    entry_fee,
    recurrence_type, recurrence_day,
    start_time, series_start_date,
    horizon_days, status, thumbnail,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    204, 47,
    'Friday Night 9-Ball Tournament',
    'ABC ball spot tourney. $10 entry + $5 green fee ($15 total). Doors open 5:00 PM, sign-ups at 6:30 PM, starts at 7:00 PM.',
    '9 Ball', 'double_elimination',
    15.00,
    'weekly', 'friday',
    '19:00:00', '2026-03-27',
    30, 'active', '9-ball',
    false, false, false
  )
  RETURNING id INTO new_tmpl_id;

  INSERT INTO tournaments (
    venue_id, director_id, template_id, parent_template_id,
    name, description,
    game_type, tournament_format,
    tournament_date, start_time, timezone,
    entry_fee, thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    204, 47, new_tmpl_id, new_tmpl_id,
    'Friday Night 9-Ball Tournament',
    'ABC ball spot tourney. $10 entry + $5 green fee ($15 total). Doors open 5:00 PM, sign-ups at 6:30 PM, starts at 7:00 PM.',
    '9 Ball', 'double_elimination',
    '2026-03-27', '19:00:00', 'America/Chicago',
    15.00, '9-ball',
    true, 'active',
    false, false, false
  );

END;
$$;

SELECT template_id, dates_inserted
FROM generate_recurring_tournaments()
WHERE dates_inserted > 0
ORDER BY template_id DESC LIMIT 2;
