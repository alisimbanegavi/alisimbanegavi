// Subresources are served from the worker's OWN origin so every asset-cache
// fetch routes back here and gets logged. They are injected at request time via
// the __ORIGIN__ placeholder; using same-origin absolute URLs keeps them off the
// extractor's excluded-domain list (fonts.googleapis.com, cdn.jsdelivr.net,
// api.trustedform.com, etc.) and off the api/certs-hostname filter.
const FORM_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <!-- get_node_assets: <link href> stylesheet -->
  <link rel="stylesheet" href="__ORIGIN__/assets/app.css">

  <!-- get_node_assets: <link href> non-stylesheet (favicon) - still collected -->
  <link rel="icon" href="__ORIGIN__/assets/favicon.ico">

  <!-- get_node_assets: <link rel="preconnect"> is SKIPPED (negative control - should NOT be fetched) -->
  <link rel="preconnect" href="__ORIGIN__/assets/should-not-be-fetched">

  <style>
    /* get_node_assets: <style> CSS url() - @import */
    @import url("__ORIGIN__/assets/import.css");

    /* get_node_assets: <style> CSS url() - @font-face (woff2 + woff) */
    @font-face {
      font-family: "ExampleFont";
      src: url("__ORIGIN__/assets/example.woff2") format("woff2"),
           url("__ORIGIN__/assets/example.woff") format("woff");
      font-display: swap;
    }

    /* get_node_assets: <style> CSS url() - background-image */
    body {
      background-image: url("__ORIGIN__/assets/bg-texture.png");
    }
  </style>

  <!-- get_node_assets: generic element with src attribute (script) -->
  <script src="__ORIGIN__/assets/app.js"></script>
</head>
<body>
  <h1>TrustedForm Test</h1>

  <!-- get_node_assets: <img src> + <img srcset> (responsive image) -->
  <img src="__ORIGIN__/assets/logo.png"
       srcset="__ORIGIN__/assets/logo.png 1x,
               __ORIGIN__/assets/logo@2x.png 2x"
       alt="TrustedForm logo" width="160" height="40">

  <!-- parse_node_styles: inline style="" attribute url() -->
  <div style="background-image: url('__ORIGIN__/assets/inline-bg.png'); height: 20px;"></div>

  <!-- get_node_assets: generic element with src attribute (iframe) -->
  <iframe src="__ORIGIN__/assets/frame.html" width="200" height="100" title="frame"></iframe>

  <!-- get_node_assets: generic element with src attribute (video <source>) -->
  <video controls width="200" poster="__ORIGIN__/assets/poster.jpg">
    <source src="__ORIGIN__/assets/clip.mp4" type="video/mp4">
  </video>

  <form id="explicit-consent" method="get" action="/thanks">
    <input type="text" name="first_name" placeholder="First name">
    <input type="email" name="email" placeholder="email@example.com">
    <input type="tel" name="phone" placeholder="555-1212">
    <input type="hidden" id="xxTrustedFormCertUrl" name="xxTrustedFormCertUrl">
    <button type="submit">Submit</button>
  </form>

  <!-- Copiable certificate ID -->
  <div id="cert-url-dest">Waiting for certificate&hellip;</div>
  <button type="button" id="copy-cert" disabled>Copy Cert ID</button>

  <script type="text/javascript">
    (function() {
      var field = 'xxTrustedFormCertUrl';
      var tf = document.createElement('script');
      tf.type = 'text/javascript'; tf.async = true;
      tf.src = 'https://api.staging.trustedform.com/trustedform.js?field=' + field +
               '&l=' + new Date().getTime() + Math.random();
      var s = document.getElementsByTagName('script')[0];
      s.parentNode.insertBefore(tf, s);
    })();

    // Surface the cert URL TrustedForm writes into the hidden input, and make it copiable
    (function() {
      var input = document.getElementById('xxTrustedFormCertUrl');
      var dest = document.getElementById('cert-url-dest');
      var copyBtn = document.getElementById('copy-cert');
      var poll = setInterval(function() {
        if (input.value) {
          dest.textContent = input.value;
          copyBtn.disabled = false;
          clearInterval(poll);
        }
      }, 500);
      copyBtn.addEventListener('click', function() {
        if (!input.value) return;
        navigator.clipboard.writeText(input.value).then(function() {
          copyBtn.textContent = 'Copied!';
          setTimeout(function() { copyBtn.textContent = 'Copy Cert ID'; }, 1500);
        });
      });
    })();
  </script>
</body></html>`;

const CONTENT_TYPES = {
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  mp4: "video/mp4",
  html: "text/html; charset=utf-8",
};

function contentTypeFor(pathname) {
  const ext = pathname.split(".").pop().toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Log EVERY incoming request. `trustedform-request: 1` is set on both
    // TrustedForm fetch paths - the asset cache and the web-claim archiver - so it
    // should appear on every asset subresource fetch. Surface it explicitly and keep
    // the full header set for context.
    console.log(JSON.stringify({
      method: request.method,
      path: url.pathname,
      trustedform_request: request.headers.get("trustedform-request"),
      ua: request.headers.get("user-agent"),
      headers: Object.fromEntries(request.headers),
    }));

    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = FORM_TEMPLATE.replaceAll("__ORIGIN__", url.origin);
      return new Response(html, { headers: { "content-type": "text/html" } });
    }

    if (url.pathname === "/thanks") {
      return new Response("<h1>Thanks</h1>", { headers: { "content-type": "text/html" } });
    }

    if (url.pathname.startsWith("/assets/")) {
      const contentType = contentTypeFor(url.pathname);
      const body = contentType.startsWith("text/css")
        ? "/* cached asset */ body { }"
        : `asset:${url.pathname}`;
      return new Response(body, {
        headers: {
          "content-type": contentType,
          "cache-control": "public, max-age=86400",
        },
      });
    }

    return new Response("ok", { status: 200 });
  }
}
