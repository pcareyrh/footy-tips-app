# Data Retrieval Plan for NRL Tipping App

## Requirements Summary
- **Budget**: Hybrid (free where possible, paid where necessary)
- **Update Frequency**: Weekly (pre-round)
- **Geographic Scope**: NRL only (Australia)
- **Historical Data**: Current season critical, last season if available
- **Technical Approach**: Prefer APIs, but web scraping acceptable
- **Use Case**: Personal use only

---

## Data Categories & Sources

### 1. MATCH SCHEDULES & RESULTS
**What we need:**
- Fixture dates, times, venues
- Match results, final scores
- Live odds/betting lines

**Source Options:**
| Source | Type | Cost | Pros | Cons | Recommendation |
|--------|------|------|------|------|-----------------|
| **NRL Official Website** (nrl.com.au) | Web Scrape | Free | Official, accurate, complete | No API, scraping fragile | PRIMARY |
| **ESPN API** | API | Free | Structured data, reliable | May lag on updates | SECONDARY |
| **Alpha Vantage Sports** | API | Freemium | Clean API, good coverage | Limited free tier | FALLBACK |
| **Sports-Reference** | Web Scrape | Free | Comprehensive historical | Rate limiting | SECONDARY |

**Recommended Approach:**
- Primary: Scrape nrl.com.au fixture/results weekly
- Fallback: ESPN API for redundancy
- Frequency: Weekly, automated before each round

---

### 2. TEAM FORM & STATISTICS
**What we need:**
- Win-loss records, streaks
- Points for/against
- Home/away splits
- Possession %, completion rate, error counts
- Tackling accuracy, offload success

**Source Options:**
| Source | Type | Cost | Pros | Cons | Recommendation |
|--------|------|------|------|------|-----------------|
| **NRL Official** (stats.nrl.com) | Web Scrape | Free | Complete, authoritative | Requires scraping | PRIMARY |
| **ESPN** | API/Scrape | Free | Detailed stats, structured | May not have all metrics | SECONDARY |
| **Sportradar** | API | Paid ($$$) | Comprehensive, real-time | Expensive for personal use | NOT RECOMMENDED |
| **StatsBomb** | API | Paid ($$) | Advanced analytics | Expensive, may not cover NRL | NOT RECOMMENDED |

**Recommended Approach:**
- Primary: Scrape nrl.com.au/stats weekly for official statistics
- Fallback: Manual entry or ESPN if scraping fails
- Build local database of historical stats

---

### 3. INJURY REPORTS & TEAM NEWS
**What we need:**
- Key player injuries, return timelines
- Squad selections/team sheets
- Suspension news
- Coaching changes, staff updates

**Source Options:**
| Source | Type | Cost | Pros | Cons | Recommendation |
|--------|------|------|------|------|---|
| **NRL Official** (nrl.com.au) | Web Scrape | Free | Official announcements | Manual, scattered across site | PRIMARY |
| **ESPN** | Web Scrape | Free | Injury reports, news | Summarized, not always complete | SECONDARY |
| **Official Club Websites** | Web Scrape | Free | Direct from source | Fragmented, inconsistent formats | SECONDARY |
| **Reddit (r/nrl)** | Web Scrape | Free | Community insights, breaking news | Unverified, informal | SUPPLEMENTARY |
| **Press releases** (RSS feeds) | Feed Parser | Free | Structured, timely | Requires maintaining feed list | SUPPLEMENTARY |

**Recommended Approach:**
- Primary: Weekly manual review of NRL.com injury/news section
- Fallback: Scrape club websites for team sheets
- Supplementary: Monitor Reddit and news feeds for breaking injury news
- Store in local database with manual verification

---

### 4. HEAD-TO-HEAD HISTORY & MATCHUP DATA
**What we need:**
- Historical H2H records
- Recent matchup results, margins
- Home/away H2H splits
- Scoring patterns vs opponent

**Source Options:**
| Source | Type | Cost | Pros | Cons | Recommendation |
|--------|------|------|------|------|---|
| **NRL.com Historical Data** | Scrape | Free | Complete fixture history | Fragmented across pages | PRIMARY |
| **Wikipedia NRL Season Pages** | Scrape | Free | Structured yearly data | Limited stat detail | SECONDARY |
| **Sports-Reference.com** | Scrape | Free | Historical data, well-organized | Rate limiting, incomplete NRL | SECONDARY |
| **Statsbomb** | API | Paid | Advanced matchup analysis | Too expensive | NOT RECOMMENDED |

**Recommended Approach:**
- Build historical H2H database from nrl.com archives (one-time effort)
- Update automatically each week with new results
- Calculate rolling statistics (last 5 matchups, etc.)

