
DO $$
DECLARE
  new_venue_id INT;
BEGIN

  -- ============================================================
  -- 1. Insert venue
  -- ============================================================
  INSERT INTO venues (
    venue, address, city, state, zip_code, phone,
    latitude, longitude, status
  ) VALUES (
    'The Nest Pub & Grill',
    '181 Plaistow Rd',
    'Plaistow',
    'NH',
    '03865',
    '(603) 974-1686',
    42.8376,
    -71.0984,
    'active'
  )
  RETURNING id INTO new_venue_id;

  -- ============================================================
  -- 2. Insert completed one-time tournament (March 29, 2025)
  -- ============================================================
  INSERT INTO tournaments (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    race, max_fargo,
    tournament_date, start_time, timezone,
    entry_fee,
    phone_number,
    thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    '3rd Annual "The Storm" Tournament',
    '8-Ball Scotch Doubles. Call shot, no break 8s. $120/team due day of. Max Fargo rate 1100 (+5pt increase following registration; will convert other affiliations). 40 team max. Race to 4 (A side) / 3 (B side). Doors open 8:00 AM, player auction 8:30 AM, play starts 9:00 AM. Fundraiser for Boston ICE Storm Adaptive Sled Hockey Nationals trip. Contact: Tylor Crocker on Facebook or call/text (978) 790-6691.',
    '8 Ball Scotch Doubles', 'double_elimination',
    '4/3', 1100,
    '2025-03-29', '09:00:00', 'America/New_York',
    120.00,
    '(978) 790-6691',
    '8-ball-scotch-doubles',
    false, 'completed',
    true, false, true
  );

END;
$$;
