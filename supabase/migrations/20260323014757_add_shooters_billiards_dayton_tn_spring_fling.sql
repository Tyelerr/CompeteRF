
DO $$
DECLARE
  new_venue_id INT;
BEGIN

  INSERT INTO venues (
    venue, address, city, state, zip_code, phone,
    latitude, longitude, status
  ) VALUES (
    'Shooters Billiards',
    '9341 Rhea County Hwy',
    'Dayton',
    'TN',
    '37321',
    '(423) 285-5333',
    35.5012,
    -84.9988,
    'active'
  )
  RETURNING id INTO new_venue_id;

  INSERT INTO tournaments (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    race, max_fargo,
    tournament_date, start_time, timezone,
    entry_fee,
    phone_number, thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    'Spring Fling One Pocket Tournament',
    'Race to 3/2. Finals race to 5. Max Fargo 740. 20-player limited field, pre-payment required to secure spot. $120 entry includes $20 green fee. Doors open 10:30 AM, auction at noon. Played on freshly covered Diamond Red Label tables. Predator cue case raffle. Cue repair available on site by Champs Cue Repair. 2-day event (April 11-12). Call/text Scott: (423) 619-4223.',
    'One Pocket', 'double_elimination',
    '3/2', 740,
    '2026-04-11', '12:00:00', 'America/Chicago',
    120.00,
    '(423) 619-4223', 'one-pocket',
    false, 'active',
    true, false, true
  );

END;
$$;
