
-- ============================================================
-- Step 1: Enable pg_cron
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- Step 2: Core generation function
-- Reads all active templates and fills in missing instances
-- up to horizon_days from today (respecting series_end_date).
-- Safe to run multiple times -- skips any date already present.
-- ============================================================
CREATE OR REPLACE FUNCTION generate_recurring_tournaments()
RETURNS TABLE(template_id INT, dates_inserted INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tmpl          RECORD;
  horizon_end   DATE;
  check_date    DATE;
  day_num       INT;
  step_days     INT;
  inserted      INT;
  nth           INT;
  month_start   DATE;
  candidate     DATE;
  m             INT;
BEGIN
  FOR tmpl IN
    SELECT *
    FROM tournament_templates
    WHERE status = 'active'
      AND recurrence_type IS NOT NULL
      AND recurrence_day  IS NOT NULL
  LOOP
    inserted    := 0;
    horizon_end := CURRENT_DATE + COALESCE(tmpl.horizon_days, 30);

    -- Respect optional series end date
    IF tmpl.series_end_date IS NOT NULL AND tmpl.series_end_date < horizon_end THEN
      horizon_end := tmpl.series_end_date;
    END IF;

    -- Map recurrence_day text → DOW integer (0=Sun … 6=Sat)
    day_num := CASE lower(tmpl.recurrence_day)
      WHEN 'sunday'    THEN 0
      WHEN 'monday'    THEN 1
      WHEN 'tuesday'   THEN 2
      WHEN 'wednesday' THEN 3
      WHEN 'thursday'  THEN 4
      WHEN 'friday'    THEN 5
      WHEN 'saturday'  THEN 6
      ELSE 1
    END;

    -- --------------------------------------------------------
    -- WEEKLY / BIWEEKLY
    -- --------------------------------------------------------
    IF tmpl.recurrence_type IN ('weekly', 'biweekly') THEN
      step_days := CASE tmpl.recurrence_type WHEN 'biweekly' THEN 14 ELSE 7 END;

      -- Start from series_start_date, walk to the first matching weekday
      check_date := tmpl.series_start_date;
      WHILE EXTRACT(DOW FROM check_date)::INT <> day_num LOOP
        check_date := check_date + 1;
      END LOOP;

      -- Generate all occurrences in the window
      WHILE check_date <= horizon_end LOOP
        IF check_date >= CURRENT_DATE THEN
          IF NOT EXISTS (
            SELECT 1 FROM tournaments
            WHERE tournaments.template_id = tmpl.id
              AND tournament_date = check_date
          ) THEN
            INSERT INTO tournaments (
              venue_id, director_id, template_id, parent_template_id,
              name, description, description_es,
              game_type, tournament_format, game_spot, race, table_size,
              equipment, number_of_tables,
              tournament_date, start_time, timezone,
              entry_fee, added_money, side_pots,
              max_fargo, required_fargo_games, reports_to_fargo, open_tournament,
              phone_number, thumbnail, is_recurring, status,
              chip_ranges, calcutta
            ) VALUES (
              tmpl.venue_id, tmpl.director_id, tmpl.id, tmpl.id,
              tmpl.name, tmpl.description, tmpl.description_es,
              tmpl.game_type, tmpl.tournament_format, tmpl.game_spot, tmpl.race, tmpl.table_size,
              tmpl.equipment, tmpl.number_of_tables,
              check_date, tmpl.start_time, 'America/Phoenix',
              tmpl.entry_fee, tmpl.added_money, tmpl.side_pots,
              tmpl.max_fargo, tmpl.required_fargo_games, tmpl.reports_to_fargo, tmpl.open_tournament,
              tmpl.phone_number, tmpl.thumbnail, true, 'active',
              tmpl.chip_ranges, tmpl.calcutta
            );
            inserted := inserted + 1;
          END IF;
        END IF;
        check_date := check_date + step_days;
      END LOOP;

    -- --------------------------------------------------------
    -- MONTHLY  (Nth weekday of month, e.g. "3rd Friday")
    -- --------------------------------------------------------
    ELSIF tmpl.recurrence_type = 'monthly' THEN
      nth := COALESCE(tmpl.recurrence_week, 1);

      FOR m IN 0..23 LOOP
        month_start := DATE_TRUNC('month',
          tmpl.series_start_date + (m * INTERVAL '1 month'))::DATE;

        -- Find first occurrence of day_num in this month
        candidate := month_start;
        WHILE EXTRACT(DOW FROM candidate)::INT <> day_num LOOP
          candidate := candidate + 1;
        END LOOP;
        -- Advance to the Nth occurrence
        candidate := candidate + ((nth - 1) * 7);

        -- Skip if it rolled into the next month (e.g. "5th Friday" in a short month)
        IF EXTRACT(MONTH FROM candidate) <> EXTRACT(MONTH FROM month_start) THEN
          CONTINUE;
        END IF;

        EXIT WHEN candidate > horizon_end;

        IF candidate >= tmpl.series_start_date
           AND candidate >= CURRENT_DATE
           AND candidate <= horizon_end THEN
          IF NOT EXISTS (
            SELECT 1 FROM tournaments
            WHERE tournaments.template_id = tmpl.id
              AND tournament_date = candidate
          ) THEN
            INSERT INTO tournaments (
              venue_id, director_id, template_id, parent_template_id,
              name, description, description_es,
              game_type, tournament_format, game_spot, race, table_size,
              equipment, number_of_tables,
              tournament_date, start_time, timezone,
              entry_fee, added_money, side_pots,
              max_fargo, required_fargo_games, reports_to_fargo, open_tournament,
              phone_number, thumbnail, is_recurring, status,
              chip_ranges, calcutta
            ) VALUES (
              tmpl.venue_id, tmpl.director_id, tmpl.id, tmpl.id,
              tmpl.name, tmpl.description, tmpl.description_es,
              tmpl.game_type, tmpl.tournament_format, tmpl.game_spot, tmpl.race, tmpl.table_size,
              tmpl.equipment, tmpl.number_of_tables,
              candidate, tmpl.start_time, 'America/Phoenix',
              tmpl.entry_fee, tmpl.added_money, tmpl.side_pots,
              tmpl.max_fargo, tmpl.required_fargo_games, tmpl.reports_to_fargo, tmpl.open_tournament,
              tmpl.phone_number, tmpl.thumbnail, true, 'active',
              tmpl.chip_ranges, tmpl.calcutta
            );
            inserted := inserted + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;

    -- Return summary row for this template
    template_id    := tmpl.id;
    dates_inserted := inserted;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ============================================================
-- Step 3: Schedule via pg_cron — runs every day at 03:00 UTC
-- ============================================================
SELECT cron.schedule(
  'generate-recurring-tournaments',
  '0 3 * * *',
  'SELECT generate_recurring_tournaments()'
);
