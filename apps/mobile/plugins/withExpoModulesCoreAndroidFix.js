const { withDangerousMod } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

// Fix for AGP 8.x: `components.release` Groovy property syntax was removed.
// expo-modules-core 1.12.x still uses it; patch to findByName() which works
// across all AGP 7.x and 8.x.
module.exports = function withExpoModulesCoreAndroidFix(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const filePath = path.join(
        cfg.modRequest.projectRoot,
        'node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle'
      )
      if (!fs.existsSync(filePath)) return cfg

      let content = fs.readFileSync(filePath, 'utf8')
      if (content.includes('from components.release')) {
        content = content.replace(
          'from components.release',
          'from components.findByName("release")'
        )
        fs.writeFileSync(filePath, content)
      }
      return cfg
    },
  ])
}
