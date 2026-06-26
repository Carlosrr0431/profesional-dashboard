const appJson = require('./app.json');

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
  || process.env.GOOGLE_MAPS_API_KEY
  || '';

module.exports = {
  expo: {
    ...appJson.expo,
    plugins: appJson.expo.plugins || [],
    android: {
      ...appJson.expo.android,
      config: {
        ...(appJson.expo.android?.config || {}),
        googleMaps: { apiKey: googleMapsApiKey },
      },
    },
    ios: {
      ...appJson.expo.ios,
      config: {
        ...(appJson.expo.ios?.config || {}),
        googleMapsApiKey,
      },
    },
  },
};
