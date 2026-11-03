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

Deployed from `main` (root) via GitHub Pages. Push to `main` and the site updates.

The installed app keeps itself current: on every launch it checks for a new service worker
(registered with `updateViaCache: 'none'`, and re-checked hourly while open), and reloads once
the new one takes over. Page requests use `cache: 'reload'` so "network first" really reaches the
network — GitHub Pages serves `max-age=600`, which would otherwise let a plain fetch hand back a
stale copy. Bump `V` in `sw.js` whenever you change a file so the swap is triggered.

Everything is stored in that browser's `localStorage` on that device — the hosted page and a
local copy each keep their own separate session. Nothing is uploaded, and there is no import
or export: the app neither reads nor writes files. Closing the tab, locking
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
   or add a Custom Pairing. Nothing is recorded while you edit.
   - **Force pair** makes two players permanent partners. They go on the same team every round
     until you remove them, they sit out together rather than being split up, and neither can be
     swapped away. Remove them from the Forced pairs list.
5. **Confirm Round** — teams become official.
6. **Enter results** — tap the winning team, then tap one number. Which number depends on the
   scoring mode in Settings:
   - **First to** (default) — play until a team reaches the target, so you enter the
     **loser's** score. 17 means 21–17.
   - **Combined score** — both scores add up to the total, so you enter the **winner's**
     score and the loser gets the remainder. 14 means 14–7 out of 21.

   Either mode takes any total: presets for 15 / 21 / 25 / 30, or set your own. Each finished
   round stores both scores, so changing mode later never rewrites what you already played.

**Match style** in Settings decides who meets whom:

- **Same level** (default) — courts are cut straight out of the skill order, so Advanced play Advanced and
  so on. When a group cannot fill a court of four it borrows the nearest players from the next
  group down. Expect closer-matched *opponents* but less even scorelines and far fewer different
  partners: a group of four only has six possible pairings.
- **Social mix** — everyone mixes with everyone, and teams are built to be even across skill
  levels, so a stronger player gets a weaker partner.

Players are grouped into **Advanced / Upper Int. / Intermediate / Beginner** — Advanced is strongest,
and it is entirely up to you how many go in each. Press and hold a name to drag it between groups
or within one; the number beside it is their overall rank, which is what the matchmaker uses.
Tap a name to rename them, move them, or take them out of the session.

Each group has a colour — indigo, blue, cyan, amber — running strongest to weakest. It marks the
stripe and rank badge in the list, and a dot beside every name on the Game screen, so you can see
at a glance which groups are on a court and when Same level had to borrow. The ramp deliberately
avoids green, red and the warning amber, which already mean good / danger / uneven elsewhere, and
it has room for a fifth group above Advanced.

The Players tab shows names and skill order only. Current strength, the partner matrix and the
opponent matrix are still computed every round — they drive the matchmaking — they are simply
not displayed.
7. **Finish Round** — points, games played, rests, partner and opponent history all update,
   and the next round is suggested automatically.
8. **End game** — stop whenever you like and get the final score: champion, podium and the full
   table. Nothing is lost; **Keep playing** picks the session back up exactly where it was.

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

Your entered skill order always keeps some weight — 70% during the first four rounds, easing to
20% once there is plenty of real data, but never zero.

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

## Screens

**Game** · **Leaderboard** · **Players** · **History** · **Settings**

The Leaderboard is the full record: points, games, average, wins, losses and win %, followed by
session highlights — highest and lowest points, best and worst win rate, most and fewest wins.
(There is no separate Stats tab; end-of-session extras like the closest game live on the
End game screen.)

## Notes

- Every screen shows all players, including whoever is resting. Resting players never receive points.
- A game only counts as played once the round is finished.
- Past rounds can be edited from **History** — points, averages, rankings and win/loss recalculate
  from scratch, so a mistyped score never corrupts later rounds. **Undo last round** removes it entirely.
- The balance indicator (🟢 / 🟡 / 🔴) is an estimate, and a warning appears if a custom pairing
  creates a lopsided court — you can always proceed anyway.
- Settings covers courts, match total, warm-up length, the strictness of each matchmaking factor,
  the ranking method (total points / average / wins / win %), and an admin override for unusual scores.
