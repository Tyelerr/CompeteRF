
DO $$
DECLARE
  new_venue_id INT;
  new_tmpl_id  INT;
BEGIN

  INSERT INTO venues (
    venue, address, city, state, zip_code, phone,
    latitude, longitude, status
  ) VALUES (
    'Hot Hill Tavern',
    '1 Starr St',
    'Thomaston',
    'ME',
    '04861',
    '(207) 354-5144',
    44.0789,
    -69.1795,
    'active'
  )
  RETURNING id INTO new_venue_id;

  INSERT INTO tournament_templates (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    entry_fee,
    phone_number,
    recurrence_type, recurrence_day,
    start_time, series_start_date,
    horizon_days, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    'Sunday 8-Ball Pool Tournament',
    'Doors open 12:00 PM, tournament starts 1:00 PM. $15 entry per player. Cash prizes for top 3.',
    '8 Ball', 'double_elimination',
    15.00,
    '(207) 354-5144',
    'weekly', 'sunday',
    '13:00:00', '2026-03-22',
    30, 'active',
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
    new_venue_id, 47, new_tmpl_id, new_tmpl_id,
    'Sunday 8-Ball Pool Tournament',
    'Doors open 12:00 PM, tournament starts 1:00 PM. $15 entry per player. Cash prizes for top 3.',
    '8 Ball', 'double_elimination',
    '2026-03-22', '13:00:00', 'America/New_York',
    15.00, '8-ball',
    '(207) 354-5144',
    true, 'active',
    false, false, false
  );

END;
$$;

SELECT template_id, dates_inserted
FROM generate_recurring_tournaments()
WHERE dates_inserted > 0
ORDER BY template_id DESC
LIMIT 2;
