# Mobile QA checklist — DURAKHSHON CRM

Test on real widths: **360px, 390px, 430px** (phones) and **768px** (tablet).
In desktop Chrome: DevTools → device toolbar → set width.

## What was done for mobile

- **Sidebar** is a slide-in drawer on phones: the menu button opens it, an overlay
  closes it on tap outside, and it closes automatically after navigating.
- **No horizontal page scroll** — `overflow-x: hidden` on body and main content.
- **Tables become cards** on phones (`ResponsiveTable`): each row is a card with the
  name as the title and the rest as label → value lines; actions sit in a footer row.
  Desktop keeps normal tables.
- **Safe area**: `viewport-fit=cover` + `env(safe-area-inset-bottom)` padding so
  content and buttons clear the phone's bottom browser bar.
- **Modals**: capped at `100dvh`, header fixed, body scrolls — Save/Cancel stay
  reachable; inputs/buttons are ≥44px tall; number/date fields use 16px text so iOS
  doesn't zoom on focus.
- **Dashboard** cards stack to one column; charts are width-constrained.

## Checklist

- [ ] Login page: logo and form fit, "keep me signed in" visible, no side scroll
- [ ] Login works on the phone; stays logged in after closing/reopening the browser
- [ ] Sidebar: opens with menu button, closes on overlay tap, closes after navigating
- [ ] Dashboard readable; stat cards stack; charts don't overflow
- [ ] Students: cards show name / phone / parent / groups / status; Edit & Delete work
- [ ] Teachers: cards usable; actions work
- [ ] Parents: cards usable; children listed
- [ ] Groups: cards show teacher / students / schedule / price; open group works
- [ ] Attendance: records show as cards; "Mark attendance" modal fits and scrolls
- [ ] Payments: cards show amount / status / period; add/edit modal fits
- [ ] Exams: cards usable; "enter grades" modal fits and scrolls; buttons reachable
- [ ] Grades: cards readable; parent group-results selector works
- [ ] Reports (director/admin): tables scroll horizontally inside their card only
- [ ] Group results / gradebook readable on a phone
- [ ] Settings: change password, My devices, Backups (director) all usable
- [ ] No control is hidden behind the bottom browser bar
- [ ] No element overflows the screen or causes the whole page to scroll sideways
- [ ] Language switch (EN / RU / TG) works and layout still fits