---

### 5. LADDER POSITION & POINTS DIFFERENTIAL
**What we need:**
- Current ladder standings
- Win-loss record by team
- Points for/against
- Points differential (+/-)

**Source Options:**
| Source | Type | Cost | Pros | Cons | Recommendation |
|--------|------|------|------|------|---|
| **NRL.com Ladder** | Scrape | Free | Official, updated live | Simple HTML to parse | PRIMARY |
| **ESPN Standings** | Scrape | Free | Clean layout, reliable | May lag slightly | SECONDARY |
| **Official Club Sites** | Scrape | Free | Direct source | Fragmented | NOT RECOMMENDED |

**Recommended Approach:**
- Scrape nrl.com ladder weekly (simple HTML parsing)
- Calculate differential and streaks from historical results

---

### 6. REFEREE INFORMATION
**What we need:**
- Referee assignments
- Referee penalty trends
- Historical calling patterns
- Controversies/incidents

**Source Options:**
| Source | Type | Cost | Pros | Cons | Recommendation |
|--------|------|------|------|------|---|
| **NRL.com Fixture Details** | Scrape | Free | Official assignment | Basic info only | PRIMARY |
| **Manual Research** | Manual | Free | Detailed analysis, YouTube clips | Time-intensive | SUPPLEMENTARY |
| **Reddit/NRL Forums** | Scrape | Free | Community analysis | Unverified opinions | SUPPLEMENTARY |
| **Stats Sites** | Scrape | Free | Penalty statistics by ref | Limited availability | FALLBACK |

**Recommended Approach:**
- Extract referee names from fixture scraping
- Manual research on known tendencies (build reference notes)
- Use community commentary for controversial calls

---

### 7. ODDS & BETTING LINES
**What we need:**
- Betting odds for each match
- Line movement, opening vs closing
- Implied probabilities
- Public betting percentages

**Source Options:**
| Source | Type | Cost | Pros | Cons | Recommendation |
|--------|------|------|------|------|---|
| **Sportsbet, TAB, Neds** | Scrape | Free | Australian-specific, official | Terms of service may restrict scraping | PRIMARY (with caution) |
| **Odds Portals** (OddsShark, etc.) | API/Scrape | Free | Aggregates multiple books | Consolidated data may lag | SECONDARY |
| **betexplorer.com** | Scrape | Free | Historical odds, line movement | No direct API | SECONDARY |
| **Sportradar Odds** | API | Paid | Real-time, reliable | Too expensive | NOT RECOMMENDED |

**Recommended Approach:**
- Scrape Australian bookmakers (respect robots.txt, rate limit)
- Use odds portals as backup for line comparisons
- Store weekly opening/closing for analysis
- Consider terms of service — may need manual entry for compliance

---

### 8. COACH & TEAM STABILITY INFORMATION
**What we need:**
- Coaching tenure, experience
- Recent coaching changes
- Player/staff contracts, exits
- Team culture indicators

**Source Options:**
| Source | Type | Cost | Pros | Cons | Recommendation |
|--------|------|------|------|------|---|
| **NRL.com News** | Scrape | Free | Official announcements | Scattered, requires parsing | PRIMARY |
| **Official Club Media** | Scrape | Free | Direct source | Inconsistent formats | SECONDARY |
| **Sports News Sites** | Scrape | Free | Breaking news, analysis | Multiple sources needed | SECONDARY |
| **LinkedIn/Twitter** | Scrape | Free | Real-time announcements | Requires social listening | SUPPLEMENTARY |

**Recommended Approach:**
- Scrape NRL.com and club media weekly for personnel news
- Manual notes on coaching tenure (build reference table)
- Monitor social media for breaking announcements

---

## Summary Table: Primary Data Sources

| Data Type | Primary Source | Method | Frequency | Cost | Notes |
|-----------|---|---|---|---|---|
| **Fixtures & Results** | nrl.com.au | Scrape | Weekly | Free | Automate with scheduler |
| **Team Stats** | nrl.com.au/stats | Scrape | Weekly | Free | Build historical database |
| **Injuries/News** | nrl.com.au | Scrape/Manual | 2-3x/week | Free | Critical for accuracy |
| **H2H History** | nrl.com.au archives | Scrape (one-time) | Initial load | Free | Build once, update incrementally |
| **Ladder** | nrl.com.au | Scrape | Weekly | Free | Simple HTML parsing |
| **Referee Info** | nrl.com.au | Scrape | Weekly | Free | Manual research supplement |
| **Odds** | Sportsbet/TAB | Scrape (cautious) | Weekly | Free | Respect ToS, may need manual entry |
| **Team News** | Official sources | Scrape/Manual | 2-3x/week | Free | Manual review more reliable |

