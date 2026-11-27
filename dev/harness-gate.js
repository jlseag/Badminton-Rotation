/* The access gate, run headlessly against the real code in index.html.

   Same trick as harness-sync.js: both of the page's <script> blocks share
   ONE lexical scope in a browser, so the only faithful way to run the gate
   is to concatenate them into a single Function body.

   This harness exists because every bug in the device cap so far has been
   an ORDERING bug, invisible to a test that only checks the end state:
   the heartbeat cleared the flag before it read it; the gate came down
   before the boot was known; a reclaim was judged as the boot it was
   undoing. So what it records is the ORDER of what the gate did -- every
   un-gate, every locked screen, every device_touch and what it claimed. */

function makeGateServer(){
  var st = {
    plan: 'active', expires_at: null, suspended: false,
    is_admin: false, preview_ok: false,
    devices: [],                 // [{ key, booted, revoked }]
    cap: 1,
    calls: []                    // every device_touch: { reclaim }
  };
  return {
    s: st,
    reset: function(){ st.devices = []; st.calls = []; st.suspended = false; },
    /* A device the server already knows, in whatever state the test needs. */
    put: function(key, booted, revoked){
      st.devices.push({ key: key, booted: !!booted, revoked: !!revoked });
    },
    find: function(key){
      for (var i = 0; i < st.devices.length; i++)
        if (st.devices[i].key === key) return st.devices[i];
      return null;
    },

    handle: function(path, opts){
      var body = opts && opts.body ? JSON.parse(opts.body) : null;

      if (path.indexOf('/rest/v1/hosts') === 0)
        return ok([{ is_admin: st.is_admin, preview_ok: st.preview_ok }]);

      if (path.indexOf('/rest/v1/admin_overview') === 0)
        return ok([{ plan: st.plan, expires_at: st.expires_at, suspended: st.suspended }]);

      /* The real query asks for this device by key OR fingerprint. The
         harness keys on the device key alone; the fingerprint half is
         exercised in production, not here. */
      if (path.indexOf('/rest/v1/devices') === 0){
        var m = /device_key\.eq\.([^,)&]+)/.exec(path);
        var row = m ? this.find(decodeURIComponent(m[1])) : null;
        return ok(row ? [{ revoked: row.revoked, booted: row.booted }] : []);
      }

      if (path.indexOf('/rest/v1/rpc/device_touch') === 0){
        var reclaim = !!(body && body.p_reclaim);
        st.calls.push({ reclaim: reclaim });
        var d = this.find(body.p_device_key);
        if (!d){ d = { key: body.p_device_key, booted: false, revoked: false };
                 st.devices.push(d); }
        if (d.revoked) return ok([{ revoked: true,  booted: d.booted, merged: false }]);
        /* The contract the SQL now keeps: a plain heartbeat REPORTS a boot
           and changes nothing; only a reclaim clears it and sweeps. */
        if (d.booted && !reclaim) return ok([{ revoked: false, booted: true, merged: false }]);
        d.booted = false;
        var live = [];
        for (var i = 0; i < st.devices.length; i++){
          var o = st.devices[i];
          if (o !== d && !o.revoked && !o.booted) live.push(o);
        }
        for (var j = 0; j < live.length - (st.cap - 1); j++) live[j].booted = true;
        return ok([{ revoked: false, booted: false, merged: false }]);
      }

      if (path.indexOf('/rest/v1/host_rosters') === 0) return ok([]);
      if (path.indexOf('/rest/v1/rpc/roster_push') === 0)
        return ok([{ ok: true, rev: 1, data: body ? body.p_data : [] }]);
      return ok([]);
    }
  };

  function ok(json){
    return Promise.resolve({ ok:true, status:200,
      json: function(){ return Promise.resolve(json) },
      text: function(){ return Promise.resolve(JSON.stringify(json)) } });
  }
}

