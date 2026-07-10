# Mobile QA checklist — DURAKHSHON CRM

Test widths: **360px** (small Android), **390px** (iPhone), **430px** (large phone),
**768px** (tablet), plus desktop. In Chrome: DevTools → device toolbar.

Verified with headless Chrome at 360px: **0px horizontal overflow** on Dashboard and
Payments; sticky modal footers and the attendance card layout render correctly.

## What the mobile build does

- **Sidebar** is a slide-in drawer on phones (80% width, max 20rem): opens with the
  menu button, closes on overlay tap / page navigation / X. Clears the status bar
  via `safe-area-inset-top`.
- **Header** clears the notch (`safe-area-inset-top`); language pill hidden on phones
  (it's in Settings) so bell / avatar / logout aren't cramped.
- **No horizontal page scroll** (`overflow-x: hidden` on body + main); wide tables
  scroll *inside their own card*, never the page.
- **Tables → cards** on phones via `ResponsiveTable`: Students, Teachers, Parents,
  Groups, Payments, Attendance, Exams, Grades, Users. Each row becomes a card with a
  bold title and label→value lines; actions in a footer row.
- **Modals**: capped to `100dvh`, sticky header, scrollable body, **sticky footer**
  (Save/Cancel) with `safe-area-inset-bottom` padding — buttons never hide behind the
  browser bar. Near-full-width on phones.
- **Forms**: single column, full-width inputs, ≥44px tall, 16px font on number/date
  inputs (stops iOS zoom-on-focus).
- **Filters/search**: full-width and stacked on phones, one row on desktop; Search
  button full-width on phones.
- **Attendance marking**: big Present/Absent/Late/Excused buttons (2-col grid on
  phones, ≥44px), a **Mark all present** shortcut, and a sticky **Save attendance**
  footer.
- **Dashboard**: stat cards 1 col (phone) → 2 (tablet) → 4 (desktop); charts inside
  `ResponsiveContainer`; recent lists contained within their cards.
- **PWA**: manifest + theme color + apple meta; installable to the home screen.

## Per-page checklist

- [ ] Login: logo + form fit, "keep me signed in" visible, no side scroll
- [ ] Dashboard: stat cards stack, charts fit, recent lists readable
- [ ] Students / Teachers / Parents / Groups: card list, Edit/Delete tappable
- [ ] GroupDetails: details + schedule readable; inner tables scroll in-card only
- [ ] Schedule: day cards readable
- [ ] Attendance: list as cards; Mark modal — big buttons, Mark-all-present, sticky Save
- [ ] Payments: cards; add/edit modal sticky footer
- [ ] Exams: cards; enter-grades modal sticky footer, score inputs usable
- [ ] Grades: cards; parent group-results selector works
- [ ] Reports: filters stack; data tables scroll inside card
- [ ] Users: cards; add/edit modal sticky footer; audit log scrolls in-card
- [ ] Notifications: list readable
- [ ] Settings: change password, My devices, Backups (director) usable
- [ ] No control hidden behind the bottom browser bar on any page
- [ ] No element causes the whole page to scroll sideways

## Manual test matrix

- Roles: director, admin, teacher, parent, student
- Browsers: iPhone Safari, Android Chrome
- Installed PWA (home-screen shortcut) — remove & re-add after each deploy to bust cache

## Known acceptable limitations

- Reports analytics tables and the audit log stay as horizontally-scrollable tables
  inside their card (dense, staff/desktop-oriented) rather than cards.
