// Configuración dinámica: usa app.json como base e inyecta variables de entorno.
// EXPO_PUBLIC_GOOGLE_MAPS_API_KEY se lee de .env en build-time y se pasa al
// plugin react-native-maps (el valor va al AndroidManifest como com.google.android.geo.API_KEY).
const base = require('./app.json');

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const plugins = (base.expo.plugins || []).map((plugin) => {
  if (Array.isArray(plugin) && plugin[0] === 'react-native-maps') {
    return [
      'react-native-maps',
      {
        ...plugin[1],
        androidGoogleMapsApiKey: googleMapsApiKey || 'YOUR_GOOGLE_MAPS_API_KEY',
      },
    ];
  }
  return plugin;
});

module.exports = {
  ...base,
  expo: {
    ...base.expo,
    plugins,
    extra: {
      ...base.expo.extra,
      eas: {
        projectId: '6a9e6519-7fff-4cce-8efd-6c1e433a6ca9',
      },
    },
  },
};