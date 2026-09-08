// react-native-reanimated v4 (used by @shopify/react-native-skia for the
// countdown ring) needs its worklets transform wired in explicitly — the
// zero-config Expo babel setup does not add third-party plugins on its own.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
