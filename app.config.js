// Config dinámica de Expo (reemplaza a app.json).
// 1) La API key de Google Maps se inyecta desde el entorno de build
//    (EXPO_PUBLIC_GOOGLE_MAPS_API_KEY, disponible en EAS) para que el plugin de
//    react-native-maps la escriba en el AndroidManifest. Sin key real, el mapa
//    PROVIDER_GOOGLE se renderiza en negro en el APK.
// 2) allowBackup: false -> al desinstalar la app, Android NO restaura los datos
//    (AsyncStorage) desde Google Drive. Así, en cada instalación limpia la app
//    vuelve a mostrar el tour inicial y el panel de permisos.
// 3) POST_NOTIFICATIONS: necesario en Android 13+ para poder solicitar el
//    permiso de notificaciones (sin esto, el switch queda denegado para siempre).
const mapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

module.exports = {
  expo: {
    name: 'app-security',
    slug: 'app-security',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon-ring.png',
    scheme: 'appsecurity',
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: 'com.secureos.mobile',
      icon: './assets/images/icon-ring.png',
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'SECURE_OS utiliza tu ubicación para enviar tus coordenadas GPS en casos de emergencia.',
        NSCameraUsageDescription:
          'SECURE_OS usa la cámara para capturas de evidencia y verificación.',
        NSMicrophoneUsageDescription:
          'SECURE_OS usa el micrófono para la transcripción de voz y llamadas tácticas.',
        NSPhotoLibraryUsageDescription:
          'SECURE_OS accede a tu galería para elegir avatares y fondos de perfil.',
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#121214',
        foregroundImage: './assets/images/icon-ring-foreground.png',
        backgroundImage: './assets/images/icon-ring-background.png',
        monochromeImage: './assets/images/icon-ring-foreground.png',
      },
      predictiveBackGestureEnabled: false,
      allowBackup: false,
      permissions: [
        'android.permission.CAMERA',
        'android.permission.RECORD_AUDIO',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.POST_NOTIFICATIONS',
      ],
      package: 'com.secureos.mobile',
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#0c0c0d',
          image: './assets/images/splash-icon.png',
          imageWidth: 160,
        },
      ],
      [
        'expo-dev-client',
        {
          launchMode: 'most-recent',
        },
      ],
      'expo-camera',
      'expo-location',
      'expo-image-picker',
      [
        'react-native-maps',
        {
          ...(mapsApiKey ? { androidGoogleMapsApiKey: mapsApiKey } : {}),
        },
      ],
      'expo-font',
      'expo-video',
      'expo-audio',
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
  },
};