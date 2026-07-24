-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScraperAuthToken" (
    "platform" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "token" TEXT NOT NULL,

    PRIMARY KEY ("platform", "username")
);
DROP TABLE "ScraperAuthToken";
ALTER TABLE "new_ScraperAuthToken" RENAME TO "ScraperAuthToken";
PRAGMA foreign_keys=ON;
