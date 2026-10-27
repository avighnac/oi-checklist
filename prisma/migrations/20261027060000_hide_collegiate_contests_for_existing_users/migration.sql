BEGIN TRANSACTION;

UPDATE "Settings"
SET "hiddenOlympiads" = json_insert(
  CASE WHEN json_type("hiddenOlympiads") = 'array' THEN "hiddenOlympiads" ELSE '[]' END,
  '$[#]', 'gcpc'
)
WHERE NOT EXISTS (SELECT 1 FROM json_each("hiddenOlympiads") WHERE value = 'gcpc');

UPDATE "Settings"
SET "hiddenOlympiads" = json_insert("hiddenOlympiads", '$[#]', 'ncpc')
WHERE NOT EXISTS (SELECT 1 FROM json_each("hiddenOlympiads") WHERE value = 'ncpc');

UPDATE "Settings"
SET "hiddenOlympiads" = json_insert("hiddenOlympiads", '$[#]', 'nwerc')
WHERE NOT EXISTS (SELECT 1 FROM json_each("hiddenOlympiads") WHERE value = 'nwerc');

UPDATE "Settings"
SET "olympiadOrder" = (
  SELECT json_group_array(value)
  FROM (
    SELECT value FROM json_each("Settings"."olympiadOrder")
    WHERE value NOT IN ('gcpc', 'ncpc', 'nwerc')
    ORDER BY CAST(key AS INTEGER)
  )
)
WHERE json_type("olympiadOrder") = 'array';

COMMIT;