function makeGateDevice(server, key, host){
  host = host || 'mabyo.id';
  var app = readFile('dev/_app.js'), gate = readFile('dev/_gate.js');

  /* The gate's whole point is that nothing inside it is reachable, so the
     only way in is to append to the IIFE body before it closes. `trace` is
     the record this harness is for: what the gate did, in order. */
  gate = gate.replace(/\}\)\(\);\s*$/,
    ';window.__gate = {\n' +
    '  boot: boot, checkAccess: checkAccess, touch: touch,\n' +
    '  signIn: function(id){ A = { id:id, email:id+"@test", access_token:"t",\n' +
    '      expires_at: Date.now() + 3600000 };\n' +
    '    write("badminton_auth_v1", A); freshSignIn = true; },\n' +
    '  restore: function(id){ A = { id:id, email:id+"@test", access_token:"t",\n' +
    '      expires_at: Date.now() + 3600000 };\n' +
    '    write("badminton_auth_v1", A); freshSignIn = false; },\n' +
    '  gateUp: function(){ return !gate.hidden },\n' +
    '  screen: function(){ var h = gBody.querySelector(".gtitle");\n' +
    '    return h ? h.textContent : null },\n' +
    '  button: function(){ var b = gBody.querySelector("#gOut");\n' +
    '    return b ? b.textContent : null }\n' +
    '};\n})();');

  var trace = [];
  function mkEl(){
    var e = { style:{}, classList:{add:function(){},remove:function(){},toggle:function(){},contains:function(){return false}},
      dataset:{}, children:[], hidden:false, innerHTML:'', value:'', textContent:'',
      appendChild:function(){}, removeChild:function(){}, setAttribute:function(){},
      getAttribute:function(){return null}, addEventListener:function(){}, removeAttribute:function(){},
      querySelector:function(){return null}, querySelectorAll:function(){return []},
      focus:function(){}, blur:function(){}, click:function(){}, closest:function(){return null},
      insertAdjacentHTML:function(){},
      getBoundingClientRect:function(){return {top:0,left:0,width:0,height:0}} };
    return e;
  }

  /* The gate element is the thing under test, so it is the one element the
     fake DOM models honestly: every change to `hidden` is recorded. */
  var gateEl = mkEl();
  gateEl._hidden = false;
  Object.defineProperty(gateEl, 'hidden', {
    get: function(){ return this._hidden },
    set: function(v){ v = !!v;
      if (v !== this._hidden) trace.push(v ? 'APP' : 'GATE');
      this._hidden = v; }
  });

  var gBodyEl = mkEl();
  gBodyEl._title = null;
  Object.defineProperty(gBodyEl, 'innerHTML', {
    get: function(){ return this._html || '' },
    set: function(v){ this._html = String(v);
      var m = /<h1 class="gtitle">([^<]*)<\/h1>/.exec(this._html);
      this._title = m ? m[1] : null;
      var b = /id="gOut">([^<]*)</.exec(this._html);
      this._btn = b ? b[1] : null;
      if (this._title) trace.push('LOCK:' + this._title); }
  });
  gBodyEl.querySelector = function(sel){
    if (sel === '.gtitle') return { textContent: gBodyEl._title };
    if (sel === '#gOut')   return gBodyEl._btn ? { textContent: gBodyEl._btn, onclick:null } : null;
    return mkEl();
  };

  var byId = { gate: gateEl, gBody: gBodyEl };
  var doc = { documentElement:mkEl(), body:mkEl(), head:mkEl(),
    getElementById:function(id){ return byId[id] || mkEl() },
    querySelector:function(s){ var k = s.replace('#',''); return byId[k] || mkEl() },
    querySelectorAll:function(){return []}, createElement:function(){return mkEl()},
    addEventListener:function(){}, removeEventListener:function(){},
    createTextNode:function(){return mkEl()}, hidden:false, title:'', readyState:'complete' };

  var store = {};
  var ls = { getItem:function(k){return k in store?store[k]:null},
             setItem:function(k,v){store[k]=String(v)},
             removeItem:function(k){delete store[k]}, clear:function(){store={}} };
  ls.setItem('badminton_device_v1', key);

  var win = { document:doc, localStorage:ls, addEventListener:function(){},
    matchMedia:function(){return {matches:false,addEventListener:function(){}}},
    location:{href:'https://'+host+'/',hostname:host,host:host,
      protocol:'https:',origin:'https://'+host,pathname:'/',search:'',hash:'',
      reload:function(){},replace:function(){},assign:function(){}},
    navigator:{userAgent:'jsc',onLine:true,
      serviceWorker:{register:function(){return {then:function(){return {catch:function(){}}}}}}},
    setTimeout:function(f){ if(typeof f==='function') f(); return 0 },
    clearTimeout:function(){}, setInterval:function(){return 0},
    clearInterval:function(){}, requestAnimationFrame:function(){return 0},
    crypto:{randomUUID:function(){return 'dev-'+key}},
    fetch:function(url, opts){
      return server.handle(String(url).replace(/^https?:\/\/[^/]+/,''), opts) },
    innerWidth:390, innerHeight:844, scrollTo:function(){} };
  win.window = win;

  var f = new Function('window','document','localStorage','navigator','location',
                       'setTimeout','clearTimeout','setInterval','clearInterval',
                       'requestAnimationFrame','crypto','fetch','matchMedia','alert','console',
                       'addEventListener','removeEventListener','screen','history','indexedDB','Notification',
                       app + '\n' + gate + '\n;return { g: window.__gate, ls: localStorage };');

  var api = f(win, doc, ls, win.navigator, win.location,
           win.setTimeout, win.clearTimeout, win.setInterval, win.clearInterval,
           win.requestAnimationFrame, win.crypto, win.fetch, win.matchMedia,
           function(){}, { log:function(){}, warn:function(){}, error:function(){} },
           function(){}, function(){}, {width:390,height:844},
           {pushState:function(){},replaceState:function(){},back:function(){}},
           null, undefined);

  settleG();                       // let the gate's own boot() land first
  api.trace = function(){ return trace.slice() };
  api.clearTrace = function(){ trace.length = 0; };
  api.clearTrace();
  return api;
}

function settleG(){
  for (var i = 0; i < 80; i++) Promise.resolve().then(function(){});
  drainMicrotasks();
}
