// Lets node scripts import server-only modules (the guard is for bundles).
const p = require.resolve("server-only", { paths: [__dirname + "/../src/lib"] });
require.cache[p] = { id: p, filename: p, loaded: true, exports: {} };
