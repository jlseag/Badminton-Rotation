/* "Wait for other courts": does holding actually hold, and does the next
   draw then take the held courts with it? */
load('dev/harness.js');
var A = makeApp(); A.PREMIUM = true;
var T = ['adv','upp','int','beg'];

A.S = A.defState();
A.S.settings.courts = 3; A.S.settings.pairing = 'social'; A.S.settings.scoring = 'wins';
A.S.players = []; A.S.roster = []; A.savedPanel = {};
for(var i = 0; i < 24; i++){
  var t = T[i % 4];
  A.S.players.push({ id:'p'+i, name:t+i, tier:t, away:false, qg:0, lastPlayed:0 });
  A.S.roster.push({ name:t+i, tier:t });
}
A.sortByTier(); A.S.started = true;
A.S.courts = []; A.S.matches = []; A.S.recentQuads = {};
A.fillCourts();

function live(){ return (A.S.courts||[]).filter(function(c){return c}).length }
function ok(label, cond){ print((cond ? '  ok   ' : '  FAIL ') + label); return cond }
var pass = true;

print('3 courts, 24 players, all courts filled: ' + live());

// label before anything is held
pass &= ok('label on a lone court reads "Next teams"',
           A.drawLabel(0) === 'Next teams');
pass &= ok('wait button offered while others play', A.othersPlaying(0) === true);

// hold court 0
A.S.courts[0].winner = 'a';
A.holdMatch(0);
pass &= ok('court 0 is now empty', !A.S.courts[0]);
pass &= ok('court 0 marked held', !!(A.savedPanel[0] && A.savedPanel[0].held));
pass &= ok('no replacement drawn (2 courts live)', live() === 2);

// hold court 1 too
A.S.courts[1].winner = 'b';
A.holdMatch(1);
pass &= ok('two courts held, 1 live', live() === 1);

// the remaining court should now advertise all three
var lbl = A.drawLabel(2);
print('  label on the last court: "' + lbl + '"');
pass &= ok('label names all three courts',
           lbl === 'Generate teams for Courts 1, 2 & 3');

// finishing it should draw all three together
A.S.courts[2].winner = 'a';
A.finishMatch(2);
pass &= ok('all three courts refilled in one draw', live() === 3);
pass &= ok('no held courts left over',
           Object.keys(A.savedPanel).length === 0);

// per-court game number
var g = (A.S.matches||[]).filter(function(m){ return m.court === 1 }).length + 1;
pass &= ok('court 1 is on game 2', g === 2);

// the wait button hides when nothing else is playing
A.S.courts[0].winner='a'; A.holdMatch(0);
A.S.courts[1].winner='a'; A.holdMatch(1);
pass &= ok('wait button hidden on the last live court',
           A.othersPlaying(2) === false);

print(pass ? '\nALL PASS' : '\nFAILURES ABOVE');
