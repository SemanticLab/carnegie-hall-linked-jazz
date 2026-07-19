# carnegie-hall-linked-jazz

Mashup of the Carnegie Hall × Linked Jazz datasets — a static site joining
**Carnegie Hall's performance-history Linked Open Data** (64k documented events
since 1891) with the **Linked Jazz 2026 oral-history corpus** (1,347 interviews).
People are joined on shared Wikidata QIDs plus validated name-based links —
3,626 people, 400 of them oral-history interviewees.

- **Musicians** — each person's documented Carnegie Hall concerts, a
  concerts-per-year timeline, and what they (and others) said in their interviews
- **Concerts** — full programs for featured events
- **Memories** — interview passages pinned to the documented concert they describe
- **Voices** — every "Carnegie Hall" passage in the corpus, searchable
- **Data & method** — provenance page

## Deployment

The site lives in [`site/`](site/) and deploys automatically to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) on every push to
`main` (repo Settings → Pages → Source: **GitHub Actions**).

**`site/` is generated — don't edit it by hand.** It is built in the
`ch-jazz-mashup` project (`carnegie-voices/`, see its README) and synced here
with that project's `carnegie-voices/sync.sh`. The one exception to the sync:
`site/img/` (all portraits, mirrored from Wikimedia Commons / Semlab by the
build's `09_fetch_images.py`) lives only in this repo — the site makes no
external image requests.

## Data sources

- [Carnegie Hall Linked Open Data](https://github.com/CarnegieHall/linked-data) (CC0 1.0)
- Linked Jazz 2026 corpus: Hamilton College Fillius Jazz Archive, Smithsonian
  Jazz Oral History Program, Rutgers Institute of Jazz Studies, Tulane Hogan
  Jazz Archive
- Join & portraits: [Wikidata](https://www.wikidata.org) / Wikimedia Commons
