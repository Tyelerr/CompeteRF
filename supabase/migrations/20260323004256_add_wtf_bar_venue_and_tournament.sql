
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
    'Whiskey Tango Foxtrot Bar & Eats',
    '2667 Alta Arden Expy',
    'Sacramento',
    'CA',
    '95825',
    '(530) 906-0771',
    38.5945,
    -121.4185,
    'active'
  )
  RETURNING id INTO new_venue_id;

  -- ============================================================
  -- 2. Insert weekly Monday template
  -- ============================================================
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
    'Monday Night 8-Ball Pool Tournament',
    'Double elimination. Sign-up at 6:00 PM, starts at 7:00 PM. $10 entry per player. Pot depends on how many sign up. Payout: 1st, 2nd & 3rd place.',
    '8 Ball', 'double_elimination',
    10.00,
    '(530) 906-0771',
    'weekly', 'monday',
    '19:00:00', '2026-03-23',
    30, 'active',
    false, false, false
  )
  RETURNING id INTO new_tmpl_id;

  -- ============================================================
  -- 3. Insert first instance (Monday March 23)
  -- ============================================================
  INSERT INTO tournaments (
    venue_id, director_id, template_id, parent_template_id,
    name, description,
    game_type, tournament_format,
    tournament_date, start_time, timezone,
    entry_fee,
    phone_number,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47, new_tmpl_id, new_tmpl_id,
    'Monday Night 8-Ball Pool Tournament',
    'Double elimination. Sign-up at 6:00 PM, starts at 7:00 PM. $10 entry per player. Pot depends on how many sign up. Payout: 1st, 2nd & 3rd place.',
    '8 Ball', 'double_elimination',
    '2026-03-23', '19:00:00', 'America/Los_Angeles',
    10.00,
    '(530) 906-0771',
    true, 'active',
    false, false, false
  );

END;
$$;

-- Fill remaining 30-day window
SELECT template_id, dates_inserted
FROM generate_recurring_tournaments()
WHERE dates_inserted > 0
ORDER BY template_id DESC
LIMIT 5;
