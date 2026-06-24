// EAS Build reads config from the git root. Re-export the mobile app config
// so prebuild finds android.package and projectId correctly.
const { expo } = require('./apps/mobile/app.json');
module.exports = { expo };
