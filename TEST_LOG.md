# Test log — live site

Site tested: https://zil00.github.io/it-skills-map/ (commit `8a18291`), 2026-11-05.

**How it was tested.** The Claude desktop app's built-in browser wasn't available in this session. Instead, Playwright drove the installed Google Chrome (v156) in headless mode:
- **Phone:** 375×812, touch, mobile
- **Tablet:** 768×1024, touch
- **Desktop:** 1440×900
- **Dark mode:** Home and the Systems Administrator page at all three sizes

Every page was loaded fresh at each size, with all console messages, page errors and network responses recorded. Functional checks used real clicks, taps, typing, Back and refresh. To get past T-01 for the other functional checks, a test-only shim made `window.scrollTo` return nothing, as older browsers do; the site code was not changed.

Screenshots are in the session scratchpad: `scratchpad/qa/out/`.

Severity:
- **High:** broken or misleading
- **Medium:** looks bad or confusing
- **Low:** polish

## Problems

| ID | Page | Size | What's wrong | How to reproduce | Severity | Screenshot | Status |
|---|---|---|---|---|---|---|---|
| T-01 | All | All | **The site goes blank after the first click.** Any in-app navigation (nav menu, role card, "← All roles", browser Back) crashes React: `TypeError: destroy is not a function` (minified: `l is not a function`). Only a full reload brings the page back. Cause: `Layout.tsx` has `useEffect(() => window.scrollTo(0, 0))`. Chrome 156 returns a Promise from `scrollTo`, the arrow function returns it, and React calls it as a cleanup function. | Open the home page in current Chrome → click "Compare roles". | High | `T01_blank_after_nav_phone.png` | Fixed: the effect no longer returns the value from `scrollTo`. Nav menu, role cards and Back tested at 375/768/1440 with no errors and no shim. |
| T-02 | Home, all 10 role pages, Breaking in, Skills | Phone | **Bar charts are empty on phones.** The label column (190–230px) plus the right margin (110px) leaves no room for bars in a ~301px chart. Skill bars are 1px wide. The certification chart shows only names: no bars and no %. Skills explorer role bars are invisible. | Open any of these pages at 375px wide. | High | `home375_01_Top-10-skills.png`, `home375_02_Certifications.png`, `skills_phone.png` | Fixed: bar lists are now plain HTML. In a narrow box the label sits above a full-width bar. Re-tested at 375/768/1440 on Home, a role page, Skills and Breaking in: every bar visible (phone 22–177px), no text overflow. Fixed screenshots: `T02home375_*.png`, `T02sk768_*.png`. |
| T-03 | Home | All | **No small-sample warning on Home.** When filters leave fewer than 20 postings (e.g. Nova Scotia + Entry-level + Hybrid = 0), Home shows no warning: just "0 postings" cards and empty charts. Role pages and Breaking in do show it. | Home → set Province = Nova Scotia, Level = Entry-level, Work = Hybrid. | Medium | `fn_home_smallsample_1440.png` | Fixed: Home now shows the warning (and a 'No postings match' message at 0). Tested NS+Entry+Hybrid (0), NS (12) and no filters (no warning) at 375/768/1440. Screenshots `T03_home_*.png`. |
| T-04 | Skills | Tablet | **Role bars on Skills are 2–15px wide at tablet size.** Same cause as T-02: the right-hand column is ~390px wide. | Skills at 768px. | Medium | `sk768_*.png` | Fixed with T-02: at 768px the role bars are 32–189px wide, and labels sit above the bars. |
| T-05 | All 10 role pages | Phone | **Seniority chart labels overlap.** "Senior", "Lead / manager" and "Not stated" print on top of each other. | Any role page at 375px → Seniority mix. | Medium | `role375_05_Seniority-mix.png` | Fixed: the Seniority and Years charts are now HTML columns with equal widths, and their labels wrap underneath. Checked at 375/768/1440 on role pages and Breaking in, with no overlap or overflow. Screenshots: `T05role375_05_Seniority-mix.png`. Side effect: Recharts is no longer bundled, and the JS dropped from 671 KB to 302 KB. |
| T-06 | Compare | Phone (also tablet, slightly) | **Compare tables are cut off.** "At a glance" and "Skills side by side" are wider than the screen. The 2nd and 3rd roles are hidden off to the right with no sign that you can swipe sideways. Role names wrap into tall headers. | Compare at 375px. | Medium | `compare_phone.png` | Fixed: below 768px both tables become stacked lists, with one line per role, its colour dot and a full-width bar. Role names stay readable for screen readers. From 768px up they are tables with no forced minimum width. At 375/768/1440 there is no sideways scrolling and nothing is clipped. Screenshots: `T06cmp375_*.png`. |
| T-07 | All pages with filters | Phone | **The filter bar covers a quarter of the phone screen.** It wraps to 3 rows (~210px tall) and stays pinned to the top while scrolling. | Any page at 375px → scroll down. | Medium | `role375_09_What-to-learn-first-for-System.png` | Fixed: on phones the bar is now a single 53px line ('Filters (n)' button, a summary of active filters, and the count). The dropdowns open on tap and close with 'Done'. Tablet and desktop are unchanged (61–93px). Tested on a role page and Breaking in at 375/768/1440: filtering, Clear and the count all work, with no errors. Screenshot: `T07_systems-administrator_375.png`. |
| T-08 | All | All | **Filters and the URL get out of sync.** Three symptoms: (a) changing a filter doesn't update the link, so a filtered view can't be shared or bookmarked; (b) clearing a filter on a link like `?province=ON` leaves `?province=ON` in the URL, so a refresh brings the filter back; (c) opening a filtered link while the site is already open in that tab ignores the filter (it is only read on a full page load). | Open `#/roles/systems-administrator?province=ON` → set Province to "All provinces" → refresh: Ontario is back. | Medium | — | Fixed: the link now always mirrors the filters. (a) Picking a filter updates the URL. (b) Clearing removes it, so a refresh stays cleared. (c) Opening a filtered link while the site is open applies it. Filters still carry across pages and are added to each page's link. Skills keeps `?skill=` alongside them. Tested at 375/768/1440, with no errors. |
| T-09 | Skills | All | **Search only finds English skill names.** French terms return "No skill matches", even though the extractor matches them in postings: "sécurité", "réseau", "sauvegarde" (Backup & recovery). Search also isn't accent-insensitive. | Skills → type "sauvegarde". | Medium | — | Fixed: `export_site_data.py` now adds each skill's other names (English variants and French terms from `seed_data.py`, 1,132 in all) to `skills.json` as `aka`. Export re-run: only `skills.json` changed, and no numbers moved. Search ignores accents and case, lists name matches first, and shows *also called “…”* for alias hits. At 375/768/1440: "sauvegarde" finds Backup & recovery; "sécurité"/"securite" find 4; "réseau"/"reseau" find 2; "zzzz" shows the message. Screenshot: `T09_search_375.png`. |
| T-10 | Skills | All | **The skill list shows % without a sample size** (e.g. "42%"). The rule is a sample size next to every %. | Skills page, left-hand list. | Medium | `skills_phone.png` | Fixed: each row now shows e.g. "84% (723/860)", or "11 of 12" when n < 20. Checked at 375/768/1440 with and without filters; no row overflows. Screenshot: `T10_list_375.png`. |
| T-11 | All pages with charts | All | **Charts are unlabeled for screen readers and keyboards.** Each Recharts chart is a keyboard tab stop (`role="application"`, `tabindex=0`) with an empty `<title>`. Screen readers announce nothing useful, and keyboard users tab through 4 silent stops per page. | Role page → press Tab repeatedly. | Medium | — | Fixed by T-02/T-05: charts are now HTML lists, and Recharts is gone. At 375/768/1440 on Home, a role page, Skills, Breaking in and Compare, there are 0 `role=application` elements and 0 chart tab stops. Screen readers read each bar as text, e.g. "Scripting / automation 75% (95/126). Required: 71% (89 of 126), Nice to have: 5% (6 of 126)". |
| T-12 | All | All | **Grey text is too faint.** The text used for every sample size "(50/120)" and for notes (`#8a8983` on white) has 3.5:1 contrast. The minimum for small text is 4.5:1. | Any page. | Medium | — | Fixed: grey text changed from `#8a8983` to `#6b6a65`: 5.4:1 on white, 4.7:1 on the palest tinted rows. A contrast scan of every text element on all 14 pages at 375/768/1440 shows no grey text below 4.5:1. The only failures left are link blue (T-21). |
| T-13 | Home | All | **The hero text overstates entry-level.** It says "We read 860 entry-level and early-career IT job postings", but only 24% (209/860) are entry-level. The rest are mid, senior or not stated. | Home, first paragraph. | Medium | — | Fixed: the hero now reads "We read 860 IT job postings from across Canada, from help desk to systems and security roles…" and links "Just starting out? See Breaking in for the entry-level postings only." Checked at 375/768/1440; the link opens Breaking in. |
| T-14 | Home | All | **The bilingual note isn't supported by the data.** It says "Mostly Quebec and federal jobs". In the data, 130 of 168 bilingual postings are in Quebec, and only ~10 come from government employers. | Home → "Need English + French" card. | Low | — | Fixed: the note now reads "Mostly jobs in Quebec". In `v_jobs_unique`, 130 of 168 bilingual postings are in Quebec. Checked at 375/768/1440. |
| T-15 | Compare | All | **Compare ignores some clicks without saying why.** Clicking a selected role when only 2 are picked, or a 4th role when 3 are picked, does nothing. The only explanation is a small grey hint. | Compare → click the selected chips until 2 remain → click another selected chip. | Low | — | Open |
| T-16 | Compare | All | **Compare has no small-sample warning.** When filters leave a role with fewer than 20 postings, no warning appears; the cells do switch to counts. | Compare with Province = Nova Scotia. | Low | — | Open |
| T-17 | All | All | **Back doesn't restore your scroll position.** It returns you to a different spot on the page (e.g. 341px instead of ~2000px). | Home → scroll down → open a role → Back. | Low | — | Open |
| T-18 | All | All | **Page title and nav highlight don't change.** The browser tab title is the same on every page, so screen readers don't announce page changes. "Roles" isn't highlighted in the nav on role pages. | Open any role page and look at the tab title and nav. | Low | — | Open |
| T-19 | Role, Breaking in, Compare | Phone | **Some links are small tap targets:** 19–21px tall, under 24px. These are "← All roles", the role links under the Breaking in chart, and the role names in the career path. | 375px. | Low | — | Open |
| T-20 | All | All | **No "Skip to content" link**, so keyboard users must tab through the 6 header links on every page. | Press Tab on any page. | Low | — | Open |
| T-21 | All | All | **Link blue is slightly too faint.** `#2a78d6` is 4.42:1 on white, just under 4.5:1. The active nav item is 3.88:1. | — | Low | — | Open |
| T-22 | Home, role page | All | **No dark theme.** With the OS in dark mode the site stays light. Nothing breaks, but it's a bright page for dark-mode users. | OS dark mode → open the site. | Low | `home_phone_dark.png` | Open |
| T-23 | Home, Role, Skills | All | **Some wording is unclear for job seekers:** "Pay (middle half)", the category label "Area" on Skills, and the Seniority subtitle "From the job title, then years asked for, then LinkedIn's level". | — | Low | — | Open |
| T-24 | All | All | **Phones download more than they need.** There is one 670 KB JavaScript file (201 KB gzipped), and Home, Compare and Skills each download the 243 KB `summary.json`. Pages render in 1.1–1.7 s on a fast connection, so this isn't slow, just heavier than needed on phones. | — | Low | — | Open |
| T-25 | Skills | Phone | **On a phone, the skill details are easy to miss.** The skill list is a 560px scrolling box, and after you tap a skill its details start near the bottom of the screen (583px of 812px). | Skills at 375px → tap a skill. | Low | — | Open |

