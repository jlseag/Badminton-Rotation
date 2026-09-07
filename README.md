# Badminton Rotation & Points

A single-file, offline web app for running a casual-but-competitive 2v2 badminton session:
it builds the teams, tracks points, keeps playing time fair, rotates partners, and gets more
competitive as the session goes on.

## Running it

**Live:** https://jlseag.github.io/Badminton-Rotation/

Open it on your phone, then Share → **Add to Home Screen**. It installs as a standalone app
with its own icon, and a service worker caches everything on first load, so it keeps working
at a court with no signal.

**Local:** `index.html` also runs straight off the filesystem — no server, no build, no internet.

Deployed from `main` (root) via GitHub Pages. Push to `main` and the site updates; bump `V` in
`sw.js` when you change files so installed phones pick the new version up.

Everything is stored in that browser's `localStorage` on that device — the hosted page and a
local copy each keep their own separate session. Closing the tab, locking
the phone or losing signal will not lose the session. Use **Settings → Export session** to save a
JSON backup, and **Import session** to move a session to another device.

## How a session runs

1. **Players** — type everyone in from *strongest to weakest*. That order is their
   Initial Skill Rank and is what balances the first few rounds. Drag or use ↑ ↓ to reorder.
2. **Courts** — pick how many. Each court is 4 players; anyone left over rests that round.
3. **Start Session** — round 1 is generated. Courts is a *maximum*: the app runs as many
   courts as the people present can fill (4 each) and rests the remainder, so 6 players on
   2 courts simply plays 1 court with 2 resting. It adapts every round as people arrive or leave.
4. **Adjust if you want** — tap any two players to swap them (including a resting player),
   lock a pair or a whole court, or add a Custom Pairing. Nothing is recorded while you edit.
5. **Confirm Round** — teams become official.
6. **Enter results** — tap the winning team, tap the winning score. The losing score is
   `21 − winning score` (the total is configurable).
7. **Finish Round** — points, games played, rests, partner and opponent history all update,
   and the next round is suggested automatically.

## What the algorithm does

Every round it evaluates a large number of possible team combinations and picks the one with
the lowest total penalty, weighted roughly like this:

| Priority | Factor |
|---|---|
| Highest | Forced / locked pairings — always respected |
| Highest | Fair playing time — whoever has played most rests next, and nobody gets a second rest before everyone has had a first |
| Highest | Avoid repeat partners — repeats cost more the more often, and much more if they were recent |
| Medium | Team-strength balance — the penalty grows quadratically, so a blowout is never chosen just to dodge a repeat |
| Medium | In competitive mode, split the top players onto opposite sides of the net |
| Low | Opponent variety |
| Low | Social randomness |

**Player strength** starts as the Initial Skill Rank you entered and shifts toward real
performance (points per game, weighted toward recent games) as rounds are played:
roughly 70/30 during warm-up, 40/60 in the middle, 20/80 late. A player with few games is
always judged more by their entered rank. Someone who joins mid-session starts at 0 points and
0 games, gets priority for playing time, and is balanced by their entered rank until they have
some results.

**Warm-up vs competitive** — the first 4 rounds (configurable) favour variety and the entered
skill order. After that the leaderboard drives the matchmaking: strong players get paired with
weaker ones so team totals are even, and the evenly-matched teams are put against each other,
which naturally makes the top players face one another.

## Notes

- Every screen shows all players, including whoever is resting. Resting players never receive points.
- A game only counts as played once the round is finished.
- Past rounds can be edited from **History** — points, averages, rankings and win/loss recalculate
  from scratch, so a mistyped score never corrupts later rounds. **Undo last round** removes it entirely.
- The balance indicator (🟢 / 🟡 / 🔴) is an estimate, and a warning appears if a custom pairing
  creates a lopsided court — you can always proceed anyway.
- Settings covers courts, match total, warm-up length, the strictness of each matchmaking factor,
  the ranking method (total points / average / wins / win %), and an admin override for unusual scores.
