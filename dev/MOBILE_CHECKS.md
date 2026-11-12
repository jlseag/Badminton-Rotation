# Mobile and tablet checks

Mabyo is used on a phone, at the side of a court, by a host with one hand
free. A layout bug there is not cosmetic — it stops the night. The laptop
view is the one that gets looked at while building, so it is the one least
likely to be wrong.

**Every UI change runs this before it is pushed.** No exceptions for "it is
only a colour".

## Running it

1. Serve the app locally and open it in a browser you can resize.
2. Load `dev/mobile-audit.js` and `dev/mobile-scenes.js` into the page.
3. At each width below, call `__runAudit()`.

```js
for (const f of ['mobile-audit.js','mobile-scenes.js'])
  (0, eval)(await (await fetch('/dev/' + f)).text());
__runAudit();          // walks every scene, returns a report per scene
```

Widths, all of them, every time:

| Width | Stands for |
|-------|-----------|
| 320 | smallest phone still in use |
| 390 | ordinary iPhone |
| 430 | large iPhone |
| 768 | tablet, portrait |
| 1024 | tablet, landscape |

`mobile-scenes.js` walks all 17 screens a host reaches — every tab, both
sheets, the paste flow, a court mid-result, a long roster, players away,
the New players tier. A screen that is not in that list is not covered, so
**a new screen means a new scene**.

Ship only on an empty report at every width.

## What it checks, and why each one is here

**`ios-zoom`** — a form control whose text is under 16px. iOS Safari zooms
the page in when it focuses one and does not zoom back out. This is how the
paste box shipped at 13px in v65: the host tapped it to paste her group
message and had to pinch the page back by hand. There is now a CSS floor
(`input,textarea,select{font-size:max(16px,1em)}`) and this check guards it.

**`page-h-scroll`** and **`overflow-right` / `overflow-left`** — anything
that makes the page wider than the screen. Sideways scroll on a phone feels
broken even when nothing is actually lost.

**`tap-target`** — a control under about 44px in either direction. Measured
as what a thumb can land on, not the painted box: a `::after` that widens
the touch area counts, which is how Away and the small buttons pass without
being made visually bigger.

**`text-clipped`** — text cut off inside its own box where no ellipsis was
asked for. Deliberate truncation (`text-overflow:ellipsis`) is ignored.

## Things the audit cannot see

Run these by hand when the change touches them.

- **Real iOS Safari.** The audit enforces the 16px rule; it cannot prove
  Safari behaves. Checking on a real iPhone or in the iOS Simulator needs a
  full Xcode install.
- **The on-screen keyboard.** It covers the bottom third. Anything the host
  types into — the paste box, a score, a name — must still show its own
  buttons with the keyboard up.
- **Drag and drop.** Re-ranking players is a touch gesture. It does not
  survive a mouse-only test.
- **Dark mode and large text.** Both are common on phones.
