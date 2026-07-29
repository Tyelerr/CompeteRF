
DO $$
DECLARE
  new_venue_id INT;
  shared_desc  TEXT;
BEGIN

  INSERT INTO venues (
    venue, address, city, state, zip_code, phone,
    latitude, longitude, status
  ) VALUES (
    'TJ''s Classic Billiards',
    '60 Airport Rd',
    'Waterville',
    'ME',
    '04901',
    '(207) 877-7665',
    44.5388,
    -69.6747,
    'active'
  )
  RETURNING id INTO new_venue_id;

  shared_desc := 'Open to all Maine residents. Fargo-based entry: 500 & under = $70 (GF inc), 501+ = $100 (GF inc). $750 added main event. $250 added 2nd chance tournament (race to 3). Doors 9:00 AM, starts 10:00 AM. Part of the 2026 Maine State Championships series hosted by TJ''s Classic Billiards.';

  -- 8-Ball: Jan 3 & 4
  INSERT INTO tournaments (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    tournament_date, start_time, timezone,
    entry_fee, added_money,
    phone_number, thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    '2026 Maine State Championship - 8-Ball',
    shared_desc,
    '8 Ball', 'double_elimination',
    '2026-01-03', '10:00:00', 'America/New_York',
    70.00, 750.00,
    '(207) 877-7665', '8-ball',
    false, 'completed',
    true, false, false
  );

  -- 9-Ball: Jan 31 & Feb 1
  INSERT INTO tournaments (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    tournament_date, start_time, timezone,
    entry_fee, added_money,
    phone_number, thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    '2026 Maine State Championship - 9-Ball',
    shared_desc,
    '9 Ball', 'double_elimination',
    '2026-01-31', '10:00:00', 'America/New_York',
    70.00, 750.00,
    '(207) 877-7665', '9-ball',
    false, 'completed',
    true, false, false
  );

  -- 14.1 Straight Pool: Feb 21 & 22
  INSERT INTO tournaments (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    tournament_date, start_time, timezone,
    entry_fee, added_money,
    phone_number, thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    '2026 Maine State Championship - 14.1 Straight Pool',
    shared_desc,
    'Straight Pool', 'double_elimination',
    '2026-02-21', '10:00:00', 'America/New_York',
    70.00, 750.00,
    '(207) 877-7665', 'straight-pool',
    false, 'completed',
    true, false, false
  );

  -- 10-Ball: Mar 7 & 8
  INSERT INTO tournaments (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    tournament_date, start_time, timezone,
    entry_fee, added_money,
    phone_number, thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    '2026 Maine State Championship - 10-Ball',
    shared_desc,
    '10 Ball', 'double_elimination',
    '2026-03-07', '10:00:00', 'America/New_York',
    70.00, 750.00,
    '(207) 877-7665', '10-ball',
    false, 'completed',
    true, false, false
  );

END;
$$;
