const { withGradleProperties } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

// Patch gradle-wrapper.properties to use Gradle 8.14 (supports Java 26)
module.exports = function withGradle814(config) {
  return withGradleProperties(config, (c) => {
    const wrapperPath = path.join(
      c.modRequest.platformProjectRoot,
      'gradle/wrapper/gradle-wrapper.properties'
    )
    if (fs.existsSync(wrapperPath)) {
      let content = fs.readFileSync(wrapperPath, 'utf8')
      content = content.replace(
        /distributionUrl=.*gradle-.*-all\.zip/,
        'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14-all.zip'
      )
      fs.writeFileSync(wrapperPath, content)
    }
    return c
  })
}
