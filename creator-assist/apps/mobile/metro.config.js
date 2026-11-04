// Expo's default Metro config finds the workspace root by itself (apps/mobile → the
// monorepo), so packages/shared resolves without extra setup.
const { getDefaultConfig } = require("expo/metro-config");

module.exports = getDefaultConfig(__dirname);
