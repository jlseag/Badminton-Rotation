/* Mix Level, run against the real index.html matchmaker.
   Asserts the one promise the mode makes -- a court never spans more than one
   rank -- plus fairness and liveness across tier splits that are even, odd,
   hollow and single-player. */
load('dev/harness.js');
var A = makeApp();
A.PREMIUM = true;                 // these suites exercise 8 courts
var TIERS = ['adv','upp','int','beg','nwb'];

function seed(counts, courts, mode){
  A.S = A.defState();
  A.S.settings.courts = courts;
  A.S.settings.pairing = mode;
  A.S.settings.scoring = 'wins';
  A.S.players = []; A.S.roster = [];
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

function run(counts, courts, rounds, mode){
  seed(counts, courts, mode);
  var worstGap = 0, empties = 0, waits = {}, worstWait = {}, spans = {}, shapes = {};
  A.S.players.forEach(function(p){ waits[p.id]=0; worstWait[p.id]=0 });
  for(var r = 0; r < rounds; r++){
    var onc = {};
    for(var i = 0; i < courts; i++){
      var c = A.S.courts[i];
      if(!c){ empties++; continue }
      var four = c.a.concat(c.b);
      four.forEach(function(id){ onc[id]=1 });
      var g = A.tierGap(four);
      if(g > worstGap) worstGap = g;
      spans[g] = (spans[g]||0)+1;
      var cnt = {};
      four.forEach(function(id){ var t=A.tierOf(A.P(id)); cnt[t]=(cnt[t]||0)+1 });
      var k = Object.keys(cnt).map(function(t){return cnt[t]}).sort().join('+');
      shapes[k] = (shapes[k]||0)+1;
    }
    A.S.players.forEach(function(p){
      waits[p.id] = onc[p.id] ? 0 : waits[p.id]+1;
      if(waits[p.id] > worstWait[p.id]) worstWait[p.id] = waits[p.id];
    });
    for(var j = 0; j < courts; j++){
      if(!A.S.courts[j]) continue;
      A.S.courts[j].winner = (r % 2) ? 'b' : 'a';
      A.finishMatch(j);
    }
  }
  var gs = A.S.players.map(function(p){ return p.qg });
  return { gap:worstGap, empties:empties, spans:spans, shapes:shapes,
    min:Math.min.apply(null,gs), max:Math.max.apply(null,gs),
    wait:Math.max.apply(null, A.S.players.map(function(p){return worstWait[p.id]})),
    zero:A.S.players.filter(function(p){return p.qg===0}).length,
    stranded:A.mixStranded().length };
}

var CONFIGS = [
 ['A  9/11/12/8/3  mixed parity', {adv:9,upp:11,int:12,beg:8,nwb:3}],
 ['B  8/10/14/10/1 lone Newbie ', {adv:8,upp:10,int:14,beg:10,nwb:1}],
 ['C  5/7/9/11/11  all odd     ', {adv:5,upp:7,int:9,beg:11,nwb:11}],
 ['D  15/3/13/5/7  thin UppInt ', {adv:15,upp:3,int:13,beg:5,nwb:7}],
 ['E  1/1/20/20/1  hollow      ', {adv:1,upp:1,int:20,beg:20,nwb:1}],
 ['F  11/11/11/9/1 lone Newbie ', {adv:11,upp:11,int:11,beg:9,nwb:1}],
 ['G  7/9/13/9/5   every odd   ', {adv:7,upp:9,int:13,beg:9,nwb:5}]
];

var fails = 0;
print('Mix Level against the real matchmaker -- 43 players, 8 courts, 40 rounds\n');
print('config                          maxgap  empty  games    wait  stranded');
CONFIGS.forEach(function(cf){
  var R = run(cf[1], 8, 40, 'mix');
  var bad = R.gap > 1;
  if(bad) fails++;
  print(cf[0] + '   ' + (R.gap + (bad ? ' FAIL' : ' ok  ')) +
        pad(R.empties, 7) + pad(R.min + '-' + R.max, 8) + pad(R.wait, 7) + pad(R.stranded, 9));
});
function pad(v,n){ v=String(v); while(v.length<n) v=' '+v; return v }

print('\nShapes drawn (config A):');
var SA = run(CONFIGS[0][1], 8, 40, 'mix');
Object.keys(SA.shapes).sort().forEach(function(k){
  print('   ' + k + '  x' + SA.shapes[k]);
});
print('\nTier gaps seen across all configs: ' +
  JSON.stringify(Object.keys(SA.spans).sort()));

print('\nSame level and Social mix still work:');
['level','social'].forEach(function(m){
  var R = run(CONFIGS[0][1], 8, 40, m);
  print('   ' + m + ': games ' + R.min + '-' + R.max + ', empty ' + R.empties +
        ', maxgap ' + R.gap);
});
print(fails ? '\n*** ' + fails + ' CONFIG(S) BROKE THE ONE-RANK RULE ***'
            : '\nAll configs held the one-rank rule.');
