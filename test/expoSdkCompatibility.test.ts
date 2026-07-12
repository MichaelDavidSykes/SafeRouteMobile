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
  it('keeps Expo packages aligned with the local Expo Go 54 runtime family', () => {
    const packageJson = readPackageJson();
    const packageLock = readPackageLock();
    const expectedDependencies = {
      '@react-native-async-storage/async-storage': '2.2.0',
      expo: '~54.0.35',
      'expo-constants': '~18.0.13',
      'expo-location': '~19.0.8',
      'expo-secure-store': '~15.0.8',
      'expo-status-bar': '~3.0.9',
      'expo-task-manager': '~14.0.9',
      react: '19.1.0',
      'react-native': '0.81.5',
      'react-native-maps': '1.20.1',
      'react-native-safe-area-context': '~5.6.0'
    };
    const expectedDevDependencies = {
      '@types/react': '~19.1.10',
      'babel-preset-expo': '~54.0.10',
      typescript: '~5.9.2'
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

    assert.equal(packageLock.packages?.['node_modules/expo']?.version, '54.0.35');
    assert.equal(packageLock.packages?.['node_modules/react-native']?.version, '0.81.5');
  });

  it('keeps native config plugins needed by the iOS map preview', () => {
    const expo = readExpoConfig();
    const plugins = expo.plugins.map(pluginName);

    assert.deepEqual(plugins, ['expo-location', 'expo-secure-store']);
    assert.ok(!plugins.includes('expo-status-bar'), 'expo-status-bar should remain a JS-only dependency');
  });
});
