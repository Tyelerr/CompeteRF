
DO $$
DECLARE
  new_venue_id INT;
BEGIN

  INSERT INTO venues (
    venue, address, city, state, zip_code, phone,
    latitude, longitude, status
  ) VALUES (
    'Classic Cue Billiards & Sports Bar',
    '647 N Riverside Dr',
    'Clarksville',
    'TN',
    '37040',
    '(931) 552-1353',
    36.5273,
    -87.3595,
    'active'
  )
  RETURNING id INTO new_venue_id;

  INSERT INTO tournaments (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    race, max_fargo, required_fargo_games,
    tournament_date, start_time, timezone,
    entry_fee, added_money,
    phone_number, thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    '500 & Under 8-Ball Tournament',
    'Must have Fargo Rate of 500 or under with 200 games recorded to qualify — no exceptions. Race to 3, double elimination. Alternate the break, rack your own. $250 added guaranteed. $35 entry includes $10 green fee. Sign-ups 11:00 AM, player auction at noon.',
    '8 Ball', 'double_elimination',
    '3', 500, 200,
    '2026-04-04', '12:00:00', 'America/Chicago',
    35.00, 250.00,
    '(931) 552-1353', '8-ball',
    false, 'active',
    true, false, true
  );

END;
$$;
