# Responsive, mobile and accessibility audit

Covers everything built for the transaction, category, limit and month features (Details page, popups, forms,
bottom menu) plus the shared styles they rely on. Standards used: WCAG 2.2 level AA, Apple and Google touch-target
guidance, and common iOS/Android behaviour.

## How it was checked

| Method | What it can tell us |
| --- | --- |
| CSS parsed with a real parser (`postcss`) | font sizes, touch-target sizes, breakpoints, units, motion, fixed widths |
| WCAG contrast formula on the design colours | text (4.5:1) and component edges / focus ring (3:1) |
| The real page code run in a simulated page (jsdom) against a fake API | behaviour of every control, markup, labels, headings |
| axe-core (the accessibility engine used by most audits) on 7 screens and popups | automated WCAG rules on the real rendered markup |
| Static checks of every page's HTML | language, title, zoom, landmarks, headings, image text |
| **A real Chrome session** (one launch, driven by Playwright, with touch emulation) against the running app and the demo account | real layout at 320, 375, 414, 768, 1024 and 1440 px; sideways scrolling; menu position and icons on every page and on every click; actual touch-target sizes; real colour contrast (axe with layout); keyboard focus; popups; text enlarged to 125% and 150%; a short landscape phone screen; third-party requests; console errors; the full add/edit/move/delete/limit flows with screenshots reviewed by eye |

**What this cannot tell us:** real phones (iOS Safari and Android Chrome behave differently from emulation), screen
readers, and browser text zoom beyond 150%. See "Still to verify by hand" below. The simulated-page checks run in
`npm test` (`tests/ui/`); the real-browser session was run by hand and is not part of `npm test`.

## Results

### Responsive layout
| Check | Result |
| --- | --- |
| Viewport meta, pinch-zoom allowed, on all 6 pages | Pass |
| No content forced wider than the smallest phone (WCAG 1.4.10 reflow) | **Fixed.** The Details header (month switcher + title + Add/Edit) was about 390 px wide and pushed past a 375 px screen. It now wraps, and the buttons share a row on phones. The Edit summary category rows (checkbox, name, limit, delete) left the name about 57 px wide on a 320 px phone; they now stack the limit under the name below 560 px. Rows in the category popup wrap instead of overflowing. |
| No fixed width above 320 px anywhere in the CSS | Pass (tested) |
| Popup fits the screen (`width: min(440px, 100vw - 32px)`) | Pass |
| Heights follow the visible screen (address bar, on-screen keyboard) | **Fixed.** Popups, the Edit form and the page now use `dvh` (with `vh` fallback). |
| Bottom menu stays on screen at every width | **Fixed** earlier (it sat at the end of the page at 980 px and wider). Now tested so it cannot regress. |
| Safe-area padding for notched phones | Pass (bottom menu) |

### Touch and mobile
| Check | Before | After |
| --- | --- | --- |
| Fields 16 px on touch screens (below that, iPhones zoom the page when a field is tapped) | 12 field styles at 10-13 px | **Fixed.** One rule makes every field 16 px on touch screens |
| Targets 44 px on touch screens (month arrows 34, close 31, delete 29, Edit/Delete about 20, Add/Edit 34) | below 44 | **Fixed** with a touch-screen rule |
| Targets at least 24 px with a mouse (WCAG 2.5.8) | Edit/Delete about 20 px, checkboxes 16 px | **Fixed** (28 px and 24 px) |
| Nothing relies on hover | Pass (the CSS has no `:hover` rules) |
| Search/number/date fields bring up the right keyboard | **Fixed.** `inputmode`, `enterkeyhint`, `autocapitalize` added; amount and date use native types |
| iOS text inflation in landscape | **Fixed** (`text-size-adjust`) |

### Text and readability
| Check | Result |
| --- | --- |
| Smallest text | **Fixed everywhere.** Was 9-11 px in 52 older styles plus the parts built here. Now nothing is below 11 px, and only short labels and captions (the uppercase kickers, chart centre, timestamps, menu labels) are below 12 px; all real content text is at least 12 px. Enforced by a test. |
| Text units | **Fixed everywhere.** All 156 text sizes were fixed pixels, so the browser's "larger text" setting was ignored. They are now `rem`: identical at the default size (1rem = 16 px), but they follow the user's setting. Phone form fields use `max(1rem, 16px)` so they can grow but never drop under the 16 px that stops iPhones zooming. |
| Merchant names cut off with "..." | **Fixed.** They wrap (two lines) so the full name can be read. |

### Colour and contrast
| Pair | Before | After |
| --- | --- | --- |
| Grey "muted" text on the page background (used for most small text) | 4.24:1 (fail) | 4.98:1 |
| Muted text on the soft-green panel | 3.87:1 (fail) | 4.54:1 |
| Inactive menu labels (9 px) | 3.60:1 (fail) | 5.40:1, now 11 px |
| Field and control edges | 1.29:1 (fail, needs 3:1 to identify a field) | 3.36:1 |
| Keyboard focus ring | 2.21:1 (fail) | 6.44:1 and 2-3 px solid |
| Body text, buttons, primary button, error text | 5.5-15:1 | unchanged (pass) |

