
DO $$
DECLARE
  new_venue_id INT;
  new_tmpl_id  INT;
BEGIN

  -- ============================================================
  -- 1. Insert venue
  -- ============================================================
  INSERT INTO venues (
    venue, address, city, state, zip_code, phone,
    latitude, longitude, status
  ) VALUES (
    'Five Points Sports Bar',
    '1881 S Escondido Blvd',
    'Escondido',
    'CA',
    '92025',
    '(760) 740-1139',
    33.1016,
    -117.0710,
    'active'
  )
  RETURNING id INTO new_venue_id;

  -- ============================================================
  -- 2. Insert weekly Sunday template
  -- ============================================================
  INSERT INTO tournament_templates (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    race, table_size,
    entry_fee,
    phone_number,
    recurrence_type, recurrence_day,
    start_time, series_start_date,
    horizon_days, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    'Top Shooter Sunday 8-Ball Tournament',
    'Double elimination. Ball in hand. Race to 1. Break pot. $15 entry. Text Dan for more info: (619) 987-6385.',
    '8 Ball', 'double_elimination',
    '1', NULL,
    15.00,
    '(619) 987-6385',
    'weekly', 'sunday',
    '19:00:00', '2026-03-22',
    30, 'active',
    false, false, false
  )
  RETURNING id INTO new_tmpl_id;

  -- ============================================================
  -- 3. Insert first instance (today, Sunday March 22)
  -- ============================================================
  INSERT INTO tournaments (
    venue_id, director_id, template_id, parent_template_id,
    name, description,
    game_type, tournament_format,
    race,
    tournament_date, start_time, timezone,
    entry_fee,
    phone_number,
    thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47, new_tmpl_id, new_tmpl_id,
    'Top Shooter Sunday 8-Ball Tournament',
    'Double elimination. Ball in hand. Race to 1. Break pot. $15 entry. Text Dan for more info: (619) 987-6385.',
    '8 Ball', 'double_elimination',
    '1',
    '2026-03-22', '19:00:00', 'America/Los_Angeles',
    15.00,
    '(619) 987-6385',
    '8-ball',
    true, 'active',
    false, false, false
  );

END;
$$;

-- Fill the 30-day window
SELECT template_id, dates_inserted
FROM generate_recurring_tournaments()
WHERE dates_inserted > 0
ORDER BY template_id DESC
LIMIT 3;
