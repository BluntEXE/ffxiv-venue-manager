const { withDangerousMod } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

// Fix for AGP 8.x: `components.release` Groovy property syntax was removed.
// expo-modules-core 1.12.x still uses it; patch to findByName() which works
// across all AGP 7.x and 8.x.
// Walk up from dir until we find node_modules/expo-modules-core
function findExpoModulesCoreGradle(startDir) {
  let dir = startDir
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

module.exports = function withExpoModulesCoreAndroidFix(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const filePath = findExpoModulesCoreGradle(cfg.modRequest.projectRoot)
      if (!filePath) return cfg

      let content = fs.readFileSync(filePath, 'utf8')
      if (content.includes('from components.release')) {
        content = content.replace(
          'from components.release',
          'from components.findByName("release")'
        )
        fs.writeFileSync(filePath, content)
        console.log('[withExpoModulesCoreAndroidFix] Patched', filePath)
      }
      return cfg
    },
  ])
}
