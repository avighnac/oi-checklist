PRAGMA foreign_keys=ON;
BEGIN TRANSACTION;

-- 20261027000000_group_problems_by_day
UPDATE "Problem"
SET "extra" = CASE WHEN "number" <= 3 THEN 'Day 1' ELSE 'Day 2' END,
    "number" = (("number" - 1) % 3) + 1
WHERE "extra" = ''
  AND "number" BETWEEN 1 AND 6
  AND "source" = 'ioi'
  AND "year" BETWEEN 2002 AND 2026
  -- IOI 2009/2010 have four-task day groups
  AND "year" NOT IN (2009, 2010);

-- 20261027010000_group_boi_problems_by_day
UPDATE "Problem"
SET "extra" = CASE WHEN "number" <= 3 THEN 'Day 1' ELSE 'Day 2' END,
    "number" = (("number" - 1) % 3) + 1
WHERE "source" = 'boi'
  AND "extra" = ''
  AND "number" BETWEEN 1 AND 6
  AND "year" IN (2000, 2006, 2012, 2013, 2014, 2015, 2017, 2018, 2019,
                 2020, 2021, 2022, 2023, 2024, 2025, 2026);

-- 20261027020000_group_boi_2016_by_day
UPDATE "Problem"
SET "extra" = CASE WHEN "number" <= 3 THEN 'Day 1' ELSE 'Day 2' END,
    "number" = (("number" - 1) % 3) + 1
WHERE "source" = 'boi'
  AND "year" = 2016
  AND "extra" = ''
  AND "number" BETWEEN 1 AND 5;

-- 20261027030000_group_poi_problems_by_day
UPDATE "Problem"
SET "extra" = CASE WHEN "number" <= 3 THEN 'Day 1' ELSE 'Day 2' END,
    "number" = (("number" - 1) % 3) + 1
WHERE "source" = 'poi'
  AND "extra" = ''
  AND "number" BETWEEN 1 AND 6
  AND "year" IN (1998, 2005, 2010, 2011, 2012, 2014, 2015, 2016, 2018, 2019);

-- 20261027040000_correct_poi_final_tasks
DELETE FROM "Problem"
WHERE "source" = 'poi' AND "extra" = '' AND (
    ("year" = 1997 AND "number" = 6 AND "name" = 'Skok w bok')
 OR ("year" = 2009 AND "number" = 1 AND "name" = 'Words 2')
 OR ("year" = 2021 AND "number" = 1 AND "name" = 'Kolekcjoner Bajtemonów 2')
 OR ("year" = 2022 AND "number" = 1 AND "name" = 'Impreza krasnali 2')
 OR ("year" = 2022 AND "number" = 2 AND "name" = 'Zera i jedynki')
 OR ("year" = 2024 AND "number" = 1 AND "name" = 'Stacje benzynowe')
 OR ("year" = 2025 AND "number" = 1 AND "name" = 'Ogrodzenie')
 OR ("year" = 2025 AND "number" = 2 AND "name" = 'Zera i jedynki')
);

-- Five-task finals with two tasks on Day 1 and three on Day 2.
UPDATE "Problem"
SET "extra" = CASE WHEN "number" <= 2 THEN 'Day 1' ELSE 'Day 2' END,
    "number" = CASE WHEN "number" <= 2 THEN "number" ELSE "number" - 2 END
WHERE "source" = 'poi' AND "extra" = '' AND "number" BETWEEN 1 AND 5
  AND "year" IN (1999, 2000, 2001, 2002, 2003, 2006, 2007);

-- Five-task finals with three tasks on Day 1 and two on Day 2.
UPDATE "Problem"
SET "extra" = CASE WHEN "number" <= 3 THEN 'Day 1' ELSE 'Day 2' END,
    "number" = (("number" - 1) % 3) + 1
WHERE "source" = 'poi' AND "extra" = '' AND "number" BETWEEN 1 AND 5
  AND "year" IN (1997, 2008, 2017);

-- These files started with one non-final entry, followed by the five final tasks
UPDATE "Problem"
SET "extra" = CASE WHEN "number" <= 4 THEN 'Day 1' ELSE 'Day 2' END,
    "number" = (("number" - 2) % 3) + 1
WHERE "source" = 'poi' AND "extra" = '' AND "number" BETWEEN 2 AND 6
  AND "year" IN (2009, 2021, 2024);

-- These files started with two practice tasks, followed by four final tasks
UPDATE "Problem"
SET "extra" = CASE WHEN "number" <= 5 THEN 'Day 1' ELSE 'Day 2' END,
    "number" = (("number" - 3) % 3) + 1
WHERE "source" = 'poi' AND "extra" = '' AND "number" BETWEEN 3 AND 6
  AND "year" IN (2022, 2025);

-- 2004: Misie-Patysie (old #5) belongs to Day 1
UPDATE "Problem"
SET "extra" = CASE WHEN "number" IN (1, 2, 5) THEN 'Day 1' ELSE 'Day 2' END,
    "number" = CASE WHEN "number" <= 2 THEN "number"
                    WHEN "number" = 5 THEN 3 ELSE "number" - 2 END
WHERE "source" = 'poi' AND "extra" = '' AND "year" = 2004
  AND "number" BETWEEN 1 AND 5;

-- 2013: Maze is Day 1; Gdzie jest jedynka? is Day 2
UPDATE "Problem"
SET "extra" = CASE WHEN "number" IN (1, 3, 4) THEN 'Day 1' ELSE 'Day 2' END,
    "number" = CASE "number" WHEN 1 THEN 1 WHEN 2 THEN 1 WHEN 3 THEN 3
                             WHEN 4 THEN 2 WHEN 5 THEN 2 WHEN 6 THEN 3 END
WHERE "source" = 'poi' AND "extra" = '' AND "year" = 2013
  AND "number" BETWEEN 1 AND 6;

-- CEOI
UPDATE "Problem"
SET "extra" = CASE WHEN "number" <= 3 THEN 'Day 1' ELSE 'Day 2' END,
    "number" = CASE
        WHEN "year" = 2006 AND "number" IN (1, 2) THEN "number" + 1
        WHEN "year" = 2008 AND "number" IN (2, 5) THEN 3
        WHEN "year" = 2009 AND "number" = 1 THEN 2
        WHEN "year" = 2009 AND "number" = 4 THEN 3
        WHEN "year" = 2010 AND "number" = 1 THEN 3
        ELSE (("number" - 1) % 3) + 1 END
WHERE "source" = 'ceoi' AND "extra" = '' AND "number" BETWEEN 1 AND 6
  AND "year" IN (2005, 2006, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015,
                 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025);

COMMIT;