---

## Architecture & Technical Considerations

### 1. Data Pipeline
```
Weekly Automation:
├─ Monday: Scrape fixture schedule for upcoming round
├─ Tuesday-Wednesday: Collect injury reports, team news (manual/semi-auto)
├─ Wednesday-Thursday: Scrape latest stats, ladder, H2H
├─ Thursday-Friday: Compile odds, final team sheets
└─ Weekend: Manual verification before picks
```

### 2. Web Scraping Implementation
**Recommended Stack:**
- **Language**: Python (libraries: BeautifulSoup, Selenium, Scrapy)
- **Scheduler**: APScheduler or cron jobs
- **Database**: SQLite or PostgreSQL (local or cloud)
- **Rate Limiting**: 1-2 second delays between requests, respect robots.txt

**Best Practices:**
- Cache results to minimize repeated requests
- Implement error handling (site structure changes)
- Use User-Agent headers (appear as browser, not bot)
- Monitor for ToS violations
- Fallback sources if primary unavailable

### 3. Data Storage
**Suggested Schema:**
```
Tables:
- fixtures (id, date, team1, team2, result, odds)
- team_stats (week, team, wins, losses, pf, pa, possession, etc.)
- injuries (team, player, position, status, return_date)
- h2h_history (team1, team2, wins, losses, scoring_average)
- ladder (week, team, position, wins, losses, points_for, points_against)
- referee_info (match_id, referee, reputation_notes)
- match_analysis (match_id, team_pick, confidence, reasoning, result)
```

### 4. Data Validation
- **Completeness checks**: All teams have stats before round
- **Plausibility checks**: Win-loss totals match fixture results
- **Consistency checks**: Ladder points differential = sum of games
- **Manual review process**: Verify key injuries before picks

---

## Legal & Terms of Service Considerations

### Web Scraping Compliance
1. **Respect robots.txt** - Check nrl.com.au/robots.txt
2. **Rate limiting** - Don't overwhelm servers (1-2 sec delays minimum)
3. **User-Agent headers** - Identify as legitimate scraper
4. **Check ToS** - NRL.com terms may restrict automated access
5. **Betting sites** - TAB, Sportsbet likely prohibit scraping (verify ToS)

### Recommendations
- Contact NRL for API access (may have media partners program)
- Use odds portals instead of direct scraping from bookmakers
- Keep scraping to non-peak hours
- Consider paying for clean data if scraping becomes problematic

---

## Cost Estimate

| Item | Cost | Notes |
|------|------|-------|
| **Development Time** | ~40-60 hours | Initial build + testing |
| **Data Sources** | $0 | All free options available |
| **Infrastructure** | $0-5/month | Local machine or cheap cloud hosting |
| **APIs (optional)** | $0 | Free tier ESPN, Alpha Vantage |
| **Paid Services (optional)** | $50-200/month | Sportradar, StatsBomb if needed later |
| **TOTAL (MVP)** | $0/month | Fully free solution available |

---

## Implementation Roadmap

### Phase 1: MVP (Weeks 1-2)
- [ ] Set up Python scraping framework
- [ ] Scrape NRL.com fixture schedule
- [ ] Scrape NRL.com ladder
- [ ] Scrape basic team stats
- [ ] Manual injury input form
- [ ] Simple decision checklist

### Phase 2: Enhancement (Weeks 3-4)
- [ ] Historical H2H scraping
- [ ] Betting odds integration
- [ ] Referee tracking
- [ ] Coach/stability information
- [ ] Analytics dashboard

### Phase 3: Automation (Week 5+)
- [ ] Fully automated weekly scraping
- [ ] Email/notification alerts
- [ ] Performance tracking (picks vs outcomes)
- [ ] Pattern analysis (which factors predict best)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Website structure changes | Scraping breaks | Build robust parsing, fallback sources |
| Data lag/inconsistency | Bad decisions | Manual verification, multiple sources |
| ToS violations | Legal issues | Comply strictly, consider paid APIs |
| Incomplete data | Missing factors | Manual research process, notes fields |
| Manual bottlenecks | Time-intensive | Automate what you can, accept some manual work |

---

## Next Steps

1. **Set up development environment** (Python, database)
2. **Build first web scraper** (nrl.com.au fixtures)
3. **Create local database schema**
4. **Implement weekly automation**
5. **Build decision interface** (checklist/calculator)
6. **Add performance tracking**
