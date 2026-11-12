// Metro config: Expo defaults, but skip the native build folders.
// Without watchman, Metro's file watcher walks every folder it can see. The
// Gradle/Xcode output under android/ and ios/ is thousands of folders with no
// JS in them, and on a busy machine it made the watcher time out
// ("Failed to start watch mode").
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const escape = (p) => p.replace(/[/\\^$.*+?()[\]{}|]/g, '\\$&');
const skip = [
  path.join(__dirname, 'android'),
  path.join(__dirname, 'ios'),
  path.join(__dirname, 'modules', '[^/]+', 'android', 'build'),
].map((dir) => new RegExp(`^${escape(dir).replace(escape('[^/]+'), '[^/]+')}(/.*)?$`));

const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...skip,
];

module.exports = config;
