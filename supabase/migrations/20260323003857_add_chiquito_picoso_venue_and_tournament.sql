
DO $$
DECLARE
  new_venue_id  INT;
  new_tmpl_id   INT;
BEGIN

  -- ============================================================
  -- 1. Insert venue
  -- ============================================================
  INSERT INTO venues (
    venue, address, city, state, zip_code, phone,
    latitude, longitude, status
  ) VALUES (
    'Chiquito Picoso Kitchen & Bar',
    '23960 Ironwood Ave # E',
    'Moreno Valley',
    'CA',
    '92557',
    '(951) 455-4043',
    33.9259,
    -117.2208,
    'active'
  )
  RETURNING id INTO new_venue_id;

  -- ============================================================
  -- 2. Insert recurring template (weekly Sunday)
  -- ============================================================
  INSERT INTO tournament_templates (
    venue_id, director_id,
    name, description,
    game_type, tournament_format, race,
    entry_fee,
    phone_number,
    recurrence_type, recurrence_day,
    start_time, series_start_date,
    horizon_days, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    'Sunday 8-Ball Pool Tournament',
    'BCA rules. Alternant break. Race: 2W/1L. Sign-up at 7:00 PM, start at 7:30 PM. Payout: 1st, 2nd & 3rd. Separate 8-ball break pot $1. Contact: Kimberly (909) 533-9824.',
    '8 Ball', 'double_elimination', '2/1',
    10.00,
    '(909) 533-9824',
    'weekly', 'sunday',
    '19:30:00', '2026-03-29',
    30, 'active',
    false, false, false
  )
  RETURNING id INTO new_tmpl_id;

  -- ============================================================
  -- 3. Insert first tournament instance (next Sunday Mar 29)
  -- ============================================================
  INSERT INTO tournaments (
    venue_id, director_id, template_id, parent_template_id,
    name, description,
    game_type, tournament_format, race,
    tournament_date, start_time, timezone,
    entry_fee,
    phone_number,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47, new_tmpl_id, new_tmpl_id,
    'Sunday 8-Ball Pool Tournament',
    'BCA rules. Alternant break. Race: 2W/1L. Sign-up at 7:00 PM, start at 7:30 PM. Payout: 1st, 2nd & 3rd. Separate 8-ball break pot $1. Contact: Kimberly (909) 533-9824.',
    '8 Ball', 'double_elimination', '2/1',
    '2026-03-29', '19:30:00', 'America/Los_Angeles',
    10.00,
    '(909) 533-9824',
    true, 'active',
    false, false, false
  );

END;
$$;

-- Run the generator to fill the rest of the 30-day window
SELECT * FROM generate_recurring_tournaments();
