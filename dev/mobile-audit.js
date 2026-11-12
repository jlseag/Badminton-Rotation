/* Mobile / tablet UI audit. Runs in the page, returns a JSON report.
   Every check here is a bug a host would actually hit on a phone. */
window.__audit = function(label){
  const out = { label, w: innerWidth, h: innerHeight, fail: [] };
  const add = (kind, el, detail) => out.fail.push({
    kind, detail,
    el: el ? (el.tagName.toLowerCase()
      + (el.id?'#'+el.id:'')
      + (el.className && typeof el.className==='string' ? '.'+el.className.trim().split(/\s+/).slice(0,2).join('.') : '')
      + ' «' + (el.textContent||el.placeholder||'').trim().slice(0,32) + '»') : null
  });

  /* 1. iOS zooms on focus when a form control is under 16px. */
  document.querySelectorAll('input,textarea,select').forEach(el => {
    if(el.type==='range'||el.type==='checkbox'||el.type==='radio'||el.type==='hidden') return;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if(fs < 16) add('ios-zoom', el, fs+'px (needs >=16)');
  });

  /* 2. The page itself must never scroll sideways. */
  const se = document.scrollingElement || document.documentElement;
  if(se.scrollWidth > se.clientWidth + 1)
    add('page-h-scroll', null, se.scrollWidth+'px wide in a '+se.clientWidth+'px viewport');

  /* 3. Nothing visible may stick out past the right edge. */
  const vw = document.documentElement.clientWidth;
  document.querySelectorAll('body *').forEach(el => {
    const cs = getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden'||cs.position==='fixed') return;
    const r = el.getBoundingClientRect();
    if(r.width===0||r.height===0) return;
    if(r.right > vw + 1) add('overflow-right', el, Math.round(r.right - vw)+'px past the edge');
    if(r.left < -1)      add('overflow-left',  el, Math.round(-r.left)+'px off the left');
  });

  /* 4. A control smaller than 44x44 is hard to hit with a thumb. */
  document.querySelectorAll('button,a,[onclick],input,select').forEach(el => {
    const cs = getComputedStyle(el);
    if(cs.display==='none'||cs.visibility==='hidden') return;
    if(el.disabled) return;
    if(el.type==='range') return;            // the thumb is bigger than the track
    const r = el.getBoundingClientRect();
    if(r.width===0||r.height===0) return;
    // ::after may widen the touch area without changing the box, so measure
    // what a thumb can actually land on.
    const a = getComputedStyle(el,'::after');
    const grow = (v) => { const n = parseFloat(v); return (a.content!=='none' && n<0) ? -n : 0; };
    const h = r.height + grow(a.top) + grow(a.bottom);
    const w = r.width  + grow(a.left) + grow(a.right);
    if(h < 42 || w < 42)
      add('tap-target', el, Math.round(w)+'x'+Math.round(h)+' touchable (want >=44)');
  });

  /* 5. Text cut off inside its own box, where no ellipsis was asked for. */
  document.querySelectorAll('body *').forEach(el => {
    if(el.children.length) return;
    const cs = getComputedStyle(el);
    if(cs.textOverflow==='ellipsis' || cs.overflow==='auto' || cs.overflowX==='auto') return;
    if(cs.overflow!=='hidden' && cs.overflowX!=='hidden') return;
    if(el.scrollWidth > el.clientWidth + 2) add('text-clipped', el, el.scrollWidth+'>'+el.clientWidth);
  });

  return out;
};
