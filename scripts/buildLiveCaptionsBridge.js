const fs = require('fs-extra');
const path = require('path');
const {spawnSync} = require('child_process');

const rootDir = path.join(__dirname, '..');
const projectDir = path.join(rootDir, 'native', 'live-captions');
const projectPath = path.join(projectDir, 'LiveCaptionsBridge.csproj');
const publishDir = path.join(projectDir, 'bin', 'Release', 'net8.0-windows', 'win-x64', 'publish');
const resourcesDir = path.join(rootDir, 'resources', 'live-captions');
const macSourcePath = path.join(projectDir, 'mac', 'main.m');
const macOutputPath = path.join(projectDir, 'mac', 'MiteiruLiveCaptionsBridge');
const macResourcesPath = path.join(resourcesDir, 'MiteiruLiveCaptionsBridge');
const winResourcesPath = path.join(resourcesDir, 'MiteiruLiveCaptionsBridge.exe');
const ifNeeded = process.argv.includes('--if-needed');

const copyMacHelperToResources = (fromPath) => {
  fs.emptyDirSync(resourcesDir);
  fs.copySync(fromPath, macResourcesPath);
  fs.chmodSync(macResourcesPath, 0o755);
  fs.ensureFileSync(path.join(resourcesDir, '.gitkeep'));
  spawnSync('xattr', ['-cr', macResourcesPath], {stdio: 'ignore'});
  console.log(`Live Captions helper copied to ${resourcesDir}`);
};

const copyWindowsHelperToResources = () => {
  fs.emptyDirSync(resourcesDir);
  fs.copySync(publishDir, resourcesDir);
  fs.ensureFileSync(path.join(resourcesDir, '.gitkeep'));
  console.log(`Live Captions helper copied to ${resourcesDir}`);
};

const isMacHelperFresh = () => (
  fs.existsSync(macOutputPath)
  && fs.existsSync(macResourcesPath)
  && fs.statSync(macOutputPath).mtimeMs >= fs.statSync(macSourcePath).mtimeMs
);

const buildWindowsHelper = () => {
  if (ifNeeded && fs.existsSync(winResourcesPath)) {
    console.log('Windows Live Captions helper already built.');
    return;
  }

  const dotnetCheck = spawnSync('dotnet', ['--version'], {
    encoding: 'utf8',
    shell: true
  });

  if (dotnetCheck.error || dotnetCheck.status !== 0) {
    const message = [
      'Unable to build the Windows Live Captions helper because the .NET SDK was not found.',
      '',
      'Install .NET SDK 8.0 or newer, then re-run this command:',
      '  https://dotnet.microsoft.com/en-us/download',
      '',
      'After installation, verify it is available with:',
      '  dotnet --version'
    ].join('\n');

    if (ifNeeded) {
      console.log(message);
      return;
    }

    console.error(message);
    process.exit(1);
  }

  spawnSync('taskkill', ['/IM', 'MiteiruLiveCaptionsBridge.exe', '/F'], {
    stdio: 'ignore',
    shell: true
  });

  const publish = spawnSync('dotnet', [
    'publish',
    projectPath,
    '-c',
    'Release',
    '-r',
    'win-x64',
    '--self-contained',
    'false',
    '-o',
    publishDir
  ], {
    stdio: 'inherit',
    shell: true
  });

  if (publish.status !== 0) {
    process.exit(publish.status ?? 1);
  }

  copyWindowsHelperToResources();
};

const buildMacHelper = () => {
  if (ifNeeded && isMacHelperFresh()) {
    console.log('macOS Live Captions helper is up to date.');
    return;
  }

  const compile = spawnSync('clang', [
    '-fobjc-arc',
    '-O2',
    '-o',
    macOutputPath,
    macSourcePath,
    '-framework',
    'Foundation'
  ], {
    stdio: 'inherit'
  });

  if (compile.status !== 0) {
    console.error('Unable to build the macOS Live Captions helper with clang.');
    process.exit(compile.status ?? 1);
  }

  fs.chmodSync(macOutputPath, 0o755);
  spawnSync('xattr', ['-cr', macOutputPath], {stdio: 'ignore'});
  copyMacHelperToResources(macOutputPath);
};

if (process.platform === 'win32') {
  buildWindowsHelper();
} else if (process.platform === 'darwin') {
  buildMacHelper();
} else {
  console.log('Skipping Live Captions helper build: Windows and macOS only.');
  process.exit(0);
}
