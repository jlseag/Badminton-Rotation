/* Server-side, because the other redirect is not.

   index.html has redirected mabyo.pages.dev to mabyo.id since v78, and for
   every real visitor that is enough -- it is the first line in the file.
   But it is JavaScript, in a public repository, and somebody who does not
   want to be redirected simply does not run it. That left a complete second
   copy of the live app on a guessable address.

   This runs at the edge, before a byte of HTML is sent, so there is nothing
   on the client to switch off.

   The host list is a list of what to KEEP, not what to block. A new preview
   URL -- Cloudflare mints one per commit -- is not in it, so it is sent to
   production rather than quietly serving the app to whoever found it. The
   one address that must survive is dev.mabyo.pages.dev: it is the staging
   site, and bouncing it to production would leave nowhere to test. */
const KEEP = new Set([
  'mabyo.id',
  'www.mabyo.id',
  'dev.mabyo.pages.dev',
  'localhost',
  '127.0.0.1'
]);

export async function onRequest(context){
  const url = new URL(context.request.url);
  if (KEEP.has(url.hostname)) return context.next();

  /* Everything else is some flavour of pages.dev. Carry the path, the query
     and nothing else -- a fragment never reaches the server, which is why
     the client-side redirect in index.html stays: it is the only one that
     can carry an OAuth token home. The two are not duplicates. */
  const to = new URL(url.pathname + url.search, 'https://mabyo.id');
  return Response.redirect(to.toString(), 301);
}
