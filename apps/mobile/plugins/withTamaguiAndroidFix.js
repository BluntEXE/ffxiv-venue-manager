const { withDangerousMod } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

// @tamagui/static@1.114.0 eagerly requires react-native-web at build time,
// which loads react-dom-client.production.js. That file crashes during Metro
// bundling because the React scheduler global it expects isn't present in a
// Node/Babel transform context. Wrap the require in a try-catch so the build
// can proceed. disableExtraction:true in babel.config.js means the static
// extractor never actually runs — this just prevents the load-time crash.
function findFile(startDir, relPath) {
  let dir = startDir
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, relPath)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

module.exports = function withTamaguiAndroidFix(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const filePath = findFile(
        cfg.modRequest.projectRoot,
        'node_modules/@tamagui/static/dist/registerRequire.js'
      )
      if (!filePath) return cfg

      let content = fs.readFileSync(filePath, 'utf8')
      const target = 'rnw = require("react-native-web")'
      if (content.includes(target)) {
        content = content.replace(
          target,
          'rnw = (() => { try { return require("react-native-web"); } catch(e) { return {}; } })()'
        )
        fs.writeFileSync(filePath, content)
        console.log('[withTamaguiAndroidFix] Patched @tamagui/static registerRequire.js')
      }
      return cfg
    },
  ])
}
