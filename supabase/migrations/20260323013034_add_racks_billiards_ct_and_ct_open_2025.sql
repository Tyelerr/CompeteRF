
DO $$
DECLARE
  new_venue_id INT;
BEGIN

  INSERT INTO venues (
    venue, address, city, state, zip_code, phone,
    latitude, longitude, status
  ) VALUES (
    'Racks Billiards and Bar',
    '500 Talcottville Rd',
    'Vernon',
    'CT',
    '06066',
    '(860) 454-0425',
    41.8531,
    -72.4596,
    'active'
  )
  RETURNING id INTO new_venue_id;

  INSERT INTO tournaments (
    venue_id, director_id,
    name, description,
    game_type, tournament_format,
    race, table_size, number_of_tables,
    tournament_date, start_time, timezone,
    entry_fee, added_money,
    phone_number,
    thumbnail,
    is_recurring, status,
    reports_to_fargo, open_tournament, calcutta
  ) VALUES (
    new_venue_id, 47,
    '6th Annual Connecticut Valley Open State Championship',
    '128-player double elimination with modified single race final. Fargo-based entry fees: 750-999 = $250, 700-749 = $150, 600-699 = $100, 000-599 = $75. Alternate break, opponent racks, magic rack template. Winner side: 8-ball race to 5 (call pocket). One-loss side: 9-ball race to 7 (called 9-ball). 3 foul rule. NO early 10-ball. Jump cues allowed. 100% payback. $50 WTA optional side pot. 200 minimum games required (TD discretion). Live streamed. Played on 15 x 7ft Valley Panther tables with Aramith balls & Aramith Premier cue balls. Doors 9:00 AM, meeting 10:00 AM, player CC 10:15 AM. Min 74 spots for players under 600; 54 spots reserved for 600+. Contact: racksbilliardsbar@gmail.com',
    '8 Ball', 'double_elimination',
    'Fargo Dependent', '7ft', 15,
    '2025-03-29', '10:15:00', 'America/New_York',
    75.00, 2300.00,
    '(860) 454-0425',
    '8-ball',
    false, 'completed',
    true, true, false
  );

END;
$$;
