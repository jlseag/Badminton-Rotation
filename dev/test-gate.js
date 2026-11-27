/* The device cap, tested as a SEQUENCE rather than an end state.

   Three bugs shipped in this feature, all three invisible to a test that
   only asks "is the device booted?" at the end:

     v80  the heartbeat wrote booted=false in the same statement it read,
          so the kicked device un-kicked itself and nobody was ever told.
     v81  the gate came down before the boot was known, so the app painted
          in full and the locked screen slammed over it a moment later.
     v82  a reclaim, judged by the access check, looked exactly like the
          boot it was undoing -- signing in again would bounce the host
          straight back to the screen they had just signed in from.

   So every case below asserts the ORDER: what the gate showed, when, and
   what each device_touch claimed. GATE means the locked screen went up,
   APP means it came down. 'GATE' appearing after 'APP' in a single boot is
   the flicker, and it is a failure. */
load('dev/harness-gate.js');

var pass = 0, fail = 0;
function ok(label, cond, detail){
  if (cond) { pass++; print('  ok   ' + label); }
  else { fail++; print('  FAIL ' + label + (detail ? '  -> ' + detail : '')); }
}
function run(dev, fn){ dev.clearTrace(); fn(); settleG(); return dev.trace().join(' '); }

var server = makeGateServer();

/* ── 1. the ordinary case ───────────────────────────────────────────── */
print('\n1. A device that still holds its slot just opens');
server.reset(); server.put('mac-key', false, false);
var mac = makeGateDevice(server, 'mac-key');
var t = run(mac, function(){ mac.g.restore('host-1'); mac.g.boot(true); });
ok('the app opened', t.indexOf('APP') >= 0, t);
ok('no locked screen on the way', t.indexOf('LOCK') < 0, t);

/* ── 2. the bug in the video ────────────────────────────────────────── */
print('\n2. A booted device opens -- the gate must never lift');
server.reset(); server.put('mac-key', true, false);
var booted = makeGateDevice(server, 'mac-key');
t = run(booted, function(){ booted.g.restore('host-1'); booted.g.boot(true); });
ok('locked screen shown', t.indexOf('LOCK:Signed in somewhere else') >= 0, t);
ok('the app NEVER painted', t.indexOf('APP') < 0, t);
ok('button says Sign in again', booted.g.button() === 'Sign in again', booted.g.button());

/* ── 3. a bare reload must not be a way back in ─────────────────────── */
print('\n3. Reloading does not take the slot back');
var before = server.find('mac-key').booted;
t = run(booted, function(){ booted.g.restore('host-1'); booted.g.boot(true); });
ok('still booted after a reload', server.find('mac-key').booted === true);
ok('still locked out', t.indexOf('APP') < 0, t);
ok('no touch claimed a reclaim',
   server.s.calls.filter(function(c){ return c.reclaim }).length === 0,
   JSON.stringify(server.s.calls));

/* ── 4. signing in again is the way back ────────────────────────────── */
print('\n4. Signing in again brings the account back here');
server.s.calls = [];
t = run(booted, function(){ booted.g.signIn('host-1'); booted.g.boot(true); });
ok('a reclaim was sent',
   server.s.calls.filter(function(c){ return c.reclaim }).length === 1,
   JSON.stringify(server.s.calls));
ok('the slot is held again', server.find('mac-key').booted === false);
ok('the app opened', t.indexOf('APP') >= 0, t);
ok('and did NOT bounce back to the locked screen',
   t.indexOf('LOCK:Signed in somewhere else') < 0, t);

/* ── 5. and it costs the other device its slot ──────────────────────── */
print('\n5. The reclaim takes the slot off the other device');
server.reset();
server.put('mac-key', false, false); server.put('phone-key', false, false);
server.s.cap = 1;
var phone = makeGateDevice(server, 'phone-key');
run(phone, function(){ phone.g.signIn('host-1'); phone.g.boot(true); });
ok('the phone is in',  server.find('phone-key').booted === false);
ok('the laptop is out', server.find('mac-key').booted === true);

/* ── 6. a removal is still a removal, not a boot ────────────────────── */
print('\n6. A removed device gets the removal screen, not this one');
server.reset(); server.put('mac-key', false, true);
var gone = makeGateDevice(server, 'mac-key');
t = run(gone, function(){ gone.g.restore('host-1'); gone.g.boot(true); });
ok('removal screen shown', t.indexOf('LOCK:This device was removed') >= 0, t);
ok('the app never painted', t.indexOf('APP') < 0, t);



/* ── 7. the preview gate ─────────────────────────────────────────────
   A preview runs unreleased code against the real database. Before the
   IS_LIVE test was inverted it also ran OUTSIDE the device cap, so any
   host who found the URL had a free, invisible session. These assert the
   gate itself: who gets in, who does not, and what happens when the
   question cannot be answered. */
print('\n7. Who may use a preview build');
var PREVIEW = 'dev.mabyo.pages.dev';

server.reset(); server.put('k1', false, false);
server.s.is_admin = false; server.s.preview_ok = false;
var stranger = makeGateDevice(server, 'k1', PREVIEW);
t = run(stranger, function(){ stranger.g.restore('host-1'); stranger.g.boot(true); });
ok('an ordinary host is turned away', t.indexOf('LOCK:Test build') >= 0, t);
ok('and the app never painted', t.indexOf('APP') < 0, t);

server.reset(); server.put('k2', false, false);
server.s.is_admin = true;
var admin = makeGateDevice(server, 'k2', PREVIEW);
t = run(admin, function(){ admin.g.restore('host-1'); admin.g.boot(true); });
ok('an admin gets in', t.indexOf('APP') >= 0, t);

server.reset(); server.put('k3', false, false);
server.s.is_admin = false; server.s.preview_ok = true;
var tester = makeGateDevice(server, 'k3', PREVIEW);
t = run(tester, function(){ tester.g.restore('host-1'); tester.g.boot(true); });
ok('a flagged tester gets in WITHOUT being an admin', t.indexOf('APP') >= 0, t);

/* The same account, same everything, on the real address. */
server.reset(); server.put('k4', false, false);
server.s.is_admin = false; server.s.preview_ok = false;
var onLive = makeGateDevice(server, 'k4', 'mabyo.id');
t = run(onLive, function(){ onLive.g.restore('host-1'); onLive.g.boot(true); });
ok('and is unaffected on mabyo.id', t.indexOf('APP') >= 0 &&
   t.indexOf('LOCK:Test build') < 0, t);

/* ── 8. an origin nobody named ───────────────────────────────────────
   The bug this replaced: anything that was not mabyo.id got a free pass.
   A per-commit preview URL must now behave as LIVE -- governed, counted,
   visible -- rather than silently exempt. */
print('\n8. An unnamed origin is live, not exempt');
server.reset(); server.put('k5', true, false);     // booted on the live cap
server.s.is_admin = false; server.s.preview_ok = false;
var unknown = makeGateDevice(server, 'k5', 'a1b2c3d4.mabyo.pages.dev');
t = run(unknown, function(){ unknown.g.restore('host-1'); unknown.g.boot(true); });
ok('the device cap still applies there',
   t.indexOf('LOCK:Signed in somewhere else') >= 0, t);
ok('so it is not a way around the cap', t.indexOf('APP') < 0, t);

print('\n' + pass + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
if (fail) quit(1);
