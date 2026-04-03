-- CreateTable
CREATE TABLE "ITipMatchStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fixtureId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "gameNumber" INTEGER NOT NULL,
    "homeTipPct" REAL NOT NULL,
    "awayTipPct" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ITipMatchStat_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ITipMatchStat_fixtureId_key" ON "ITipMatchStat"("fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "ITipMatchStat_season_roundNumber_gameNumber_key" ON "ITipMatchStat"("season", "roundNumber", "gameNumber");
