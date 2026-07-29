
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
  174, 47,
  '10 Ball 550 & Under',
  'BCA rules. Race 9/7. Alternate break, flip for break. 3 foul rule in effect. NO early 10 ball. Jump cues allowed. Doors open 11:00 AM, players meeting 12:00 PM. $120 entry (GF/Admin included). $50 WTA optional side pot. TD discretion: 200 minimum games required. April 19th if needed. TD: Justin & Dee Meyer (918) 860-0544.',
  '10 Ball', 'double_elimination',
  '9/7', 550,
  '2026-04-18', '12:00:00', 'America/Chicago',
  120.00,
  '(918) 860-0544',
  '10-ball',
  false, 'active',
  true, false, false
);
