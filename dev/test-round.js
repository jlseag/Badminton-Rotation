/* Does drawing several finished courts TOGETHER beat drawing each one the
   moment it finishes?
   Reynaldo runs six courts and says yes. The v65 note measured it at three
   courts (6.4 -> 9.8 opponents) before the pause was removed. This asks the
   same question at his scale, against the real matchmaker. */
load('dev/harness.js');
var A = makeApp();
A.PREMIUM = true;
var TIERS = ['adv','upp','int','beg','nwb'];

function seed(counts, courts, mode){
  A.S = A.defState();
  A.S.settings.courts = courts;
  A.S.settings.pairing = mode;
  A.S.settings.scoring = 'wins';
  A.S.players = []; A.S.roster = []; A.savedPanel = {};
  var i = 0;
  TIERS.forEach(function(t){
    for(var k = 0; k < (counts[t]||0); k++, i++){
      A.S.players.push({ id:'p'+i, name:t+(k+1), tier:t, away:false, qg:0, lastPlayed:0 });
      A.S.roster.push({ name:t+(k+1), tier:t });
    }
  });
  A.sortByTier();
  A.S.started = true; A.S.courts = []; A.S.matches = []; A.S.recentQuads = {};
  A.fillCourts();
}

/* finishMatch, minus the draw -- so the test decides when it fires. */
function finishNoDraw(i, r){
  var c = A.S.courts[i]; if(!c) return null;
  c.winner = (r % 2) ? 'b' : 'a';
  var played = c.a.concat(c.b);
  A.S.matches.push({ at:Date.now(), court:i+1, a:c.a.slice(), b:c.b.slice(),
                     winner:c.winner, winScore:null, loseScore:null });
  var n = A.S.matches.length;
  played.forEach(function(id){
    var p = A.P(id); if(p){ p.qg = (p.qg||0)+1; p.lastPlayed = n; } });
  A.S.courts[i] = null;
  A.savedPanel[i] = { idx:n-1, played:played, held:false };
  return i;
}

// deterministic shuffle so both modes see the same finish order
function rng(seed){ return function(){ seed = (seed*1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff; }; }

function run(counts, courts, rounds, mode, joint, seed){
  seedRoster(counts, courts, mode);
  var rand = rng(seed);
  var met = {}, part = {};
  A.S.players.forEach(function(p){ met[p.id] = {}; part[p.id] = {}; });
  var gaps = [], bal = [], str = null;

  function record(){
    (A.S.courts||[]).forEach(function(c){
      if(!c) return;
      var four = c.a.concat(c.b);
      gaps.push(A.tierGap(four));
      c.a.forEach(function(x){ c.b.forEach(function(y){
        met[x][y] = 1; met[y][x] = 1; }); });
      part[c.a[0]][c.a[1]] = 1; part[c.a[1]][c.a[0]] = 1;
      part[c.b[0]][c.b[1]] = 1; part[c.b[1]][c.b[0]] = 1;
    });
  }
  record();

  for(var r = 0; r < rounds; r++){
    // three of the six courts finish this tick, chosen the same way for both modes
    var live = [];
    for(var i = 0; i < courts; i++) if(A.S.courts[i]) live.push(i);
    if(live.length < 3) break;
    var pick = [];
    while(pick.length < 3 && live.length){
      pick.push(live.splice(Math.floor(rand()*live.length), 1)[0]);
    }
    if(joint){
      pick.forEach(function(i){ finishNoDraw(i, r) });
      A.nextTeams(pick[pick.length-1]);          // one draw, all three courts
    } else {
      pick.forEach(function(i){ finishNoDraw(i, r); A.nextTeams(i); });
    }
    record();
  }
  var ps = A.S.players;
  var avgP = ps.reduce(function(t,p){ return t + Object.keys(part[p.id]).length }, 0)/ps.length;
  var avgM = ps.reduce(function(t,p){ return t + Object.keys(met[p.id]).length }, 0)/ps.length;
  var worstM = Math.min.apply(null, ps.map(function(p){ return Object.keys(met[p.id]).length }));
  var gs = ps.map(function(p){ return p.qg });
  return { avgP:avgP, avgM:avgM, worstM:worstM,
    wide: gaps.filter(function(g){ return g > 1 }).length / gaps.length,
    spread: Math.max.apply(null,gs) - Math.min.apply(null,gs) };
}
function seedRoster(c, courts, mode){ seed(c, courts, mode) }

var ROSTER = { adv:8, upp:9, int:11, beg:8, nwb:4 };     // 40 players
var COURTS = 6, ROUNDS = 40, SEEDS = [3,11,29,47,61];

print('Reynaldo\'s scale: 40 players, ' + COURTS + ' courts, ' + ROUNDS +
      ' ticks, 3 courts finishing per tick, averaged over ' + SEEDS.length + ' seeds\n');
print('mode         draw           partners  opponents  worst-off  >1 tier  spread');
['level','mix','social'].forEach(function(m){
  [false,true].forEach(function(joint){
    var a=0,b=0,w=0,g=0,s=0;
    SEEDS.forEach(function(sd){
      var R = run(ROSTER, COURTS, ROUNDS, m, joint, sd);
      a+=R.avgP; b+=R.avgM; w+=R.worstM; g+=R.wide; s+=R.spread;
    });
    var n = SEEDS.length;
    print((joint?'':m).padEnd(13) + (joint?'together':'as finished').padEnd(15) +
      (a/n).toFixed(1).padStart(8) + (b/n).toFixed(1).padStart(11) +
      (w/n).toFixed(1).padStart(11) + ((g/n)*100).toFixed(0).padStart(8) + '%' +
      (s/n).toFixed(1).padStart(8));
  });
});