Not text and not required for understanding: the category colour dots (1.5-3:1) are decorative, because every one
sits beside the category name. Over-budget limits are now also said in words, not only shown in red. A dark theme is deliberately not
included: it is optional for WCAG AA, and a second palette would change the look of the app, which is the opposite of
what was asked. The page declares `color-scheme: light`, so browsers do not darken it unpredictably.

### Keyboard, focus and screen readers
| Check | Result |
| --- | --- |
| axe-core, 7 states (page, category popup, limit form, Add form, Edit summary, with a new row, filtered list) | **0 violations** |
| Every control has an accessible name; repeated labels | **Fixed.** Every "Category name" field was labelled identically; each now says which category. |
| Popups have a name | **Fixed.** They were announced as just "dialog"; each is now named after its heading. |
| Heading structure | **Fixed.** Day labels in the transaction list are real `h3` headings. |
| Error messages announced | **Fixed.** Errors use `role="alert"`; the limit hint is separate from its error and tied to the field. |
| Keyboard focus hidden behind the fixed menu (WCAG 2.4.11) | **Fixed** (`scroll-padding-bottom`) |
| Focus indicator | **Fixed** (see contrast) and drawn inside fields in scrolling forms so it cannot be clipped |
| Hostile text (a merchant named `<img onerror=...>`) | Pass: shown as plain text (tested) |
| One `main`, one `h1`, named `nav`, image alt text, `lang`, title on every page | Pass (tested) |
| "Skip to content" link | Not present. Landmarks cover it, but a link would help keyboard users. |

### Mobile data and speed
| Check | Result |
| --- | --- |
| Logo image loaded in every page header | **Fixed.** 1,353 KB (1254x1254, shown at 43 px) is now 45 KB. |
| Page data | Loads from the database in about 90 ms; the browser also draws the last answer instantly |
| Motion | `prefers-reduced-motion` is respected (existing) |
| Messages that disappear after 3.4 s | Open (minor): low-vision users may miss a toast. Errors stay on screen. |
| Icons came from a third-party CDN (unpkg): a 358 KB script, drawn after the page loaded | **Fixed.** Icons ship with the app and are drawn into each page's HTML at build time, so the menu icons are there from the first paint, even offline. A test fails if a page references a third-party script or an icon is missing. |

### Found by the real-browser session (all fixed, re-run: 136 checks passed, 0 failed, 0 console errors)
- The category popup showed "of $275 monthly limit" and "Change limit" with no space between them.
- Edit summary on a phone showed two unlabeled stacked boxes per category; the limit box now has a `$` and the caption "Monthly limit".
- Chat timestamps were 2.0:1 on the green bubble and 3.2:1 on the white one, and the date label was 3.0:1; all are now at least 4.5:1.
- The chart legend and Top categories buttons were 14-16 px tall (WCAG asks for 24); now 28 px.
- Links used the browser's default focus ring; they now use the same solid green ring as everything else.
- At 150% text size the doughnut's centre text spilled over its ring, and the logo ran into the profile button. The centre now scales with the ring, and the logo wraps.
- Every page asked for a missing `/favicon.ico` (a 404 in the console); pages now have a tab icon.
- Third-party requests: none for icons or scripts. Only Google Fonts (DM Sans, Manrope) remain, a design choice not changed here.
- One small leftover: on the narrowest phones (320 px) the doughnut's two captions are about 10 px, because the ring itself is smaller there.

### Bug found along the way
- Home: the budget progress bar had an `aria-label` on a plain `div` (an axe "serious" violation). Fixed with `role="img"`.
- Category popup: the amount lost its bold style once Edit/Delete were added. Fixed.

## Older screens (Home, Chat, Friends, Settings, charts)

These were brought up to the same text-size and unit standard in a second pass, with the same look at the default
text size. The few increases (9 and 10 px captions to 11 px, 11 px text to 12 px) are the only visible change. One
older bug was fixed because it blocked keyboard users: the chat box and the monthly-budget field removed their own
focus outline and showed nothing in its place, so you could not see where you were. The box around each one now shows
the focus ring.

Still open: the sign-in and chat pages use `100vh` for their height (the address bar on phones can cut them off),
there is no dark theme (by choice, see above), and a few labels remain truncated with "..." by older design (for
example goal names on Home on a phone).

## Still to verify by hand (what an emulated browser cannot confirm)

1. A real iPhone and a real Android phone: tap each field (no page zoom on iPhone), check the buttons are easy to hit,
   and check the menu bar and the on-screen keyboard do not hide the field you are typing in.
2. Browser text size at "Very large" and page zoom at 200% and 400% (Chrome emulation above covered 125% and 150%).
3. A screen reader: VoiceOver (iPhone), TalkBack (Android) or NVDA (Windows). Popups should be announced by name,
   errors read out, and each list row's category menu should say which merchant it is for.
4. High-contrast / forced-colours mode (Windows), if you care about it.
