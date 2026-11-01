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

**What this cannot tell us:** the simulated page has no layout engine, so actual wrapping, overlap and scrolling at
320 / 375 / 768 px were reasoned from the CSS, not seen. Screen readers and real touch behaviour were not tested.
See "Still to verify by hand" below. The automated checks run in `npm test` (`tests/ui/`).

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
| Text size in what was built here | **Fixed.** Was 9-11 px in many places; now at least 12 px (11 px only for the uppercase day labels and the menu labels). Enforced by a test. |
| Merchant names cut off with "..." | **Fixed.** They wrap (two lines) so the full name can be read. |
| Text declared in px, so the browser's default-size preference is ignored | **Open.** All 126 sizes in the app use px. Page zoom works; "larger text" settings do not. Converting to rem is a wider change. |

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
sits beside the category name. Over-budget limits are now also said in words, not only shown in red. Dark mode and
forced-colours mode are not supported (the page declares `color-scheme: light`).

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
| Icons come from a third-party CDN (unpkg) | Open: offline, icons are missing, but every control still has a text name |

### Bug found along the way
- Home: the budget progress bar had an `aria-label` on a plain `div` (an axe "serious" violation). Fixed with `role="img"`.
- Category popup: the amount lost its bold style once Edit/Delete were added. Fixed.

## Not changed (older code, other pages)

52 text styles under 12 px remain outside the parts built here (6 at 9 px, 24 at 10 px, 22 at 11 px): Settings 12,
Details chart/legend/goal cards 11, global 10, Home 8, Friends 6, Chat 5. The worst are chat timestamps and dates
at 9 px. A few pages also use `100vh` (sign-in, chat). These were not part of the transaction work, so they were
reported rather than redesigned. The global fixes above (16 px fields on phones, readable muted grey, solid focus
ring) already improve them.

One older bug was fixed because it blocked keyboard users: the chat box and the monthly-budget field removed their
own focus outline and showed nothing in its place, so you could not see where you were. The box around each one
now shows the focus ring.

## Still to verify by hand (needs a real screen)

1. Open Details at 320, 375, 414, 768, 1024 and 1440 px wide (browser developer tools device mode is enough):
   no sideways scrolling; the header, month switcher, list and popups stay inside the screen.
2. On a real iPhone and Android phone: tap each field (no page zoom on iPhone), check the buttons are easy to hit,
   check the menu bar and the on-screen keyboard do not hide the field you are typing in.
3. Zoom the page to 200% and 400%: nothing is cut off.
4. Tab through Details with only the keyboard: the focus ring is always visible, the order makes sense, Escape
   closes popups, and focus returns to the button that opened them.
5. Turn on VoiceOver (iPhone), TalkBack (Android) or NVDA (Windows): popups are announced by name, errors are read
   out, each list row's category menu says which merchant it is for.
6. Landscape orientation on a phone: popups scroll and the menu does not cover the content you need.
