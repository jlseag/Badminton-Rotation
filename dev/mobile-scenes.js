/* Every screen a host actually reaches, set up from scratch so the audit can
   walk them. Each scene leaves the app on that screen and returns its name. */
window.__seed = function(n, opts){
  opts = opts || {};
  S = defState();
  Object.assign(S.settings, {courts:opts.courts||3, pairing:'level',
    scoring:opts.scoring||'wins', mode:'firstto', total:21});
  S.players = []; S.roster = [];
  const T = ['adv','upp','int','beg'];
  for(let i=0;i<n;i++){
    const nm = 'Player '+(i+1), t = T[i%4];
    S.players.push({id:'p'+(i+1), name:nm, tier:t, away:false, qg:0, lastPlayed:0});
    S.roster.push({name:nm, tier:t});
  }
  sortByTier(); S.started = !opts.notStarted; S.courts=[]; S.matches=[]; S.recentQuads={};
  savedPanel={}; sel=null;
  if(S.started) fillCourts();
};
window.__scenes = [
  ['start screen',        () => { __seed(0,{notStarted:true}); tab='game'; render(); }],
  ['players, long list',  () => { __seed(41); tab='players'; render(); }],
  ['players, some away',  () => { __seed(24); S.players.slice(0,6).forEach(p=>p.away=true); tab='players'; render(); }],
  ['players, new tier',   () => { __seed(12); S.players.slice(0,5).forEach(p=>p.tier='new'); S.roster=S.roster.slice(5); tab='players'; render(); }],
  ['paste sheet, empty',  () => { __seed(0,{notStarted:true}); tab='players'; render(); pasteDialog(); }],
  ['roster history',      () => { __seed(41); tab='players'; render(); rosterDialog(); }],
  ['game, 3 courts',      () => { __seed(24); tab='game'; render(); }],
  ['game, entering wins', () => { __seed(24); tab='game'; render(); beginResult(0); }],
  ['game, winner picked', () => { __seed(24); tab='game'; render(); beginResult(0); S.courts[0].winner='a'; render(); }],
  ['game, points entry',  () => { __seed(24,{scoring:'points'}); tab='game'; render(); beginResult(0); }],
  ['game, 1 court',       () => { __seed(9,{courts:1}); tab='game'; render(); }],
  ['game, swap selected', () => { __seed(24); tab='game'; render(); tapRolling(S.courts[0].a[0]); }],
  ['waiting sheet',       () => { __seed(24); tab='game'; render(); queueDialog(); }],
  ['waiting sheet + sel', () => { __seed(24); tab='game'; render(); tapRolling(S.courts[0].a[0]); queueDialog(); }],
  ['leaderboard',         () => { __seed(24); for(let k=0;k<9;k++){const i=S.courts.findIndex(c=>c); if(i<0)break; S.courts[i].winner='a'; finishMatch(i);} tab='board'; render(); }],
  ['history',             () => { __seed(24); for(let k=0;k<9;k++){const i=S.courts.findIndex(c=>c); if(i<0)break; S.courts[i].winner='a'; finishMatch(i);} tab='history'; render(); }],
  ['settings',            () => { __seed(24); tab='settings'; render(); }],
];
window.__runAudit = function(){
  const all = [];
  __scenes.forEach(([name, go]) => {
    try { closeModal(); } catch(e){}
    try { go(); } catch(e){ all.push({label:name, fail:[{kind:'threw', detail:String(e)}]}); return; }
    all.push(__audit(name));
  });
  try { closeModal(); } catch(e){}
  return all;
};
