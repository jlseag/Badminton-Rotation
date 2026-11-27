/* Roster sync, run headlessly against the real code in index.html.

   The browser gives both of the page's <script> blocks ONE shared lexical
   scope -- which is why the access gate can call load() and render() even
   though top-level `let` never lands on window. jsc gives each `new Function`
   its own scope, so the only faithful way to run the gate is to concatenate
   the two blocks into a single Function body, exactly as the page sees them.

   The server is a fake, but it is the REAL contract: roster_push() rejects a
   push whose base revision is not the current one, and hands back what it has
   instead. That rejection is the whole conflict story, so a fake that does not
   reproduce it would test nothing worth testing. */

function makeServer(){
  var db = null;                 // { data, rev } — one host, which is all a test needs
  var log = { pushes:0, rejects:0, pulls:0 };
  return {
    db: function(){ return db },
    log: log,
    reset: function(){ db = null; log.pushes = 0; log.rejects = 0; log.pulls = 0 },
    seed: function(doc, rev){ db = { data: doc, rev: rev || 1 } },

    fail: false,                   // set true to simulate no signal

    handle: function(path, opts){
      if (this.fail) return Promise.reject(new Error('offline'));
      var body = opts && opts.body ? JSON.parse(opts.body) : null;

      if (path.indexOf('/rest/v1/host_rosters') === 0){
        log.pulls++;
        return ok(db ? [{ data: db.data, rev: db.rev }] : []);
      }
      if (path.indexOf('/rest/v1/rpc/roster_push') === 0){
        if (!db){
          db = { data: body.p_data, rev: 1 };
          log.pushes++;
          return ok([{ ok: true, rev: db.rev, data: db.data }]);
        }
        if (db.rev !== body.p_base){
          log.rejects++;
          return ok([{ ok: false, rev: db.rev, data: db.data }]);
        }
        db = { data: body.p_data, rev: db.rev + 1 };
        log.pushes++;
        return ok([{ ok: true, rev: db.rev, data: db.data }]);
      }
      // device heartbeat and anything else the gate does on the way past
      if (path.indexOf('/rest/v1/rpc/device_touch') === 0)
        return ok([{ revoked:false, booted:false, device_id:'d', merged:false }]);
      if (path.indexOf('/rest/v1/admin_overview') === 0) return ok([]);
      return ok([]);
    }
  };

  function ok(json){
    return Promise.resolve({ ok:true, status:200,
      json: function(){ return Promise.resolve(json) },
      text: function(){ return Promise.resolve(JSON.stringify(json)) } });
  }
}

/* One simulated device: its own localStorage, its own copy of the app. */
function makeDevice(server, name){
  var app = readFile('dev/_app.js'), gate = readFile('dev/_gate.js');

  // Reach inside the gate's IIFE. Appending to the body is the only way in:
  // everything it holds is closure-private, which is the point of it.
  gate = gate.replace(/\}\)\(\);\s*$/,
    ';window.__sync = { pull: rosterPull, push: rosterPush, merge: mergeRoster,' +
    ' doc: rosterDoc, state: syncRead, changed: window.mabyoRosterChanged,' +
    ' signIn: function(id){ A = { id:id, email:id+"@test", access_token:"t" };' +
    '   write("badminton_auth_v1", A); gate.hidden = true; }, signOut: signOut };\n})();');

  function mkEl(){
    var e = { style:{}, classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false}},
      dataset:{}, children:[], hidden:false, innerHTML:'', value:'', textContent:'',
      appendChild:function(){}, removeChild:function(){}, setAttribute:function(){},
      getAttribute:function(){return null}, addEventListener:function(){}, removeAttribute:function(){},
      querySelector:function(){return mkEl()}, querySelectorAll:function(){return []},
      focus:function(){}, blur:function(){}, click:function(){}, closest:function(){return null},
      insertAdjacentHTML:function(){},
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

  // Timers run immediately: a test should not have to wait out a debounce.
  var win = { document:doc, localStorage:ls, addEventListener:function(){},
    matchMedia:function(){return {matches:false,addEventListener:function(){}}},
    location:{href:'https://mabyo.id/',hostname:'mabyo.id',host:'mabyo.id',
      protocol:'https:',origin:'https://mabyo.id',pathname:'/',search:'',hash:'',
      reload:function(){},replace:function(){},assign:function(){}},
    navigator:{userAgent:'jsc',onLine:true,
      serviceWorker:{register:function(){return {then:function(){return {catch:function(){}}}}}}},
    setTimeout:function(f){ if(typeof f==='function') f(); return 0 },
    clearTimeout:function(){}, setInterval:function(){return 0},
    clearInterval:function(){}, requestAnimationFrame:function(){return 0},
    crypto:{randomUUID:function(){return 'dev-'+name}},
    fetch:function(url, opts){ return server.handle(String(url).replace(/^https?:\/\/[^/]+/,''), opts) },
    innerWidth:390, innerHeight:844, scrollTo:function(){} };
  win.window = win;

  var expose = '\n;return { get S(){return S}, set S(v){S=v}, save:save,' +
    ' sortRoster:sortRoster, rkey:rkey, defState:defState,' +
    ' sync: window.__sync, ls: localStorage };';

  var f = new Function('window','document','localStorage','navigator','location',
                       'setTimeout','clearTimeout','setInterval','clearInterval',
                       'requestAnimationFrame','crypto','fetch','matchMedia','alert','console',
                       'addEventListener','removeEventListener','screen','history','indexedDB','Notification',
                       app + '\n' + gate + expose);

  var api = f(win, doc, ls, win.navigator, win.location,
           win.setTimeout, win.clearTimeout, win.setInterval, win.clearInterval,
           win.requestAnimationFrame, win.crypto, win.fetch, win.matchMedia,
           function(){}, { log:function(){}, warn:function(){}, error:function(){} },
           function(){}, function(){}, {width:390,height:844},
           {pushState:function(){},replaceState:function(){},back:function(){}},
           null, undefined);
  /* The gate's own boot() is already in flight and ends by setting A from
     storage -- null, on a fresh device. Let it land BEFORE the test signs in,
     or it lands afterwards and quietly signs the test out again. */
  settle();
  return api;
}

/* The sync functions are async. Nothing in the fake server is truly
   asynchronous, so draining the microtask queue is enough to settle them. */
function settle(){
  for (var i = 0; i < 50; i++) Promise.resolve().then(function(){});
  drainMicrotasks();
}
