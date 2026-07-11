# Mobile QA checklist — DURAKHSHON CRM

Test widths: **360px** (small Android), **390px** (iPhone), **430px** (large phone),
**768px** (tablet), plus desktop. In Chrome: DevTools → device toolbar. Breakpoint used
throughout this pass: **`lg` (1024px)** — below it you get the app-like mobile shell
(bottom nav, cream dashboard, big cards); at `lg` and above you get the original
desktop admin shell (dark sidebar, dense tables). This is the same breakpoint the
sidebar itself already used, so drawer/hamburger and bottom-nav switch over together.

Verified with headless Chrome at 390×844 (iPhone UA + touch emulation): **0px
horizontal overflow** on Dashboard, Students, Payments and Reports; screenshotted the
mobile dashboard, a card list, the Add Student modal and the Attendance-marking modal.

## What's new in this pass — a real "mobile app" shell

- **Bottom navigation** (`MobileBottomNav`, `<lg` only): 4 role-specific tabs + "Ещё",
  fixed to the bottom, `safe-area-inset-bottom`-aware, active tab highlighted in blue
  with a filled icon background. "Ещё" opens the existing full drawer (Reports, Users,
  Notifications, Settings, etc. — everything not pinned to a tab).
  - Director / Admin: Главная, Студенты, Оплаты, Посещаемость
  - Teacher: Главная, Группы, Посещаемость, Экзамены
  - Parent: Главная, Оценки, Посещаемость, Оплаты
  - Student: Главная, Расписание, Оценки, Посещаемость
- **Mobile dashboard hero** (`MobileDashboardHero`, `<lg` only): time-of-day greeting
  ("Доброе утро/день/вечер/ночи, {{имя}}!"), full date with weekday, one big primary
  action button per role (Add Student / Mark Attendance / View Results / My Schedule),
  and an alert card (overdue payments, absent-today, classes-today) that only renders
  rows with a non-zero count.
- **Warm mobile theme, `<lg` only**: cream background (`#F5EFE3`) behind the content
  area (desktop keeps the original slate-100); every `Card` gets bigger rounding
  (`rounded-2xl`) and a stronger shadow on phones, reverting to the original
  `rounded-xl`/`shadow-sm` at `lg`+ — desktop is visually unchanged.
- **Bigger, real "cards" for lists**: `ResponsiveTable`'s mobile branch (Students,
  Teachers, Parents, Groups, Payments, Attendance, Exams, Grades, Users) now renders
  each row as its own spaced, shadowed `MobileCardRow` instead of a divided list —
  matches the reference app-like design instead of looking like a squeezed table.
  The same `MobileCardRow` primitive is reused by the Dashboard's recent-lists,
  Reports' four tabs, and the Users audit log (see below) so every list in the app
  now shares one visual language on phones.
- **Dashboard recent-lists are cards, not tables, on phones**: Recent Students, Recent
  Payments, Today's Classes, Upcoming Payments (staff) and My Groups, Today's Lessons,
  Recent Grades (teacher) all render as `MobileCardRow` lists below `lg`; the original
  `TableShell` still renders unchanged at `lg`+.
- **Stat grids are 2 columns on phones**: the top stats (Students/Teachers/Groups/Paid/
  Unpaid) and the today's-attendance trio now use `grid-cols-2` from 0px up, going to
  `sm:grid-cols-3` / `xl:grid-cols-4` on larger screens — no more single stacked column
  on a phone. Paid and Unpaid are now separate stat cards (previously one combined
  "x / y" card).
- **Reports (all 4 tabs) and the Users audit log are now cards on phones**: previously
  documented as an accepted limitation (dense tables inside a scrollable card) — this
  pass converts Attendance/Payments/Progress/Workload report rows and the audit log
  rows to `MobileCardRow` lists below `lg`, keeping the original table at `lg`+ for
  staff who want the dense view on a larger screen.
- **Sidebar** is still a slide-in drawer below `lg` (80% width, max 20rem): opens via
  the header's hamburger *or* the bottom nav's "Ещё" button; closes on overlay tap /
  navigation / X. Clears the status bar via `safe-area-inset-top`.
- **Header** clears the notch (`safe-area-inset-top`); language pill hidden on phones
  (it's in Settings).
- **No horizontal page scroll** (`overflow-x: hidden` on body + main); wide tables that
  remain (desktop views at `lg`+) scroll *inside their own card*, never the page.
- **Modals**: unchanged from the previous pass — capped to `100dvh`, sticky header,
  scrollable body, sticky footer (Save/Cancel) with `safe-area-inset-bottom` padding.
  Verified they still render correctly on top of the new cream dashboard.
- **Forms**: single column, full-width inputs, ≥44px tall, 16px font on number/date
  inputs (stops iOS zoom-on-focus).
- **Filters/search**: full-width and stacked on phones, one row on desktop.
- **Attendance marking**: big Present/Absent/Late/Excused buttons, **Mark all present**
  shortcut, sticky **Save attendance** footer (unchanged from the previous pass).
- **PWA**: manifest (name, short_name, standalone display, theme/background color,
  192/512/512-maskable icons) + Apple meta tags; installable to the home screen.

## Per-page checklist

- [ ] Login: logo + form fit, "keep me signed in" visible, no side scroll
- [ ] Dashboard: cream hero + big action button + alert card render per role; stat
      cards 2-col; recent lists are cards, not tables; charts fit; bottom nav present
- [ ] Students / Teachers / Parents / Groups: card list, Edit/Delete tappable
- [ ] GroupDetails: details + schedule readable; inner tables scroll in-card only
- [ ] Schedule: day cards readable
- [ ] Attendance: list as cards; Mark modal — big buttons, Mark-all-present, sticky Save
- [ ] Payments: cards; add/edit modal sticky footer
- [ ] Exams: cards; enter-grades modal sticky footer, score inputs usable
- [ ] Grades: cards; parent group-results selector works
- [ ] Reports: filters stack; all 4 tabs render as cards below `lg`
- [ ] Users: cards; add/edit modal sticky footer; audit log is cards below `lg`
- [ ] Notifications: list readable
- [ ] Settings: change password, My devices, Backups (director) usable
- [ ] Bottom nav shows the correct 4 tabs per role and highlights the active one
- [ ] "Ещё" opens the drawer with the remaining nav items
- [ ] No control hidden behind the bottom nav or the phone's browser bar
- [ ] No element causes the whole page to scroll sideways

## Manual test matrix

- Roles: director, admin, teacher, parent, student
- Browsers: iPhone Safari, Android Chrome
- Installed PWA (home-screen shortcut) — remove & re-add after each deploy to bust cache

## Known acceptable limitations

- Between 640px and 1024px (large phone landscape / tablet portrait) the mobile app
  shell (cream background, bottom nav, big cards) is active, but `ResponsiveTable`
  itself still switches to the dense desktop table at its own `sm` (640px) breakpoint
  — carried over unchanged from the previous pass so as not to touch the already-tuned
  filter-stacking behavior on 9+ pages. In practice this reads as "tablets get roomier
  tables inside the app-like shell," not a broken layout, and it matches the existing
  convention rather than introducing a new one.
- GroupDetails' schedule/attendance/exam sub-tables were left as in-card-scrollable
  tables rather than full mobile cards (secondary, lower-traffic view).
