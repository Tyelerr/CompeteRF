
DO $$
DECLARE
  new_venue_id INT;
  shared_desc  TEXT;
BEGIN

  -- ============================================================
  -- 1. Insert venue
  -- ============================================================
  INSERT INTO venues (
    venue, address, city, state, zip_code, phone,
    latitude, longitude, status
  ) VALUES (
    'Buffalos Elmwood',
    '5015 Bloomfield St',
    'Jefferson',
    'LA',
    '70121',
    '(504) 836-0590',
    29.9537,
    -90.1642,
    'active'
  )
  RETURNING id INTO new_venue_id;

  -- Shared rules text
  shared_desc := 'Part of the 9 Ball Extravaganza (April 24–26, 2026). Modified BCA rules. Alternate breaks. No 3-foul rule. No nine on the break. Nine spots after inning is over. $1000 added money based on 64 players. Entry after April 17th: $125. Only paid spots held. 300 minimum robustness preferred. Contact Jeremy: 504-481-5261.';

  -- ============================================================
  -- 2. Event 1: Open 9-Ball — Friday calcutta 8PM, play Sat
  -- ============================================================
  INSERT INTO tournaments (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    race, table_size,
    tournament_date, start_time, timezone,
    entry_fee, added_money,
    phone_number, thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    '9 Ball Extravaganza - Event 1: Open 9 Ball',
    'Open division (no Fargo cap). Race to 7. Played on 9ft Diamond tables. Calcutta starts Friday April 24 at 8:00 PM (2nd calcutta). ' || shared_desc,
    '9 Ball', 'double_elimination',
    '7', '9ft',
    '2026-04-25', '10:00:00', 'America/Chicago',
    75.00, 1000.00,
    '(504) 481-5261', '9-ball',
    false, 'active',
    true, true, true
  );

  -- ============================================================
  -- 3. Event 2: Fargo 650 & Under — Friday calcutta 8PM, play Sat
  -- ============================================================
  INSERT INTO tournaments (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    race, table_size, max_fargo,
    tournament_date, start_time, timezone,
    entry_fee, added_money,
    phone_number, thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    '9 Ball Extravaganza - Event 2: Fargo 650 & Under',
    'Fargo 650 and under. Race to 7. Played on 7ft Diamond tables. Calcutta starts Friday April 24 at 8:00 PM (1st calcutta). ' || shared_desc,
    '9 Ball', 'double_elimination',
    '7', '7ft', 650,
    '2026-04-25', '10:00:00', 'America/Chicago',
    75.00, 1000.00,
    '(504) 481-5261', '9-ball',
    false, 'active',
    true, false, true
  );

  -- ============================================================
  -- 4. Event 3: Fargo 550 & Under — Saturday 10AM
  -- ============================================================
  INSERT INTO tournaments (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    race, table_size, max_fargo,
    tournament_date, start_time, timezone,
    entry_fee, added_money,
    phone_number, thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    '9 Ball Extravaganza - Event 3: Fargo 550 & Under',
    'Fargo 550 and under. Race to 5. Played on 7ft Diamond tables. Starts Saturday April 25 at 10:00 AM. ' || shared_desc,
    '9 Ball', 'double_elimination',
    '5', '7ft', 550,
    '2026-04-26', '10:00:00', 'America/Chicago',
    75.00, 1000.00,
    '(504) 481-5261', '9-ball',
    false, 'active',
    true, false, false
  );

  -- ============================================================
  -- 5. Event 4: Fargo 450 & Under — Saturday 10AM
  -- ============================================================
  INSERT INTO tournaments (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    race, table_size, max_fargo,
    tournament_date, start_time, timezone,
    entry_fee, added_money,
    phone_number, thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    '9 Ball Extravaganza - Event 4: Fargo 450 & Under',
    'Fargo 450 and under. Race to 5. Played on 7ft Diamond tables. Starts Saturday April 25 at 10:00 AM. ' || shared_desc,
    '9 Ball', 'double_elimination',
    '5', '7ft', 450,
    '2026-04-26', '10:00:00', 'America/Chicago',
    75.00, 1000.00,
    '(504) 481-5261', '9-ball',
    false, 'active',
    true, false, false
  );

END;
$$;
