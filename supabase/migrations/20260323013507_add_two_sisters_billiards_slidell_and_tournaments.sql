
DO $$
DECLARE
  new_venue_id  INT;
  tmpl_thu_id   INT;
  tmpl_fri_id   INT;
BEGIN

  -- ============================================================
  -- 1. Insert venue
  -- ============================================================
  INSERT INTO venues (
    venue, address, city, state, zip_code, phone,
    latitude, longitude, status
  ) VALUES (
    'Two Sisters Billiards & Cafe',
    '960 E I-10 Service Rd',
    'Slidell',
    'LA',
    '70461',
    '(985) 781-0059',
    30.2729,
    -89.7816,
    'active'
  )
  RETURNING id INTO new_venue_id;

  -- ============================================================
  -- 2. Thursday 9-Ball template
  -- ============================================================
  INSERT INTO tournament_templates (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    race,
    entry_fee,
    phone_number,
    recurrence_type, recurrence_day,
    start_time, series_start_date,
    horizon_days, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    'Thursday Night 9-Ball Tournament',
    'Race to 3/2. Sign-ups 7:00 PM, balls break 8:00 PM. $20 entry includes green fee.',
    '9 Ball', 'double_elimination',
    '3/2',
    20.00,
    '(985) 781-0059',
    'weekly', 'thursday',
    '20:00:00', '2026-03-26',
    30, 'active',
    false, false, false
  )
  RETURNING id INTO tmpl_thu_id;

  INSERT INTO tournaments (
    venue_id, director_id, template_id, parent_template_id,
    name, description,
    game_type, tournament_format,
    race,
    tournament_date, start_time, timezone,
    entry_fee, thumbnail,
    phone_number,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47, tmpl_thu_id, tmpl_thu_id,
    'Thursday Night 9-Ball Tournament',
    'Race to 3/2. Sign-ups 7:00 PM, balls break 8:00 PM. $20 entry includes green fee.',
    '9 Ball', 'double_elimination',
    '3/2',
    '2026-03-26', '20:00:00', 'America/Chicago',
    20.00, '9-ball',
    '(985) 781-0059',
    true, 'active',
    false, false, false
  );

  -- ============================================================
  -- 3. Friday 8-Ball template
  -- ============================================================
  INSERT INTO tournament_templates (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    race,
    entry_fee, added_money,
    phone_number,
    recurrence_type, recurrence_day,
    start_time, series_start_date,
    horizon_days, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    'Friday Night 8-Ball Tournament',
    'Race to 2, winner breaks. Sign-ups 7:00 PM, balls break 8:00 PM. $20 entry includes green fee. House adds $200 on 20-player base.',
    '8 Ball', 'double_elimination',
    '2',
    20.00, 200.00,
    '(985) 781-0059',
    'weekly', 'friday',
    '20:00:00', '2026-03-27',
    30, 'active',
    false, false, false
  )
  RETURNING id INTO tmpl_fri_id;

  INSERT INTO tournaments (
    venue_id, director_id, template_id, parent_template_id,
    name, description,
    game_type, tournament_format,
    race,
    tournament_date, start_time, timezone,
    entry_fee, added_money, thumbnail,
    phone_number,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47, tmpl_fri_id, tmpl_fri_id,
    'Friday Night 8-Ball Tournament',
    'Race to 2, winner breaks. Sign-ups 7:00 PM, balls break 8:00 PM. $20 entry includes green fee. House adds $200 on 20-player base.',
    '8 Ball', 'double_elimination',
    '2',
    '2026-03-27', '20:00:00', 'America/Chicago',
    20.00, 200.00, '8-ball',
    '(985) 781-0059',
    true, 'active',
    false, false, false
  );

END;
$$;

-- Fill the 30-day window for both new templates
SELECT template_id, dates_inserted
FROM generate_recurring_tournaments()
WHERE dates_inserted > 0
ORDER BY template_id DESC
LIMIT 4;
