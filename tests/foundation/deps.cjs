// QA dependencies live in an ignored directory; the static game needs no build.
module.exports = require('node:module').createRequire(
  require('node:path').resolve(__dirname, '../../.local-qa/r5-00/runtime/package.json'),
);
