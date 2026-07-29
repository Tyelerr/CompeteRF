
DO $$
DECLARE
  new_venue_id INT;
  new_tmpl_id  INT;
BEGIN

  INSERT INTO venues (
    venue, address, city, state, zip_code, phone,
    latitude, longitude, status
  ) VALUES (
    'Sullivan''s Sports Bar',
    '701 President Pl, Ste 140',
    'Smyrna',
    'TN',
    '37167',
    '(615) 459-7864',
    35.9791,
    -86.5582,
    'active'
  )
  RETURNING id INTO new_venue_id;

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
    'Wednesday Night 8-Ball Tournament',
    'Double elimination. Modified BCA rules. Call your shots. 8-ball must go clean. 8 on the break doesn''t count (spot the 8 and play it out, or re-rack). Winner and loser side race to 2. Alternate breaks (3rd game flip or lag for break). Break and run player auctions. $25 entry includes green fee. Sign-ups 6:00 PM, tournament starts 7:00 PM.',
    '8 Ball', 'double_elimination',
    '2',
    25.00,
    '(615) 459-7864',
    'weekly', 'wednesday',
    '19:00:00', '2026-03-25',
    30, 'active',
    false, false, true
  )
  RETURNING id INTO new_tmpl_id;

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
    new_venue_id, 47, new_tmpl_id, new_tmpl_id,
    'Wednesday Night 8-Ball Tournament',
    'Double elimination. Modified BCA rules. Call your shots. 8-ball must go clean. 8 on the break doesn''t count (spot the 8 and play it out, or re-rack). Winner and loser side race to 2. Alternate breaks (3rd game flip or lag for break). Break and run player auctions. $25 entry includes green fee. Sign-ups 6:00 PM, tournament starts 7:00 PM.',
    '8 Ball', 'double_elimination',
    '2',
    '2026-03-25', '19:00:00', 'America/Chicago',
    25.00, '8-ball',
    '(615) 459-7864',
    true, 'active',
    false, false, true
  );

END;
$$;

SELECT template_id, dates_inserted
FROM generate_recurring_tournaments()
WHERE dates_inserted > 0
ORDER BY template_id DESC
LIMIT 2;
