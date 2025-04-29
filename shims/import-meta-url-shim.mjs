let __import_meta_url;
if (typeof document === 'undefined') {
  const { pathToFileURL } = require('url');
  __import_meta_url = pathToFileURL(__filename).href;
} else {
  __import_meta_url =
    (document.currentScript && document.currentScript.src) ||
    new URL('main.js', document.baseURI).href;
}
export { __import_meta_url };
