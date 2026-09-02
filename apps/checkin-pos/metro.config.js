// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// SDK 51 ne détecte pas automatiquement le monorepo pnpm comme le fait la
// version d'expo/metro-config utilisée par checkin-mobile (SDK 54) — sans
// ça, les dépendances hoistées à la racine (.npmrc: node-linker=hoisted),
// comme @babel/runtime, ne sont pas résolues.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
