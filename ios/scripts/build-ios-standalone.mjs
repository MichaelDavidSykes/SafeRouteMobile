import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const buildNumber = process.argv[2];
if (!buildNumber || !/^\d{1,4}(?:\.\d{1,2}){0,2}$/.test(buildNumber)) {
  throw new Error('Supply a new iOS build number, e.g. npm run build:ios:standalone -- 2609.11.1');
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: projectRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Git failed.');
  return result.stdout.trim();
}

if (git('status', '--porcelain')) {
  throw new Error('Commit the source changes first so this build identifies an exact revision.');
}

const revision = git('rev-parse', 'HEAD');
const buildDirectory = resolve(projectRoot, 'build', `ios-${buildNumber}`);
const env = {
  ...process.env,
  CI: '1',
  NODE_ENV: 'production',
  EXPO_NO_DOTENV: '1',
  SAFEROUTE_APP_ENV: 'production',
  SAFEROUTE_PROD_API_URL: 'https://api.lunarchain.net',
  SAFEROUTE_IOS_BUILD_NUMBER: buildNumber,
  SAFEROUTE_SOURCE_REVISION: revision,
  SAFEROUTE_ENABLE_PREVIEW_MODE: 'false',
  SAFEROUTE_ENABLE_DEMO_DRIVE: 'false',
};
delete env.SKIP_BUNDLING;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: projectRoot, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Keep the native Info.plist and embedded Expo configuration on the same build.
run('npx', ['expo', 'prebuild', '--platform', 'ios', '--no-install']);
run('xcodebuild', [
  '-workspace', 'ios/SafeRoute.xcworkspace',
  '-scheme', 'SafeRoute',
  '-configuration', 'Release',
  '-destination', 'generic/platform=iOS',
  '-derivedDataPath', buildDirectory,
  '-allowProvisioningUpdates',
  'build',
]);

console.log(`Built ${buildNumber} from ${revision}`);
console.log(`Install: ${buildDirectory}/Build/Products/Release-iphoneos/SafeRoute.app`);
