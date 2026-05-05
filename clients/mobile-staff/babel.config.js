/**
 * Babel config — Expo SDK 53 표준.
 *
 * `babel-preset-expo` 만 포함. 별도 plugin 불필요.
 * 출처: clients/mobile/babel.config.js (Mobile v4 와 동일).
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
