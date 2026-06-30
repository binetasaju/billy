/**
 * react-native.config.js
 *
 * Manual dependency declaration for @react-native-ml-kit/text-recognition.
 *
 * WHY: This package is a legacy React Native bridge module. It does NOT have
 * an `expo-module.config.json`, so Expo's autolinking (expo-modules-autolinking)
 * silently skips it. Without this file, TextRecognitionPackage.java is never
 * registered and NativeModules.TextRecognition remains null at runtime.
 *
 * This config tells the React Native Community autolinking layer exactly where
 * to find the package and how to register it in MainApplication.
 */

module.exports = {
  dependencies: {
    '@react-native-ml-kit/text-recognition': {
      platforms: {
        android: {
          sourceDir:
            '../node_modules/@react-native-ml-kit/text-recognition/android',
          packageImportPath:
            'import com.rnmlkit.textrecognition.TextRecognitionPackage;',
          packageInstance: 'new TextRecognitionPackage()',
        },
      },
    },
  },
};
