BEGIN TRANSACTION;

UPDATE "Settings"
SET "hiddenOlympiads" = json_insert(
  CASE WHEN json_type("hiddenOlympiads") = 'array' THEN "hiddenOlympiads" ELSE '[]' END,
  '$[#]', 'naq'
)
WHERE NOT EXISTS (SELECT 1 FROM json_each("hiddenOlympiads") WHERE value = 'naq');

UPDATE "Settings"
SET "olympiadOrder" = (
  SELECT json_group_array(value)
  FROM (
    SELECT value FROM json_each("Settings"."olympiadOrder")
    WHERE value != 'naq'
    ORDER BY CAST(key AS INTEGER)
  )
)
WHERE json_type("olympiadOrder") = 'array';

COMMIT;
