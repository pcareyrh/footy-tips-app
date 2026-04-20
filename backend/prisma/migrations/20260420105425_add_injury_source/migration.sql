-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Injury" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "position" TEXT,
    "injuryType" TEXT,
    "severity" TEXT,
    "returnDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'out',
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Injury_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Injury" ("createdAt", "id", "injuryType", "notes", "playerName", "position", "returnDate", "severity", "status", "teamId", "updatedAt") SELECT "createdAt", "id", "injuryType", "notes", "playerName", "position", "returnDate", "severity", "status", "teamId", "updatedAt" FROM "Injury";
DROP TABLE "Injury";
ALTER TABLE "new_Injury" RENAME TO "Injury";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
