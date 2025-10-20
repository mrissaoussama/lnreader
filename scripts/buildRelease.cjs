#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

function run(cmd, args, opts = {}) {
  console.log('\n> ' + cmd + ' ' + (args || []).join(' '));
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (res.error) {
    console.error('Failed to run', cmd, res.error);
    process.exit(res.status || 1);
  }
  if (res.status !== 0) {
    console.error(`${cmd} exited with code ${res.status}`);
    process.exit(res.status);
  }
}

function main() {
  const root = path.resolve(__dirname, '..');

  // Honor environment variable to skip running Gradle (useful for CI checks/dry-run)
  const skipGradle = !!(
    process.env.LN_BUILD_SKIP_GRADLE || process.env.BUILD_SKIP_GRADLE
  );

  // 1) Run the existing setEnvFile helper (node scripts/setEnvFile.cjs Release)
  run(process.execPath, [path.join(__dirname, 'setEnvFile.cjs'), 'Release'], {
    cwd: root,
  });

  if (skipGradle) {
    console.log(
      '\nSkipping Gradle invocation because LN_BUILD_SKIP_GRADLE or BUILD_SKIP_GRADLE is set.',
    );
    return;
  }

  // 2) Run Gradle in the android directory using the correct wrapper for the platform
  const androidDir = path.join(root, 'android');
  const isWin = process.platform === 'win32';

  try {
    if (isWin) {
      // Use the Gradle batch wrapper on Windows
      // Run via cmd.exe /c so .bat executes correctly in spawnSync
      // Use the relative name 'gradlew.bat' and keep cwd as the android dir
      run('cmd.exe', ['/c', 'gradlew.bat', 'clean'], { cwd: androidDir });
      run('cmd.exe', ['/c', 'gradlew.bat', 'assembleRelease'], {
        cwd: androidDir,
      });
    } else {
      // Use the Unix shell wrapper on macOS/Linux
      // Use shell: true so './gradlew' executes correctly
      run('./gradlew', ['clean'], { cwd: androidDir, shell: true });
      run('./gradlew', ['assembleRelease'], { cwd: androidDir, shell: true });
    }
  } catch (err) {
    console.error('Build failed:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

main();
