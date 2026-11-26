/* Run Mabyo's real matchmaking headlessly under jsc.
   The app is evaluated inside a Function body with the browser surface
   stubbed, then hands back the bindings a test needs -- top-level `let` is
   not on any object, so it has to be returned explicitly from in there. */
function makeApp(){
  var src = readFile('dev/_app.js');
  var dummy = function(){ return mkEl() };
  function mkEl(){
    var e = { style:{}, classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false}},
      dataset:{}, children:[], hidden:false, innerHTML:'', value:'', textContent:'',
      appendChild:function(){}, removeChild:function(){}, setAttribute:function(){},
      getAttribute:function(){return null}, addEventListener:function(){}, removeAttribute:function(){},
      querySelector:function(){return mkEl()}, querySelectorAll:function(){return []},
      focus:function(){}, blur:function(){}, click:function(){}, closest:function(){return null},
      getBoundingClientRect:function(){return {top:0,left:0,width:0,height:0}} };
    return e;
  }
  var doc = { documentElement:mkEl(), body:mkEl(), head:mkEl(),
    getElementById:function(){return mkEl()}, querySelector:function(){return mkEl()},
    querySelectorAll:function(){return []}, createElement:function(){return mkEl()},
    addEventListener:function(){}, removeEventListener:function(){},
    createTextNode:function(){return mkEl()}, hidden:false, title:'', readyState:'complete' };
  var store = {};
  var ls = { getItem:function(k){return k in store?store[k]:null},
             setItem:function(k,v){store[k]=String(v)},
             removeItem:function(k){delete store[k]}, clear:function(){store={}} };
  var win = { document:doc, localStorage:ls, addEventListener:function(){},
    matchMedia:function(){return {matches:false,addEventListener:function(){}}},
    location:{href:'http://localhost/',hostname:'localhost',host:'localhost',
      protocol:'http:',origin:'http://localhost',pathname:'/',search:'',hash:'',
      reload:function(){},replace:function(){},assign:function(){}},
    navigator:{userAgent:'jsc',onLine:true,serviceWorker:{register:function(){return {then:function(){return {catch:function(){}}}}}}},
    setTimeout:function(){return 0}, clearTimeout:function(){}, setInterval:function(){return 0},
    clearInterval:function(){}, requestAnimationFrame:function(){return 0},
    crypto:{randomUUID:function(){return 'test-uuid'}}, fetch:function(){return {then:function(){return {catch:function(){}}}}},
    innerWidth:390, innerHeight:844, scrollTo:function(){} };
  win.window = win;

  var expose = '\n;return {' +
    'get S(){return S}, set S(v){S=v},' +
    /* The court cap is an entitlement, and a headless run has no account.
       Tests say which tier they are exercising. */
    'get PREMIUM(){return PREMIUM}, set PREMIUM(v){PREMIUM=v},' +
    'get sel(){return sel}, set sel(v){sel=v},' +
    'defState:defState, fillCourts:fillCourts, finishMatch:finishMatch, P:P,' +
    'stats:stats, strengths:strengths, present:present, tierOf:tierOf,' +
    'TIER_ORD:TIER_ORD, TIER_SEQ:TIER_SEQ, chooseMix:chooseMix, mixStranded:mixStranded,' +
    'queueOrder:queueOrder, sortByTier:sortByTier, tierGap:tierGap,' +
    /* nextTeams + savedPanel let a test choose WHEN the draw fires, which is
       the whole question: finishing a court draws it at once today. */
    'nextTeams:nextTeams, drawCourts:drawCourts, holdMatch:holdMatch,' +
    'drawLabel:drawLabel, othersPlaying:othersPlaying, sweptWith:sweptWith,' +
    'get savedPanel(){return savedPanel}, set savedPanel(v){savedPanel=v},' +
    'activeCourts:activeCourts, fillCourt:fillCourt, drawCourts:drawCourts };';

  var f = new Function('window','document','localStorage','navigator','location',
                       'setTimeout','clearTimeout','setInterval','clearInterval',
                       'requestAnimationFrame','crypto','fetch','matchMedia','alert','console',
                       'addEventListener','removeEventListener','screen','history','indexedDB','Notification',
                       src + expose);
  return f(win, doc, ls, win.navigator, win.location,
           win.setTimeout, win.clearTimeout, win.setInterval, win.clearInterval,
           win.requestAnimationFrame, win.crypto, win.fetch, win.matchMedia,
           function(){}, { log:function(){}, warn:function(){}, error:function(){} },
           function(){}, function(){}, {width:390,height:844},
           {pushState:function(){},replaceState:function(){},back:function(){}},
           null, undefined);
}