## What worked

- **Loading:**
  - All 14 pages load with no console errors, page errors, failed requests or 404s, at all three sizes and in dark mode.
  - Load to rendered page is 1.1–1.7 s.
- **Layout:** no page scrolls sideways at any size. The only overflow is inside the Compare tables (T-06). Tablet and desktop layouts are fine apart from T-04.
- **Links** (with the T-01 shim):
  - All nav links open the right page.
  - All 10 role cards open the right role, and browser Back returns home.
- **Deep links:** opening `#/roles/systems-administrator?province=ON` with a full load, or refreshing it, sets Ontario and shows 46 postings.
- **Filters:**
  - Each of the three filters changes the numbers (e.g. 327 → 12 → 7 → 0).
  - Filters stay set when moving between pages.
  - Clear resets them.
  - Breaking in hides the seniority filter.
  - The small-sample warning appears on role pages and Breaking in.
- **Compare:**
  - 2 and 3 roles work, and the column colours match the chips. Going down to 1 is blocked by design (T-15).
  - The career path shows 5 steps in order: Help Desk → IT Support → Network/NOC/Telecom → Systems Administrator → SOC.
- **Skills:**
  - Search is case-insensitive and matches partial names. Special characters work ("a+" finds CompTIA A+ and CySA+), and a search with no matches shows a message.
  - The selected skill is kept in the URL and survives a refresh.
- **Checklist:**
  - Ticks are still there after a refresh.
  - Ticks stay with the right skill when a filter reorders the list.
- **Data spot-check** against `jobs.db` (`v_jobs_unique`): all 5 match.
  - Home total: 860
  - English + French: 168 of 860
  - Sys Admin in Ontario: 46, of which PowerShell 23
  - Help Desk group, Microsoft 365: 42 of 55
  - Breaking in, asking for 0–1 years: 76 of 183
  - Home pay, middle half: $66.5k–$100k (n = 319), shown as $67k–$100k
- **Accessibility basics:**
  - One h1 per page, and no skipped heading levels.
  - `lang="en"` is set.
  - All selects and inputs have labels.
  - Tab order follows the visual order, and focus outlines are visible.
  - The logo image has empty alt text next to the site name, which is correct for a decorative image.
