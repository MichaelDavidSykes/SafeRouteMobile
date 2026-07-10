import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type PackageLock = {
  packages?: Record<
    string,
    {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      version?: string;
    }
  >;
};

type ExpoConfig = {
  plugins: Array<string | [string, Record<string, string>]>
};

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync('package.json', 'utf8')) as PackageJson;
}

function readPackageLock(): PackageLock {
  return JSON.parse(readFileSync('package-lock.json', 'utf8')) as PackageLock;
}

function readExpoConfig(): ExpoConfig {
  const resolvedPath = require.resolve('../app.config.js');
  delete require.cache[resolvedPath];

  try {
    return require('../app.config.js').expo as ExpoConfig;
  } finally {
    delete require.cache[resolvedPath];
  }
}

function pluginName(plugin: ExpoConfig['plugins'][number]): string {
  return Array.isArray(plugin) ? plugin[0] : plugin;
}

describe('Expo Go SDK compatibility', () => {
  it('keeps Expo packages aligned with the local Expo Go 56 runtime family', () => {
    const packageJson = readPackageJson();
    const packageLock = readPackageLock();
    const expectedDependencies = {
      '@react-native-async-storage/async-storage': '2.2.0',
      expo: '~56.0.15',
      'expo-constants': '~56.0.20',
      'expo-location': '~56.0.20',
      'expo-secure-store': '~56.0.4',
      'expo-status-bar': '~56.0.4',
      'expo-task-manager': '~56.0.21',
      react: '19.2.3',
      'react-native': '0.85.3',
      'react-native-maps': '1.27.2',
      'react-native-safe-area-context': '~5.7.0'
    };
    const expectedDevDependencies = {
      '@types/react': '~19.2.17',
      'babel-preset-expo': '~56.0.15',
      typescript: '~6.0.3'
    };

    for (const [name, version] of Object.entries(expectedDependencies)) {
      assert.equal(packageJson.dependencies?.[name], version, `${name} should match package.json`);
      assert.equal(
        packageLock.packages?.['']?.dependencies?.[name],
        version,
        `${name} should match package-lock root metadata`
      );
    }

    for (const [name, version] of Object.entries(expectedDevDependencies)) {
      assert.equal(packageJson.devDependencies?.[name], version, `${name} should match package.json`);
      assert.equal(
        packageLock.packages?.['']?.devDependencies?.[name],
        version,
        `${name} should match package-lock root metadata`
      );
    }

    assert.equal(packageLock.packages?.['node_modules/expo']?.version, '56.0.15');
    assert.equal(packageLock.packages?.['node_modules/react-native']?.version, '0.85.3');
  });

  it('keeps native config plugins needed by the iOS map preview', () => {
    const expo = readExpoConfig();
    const plugins = expo.plugins.map(pluginName);

    assert.deepEqual(plugins, ['expo-location', 'expo-secure-store', 'react-native-maps']);
    assert.ok(!plugins.includes('expo-status-bar'), 'expo-status-bar should remain a JS-only dependency');
  });
});
