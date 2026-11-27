/* Roster sync: two devices, one account, one roster.

   The question every case below asks is the same one: can a name disappear?
   Everything else about sync is a convenience, but a host who adds Budi on
   the phone and finds him gone on the laptop has been handed a worse app
   than the one with no sync at all. */
load('dev/harness-sync.js');

var pass = 0, fail = 0;
function ok(label, cond, detail){
  if (cond) { pass++; print('  ok   ' + label); }
  else { fail++; print('  FAIL ' + label + (detail ? '  -> ' + detail : '')); }
}
function names(dev){ return (dev.S.roster || []).map(function(r){ return r.name }).join(',') }
function srvNames(server){
  var d = server.db(); return d ? d.data.map(function(x){ return x.n }).join(',') : '(empty)';
}
function setRoster(dev, list){
  dev.S.roster = list.map(function(n){ return { name:n, tier:'int' } });
  dev.save();            // the real chokepoint: this is what schedules a push
  settle();
}

var server = makeServer();

/* ── 1. the first device to sign in seeds the server ─────────────────── */
print('\n1. First sign-in seeds an empty account');
server.reset();
var mac = makeDevice(server, 'mac');
mac.sync.signIn('host-1');
setRoster(mac, ['Budi', 'Sari']);
ok('server received the roster', srvNames(server) === 'Budi,Sari', srvNames(server));
ok('revision starts at 1', server.db() && server.db().rev === 1);

/* ── 2. a second device picks it up ──────────────────────────────────── */
print('\n2. A second device signs in to the same account');
var phone = makeDevice(server, 'phone');
phone.sync.signIn('host-1');
phone.sync.pull(); settle();
ok('phone has both names', names(phone) === 'Budi,Sari', names(phone));
ok('phone did not push anything back', server.db().rev === 1, 'rev ' + server.db().rev);

/* ── 3. the case that matters: both devices add someone ──────────────── */
print('\n3. Both devices add a player before either syncs');
setRoster(mac,   ['Tono', 'Budi', 'Sari']);     // new names go in at the top
setRoster(phone, ['Wati', 'Budi', 'Sari']);
var all = srvNames(server).split(',').sort().join(',');
ok('the server rejected the stale push', server.log.rejects >= 1,
   'rejects ' + server.log.rejects);
ok('nobody was lost', all === 'Budi,Sari,Tono,Wati', srvNames(server));
phone.sync.pull(); settle();
mac.sync.pull();   settle();
ok('mac ended up with all four',
   names(mac).split(',').sort().join(',') === 'Budi,Sari,Tono,Wati', names(mac));
ok('phone ended up with all four',
   names(phone).split(',').sort().join(',') === 'Budi,Sari,Tono,Wati', names(phone));
ok('both devices agree', names(mac) === names(phone),
   names(mac) + '  vs  ' + names(phone));

/* ── 4. a quiet save must not cost a request ─────────────────────────── */
print('\n4. Saving without touching the roster');
var before = server.log.pushes;
mac.save(); settle();
mac.save(); settle();
ok('no upload for an unchanged roster', server.log.pushes === before,
   before + ' -> ' + server.log.pushes);

/* ── 5. no signal ────────────────────────────────────────────────────── */
print('\n5. The host adds a player with no signal');
server.fail = true;
var revBefore = server.db().rev;
setRoster(mac, ['Agus'].concat(names(mac).split(',')));
ok('the app carried on', names(mac).indexOf('Agus') === 0, names(mac));
ok('nothing reached the server', server.db().rev === revBefore);
server.fail = false;
mac.save(); settle();                 // signal returns, the next save retries
ok('the queued change went up when signal returned',
   srvNames(server).indexOf('Agus') >= 0, srvNames(server));

/* ── 6. signing out must not let the next account inherit the revision ─ */
print('\n6. Signing out');
mac.sync.signOut();
ok('the agreed revision was dropped', mac.ls.getItem('badminton_sync_v1') === null,
   String(mac.ls.getItem('badminton_sync_v1')));

/* ── 7. a device that has been away for a week ───────────────────────── */
print('\n7. A device that was in a pocket all week');
server.reset();
var a = makeDevice(server, 'a'); a.sync.signIn('host-2');
setRoster(a, ['Rina', 'Dewi']);
var b = makeDevice(server, 'b'); b.sync.signIn('host-2');
b.sync.pull(); settle();                        // b is in step at rev 1
setRoster(a, ['Joko', 'Rina', 'Dewi']);         // the world moves on without b
setRoster(a, ['Yuni', 'Joko', 'Rina', 'Dewi']);
b.sync.pull(); settle();
ok('the sleeper caught up', names(b).split(',').sort().join(',') === 'Dewi,Joko,Rina,Yuni',
   names(b));
ok('and did not undo anything', srvNames(server).split(',').sort().join(',') ===
   'Dewi,Joko,Rina,Yuni', srvNames(server));

print('\n' + (fail ? fail + ' FAILED, ' : '') + pass + ' passed');
