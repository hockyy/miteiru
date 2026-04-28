const fs = require('fs-extra');
const path = require('path');
const {spawnSync} = require('child_process');

const rootDir = path.join(__dirname, '..');
const projectDir = path.join(rootDir, 'native', 'live-captions');
const projectPath = path.join(projectDir, 'LiveCaptionsBridge.csproj');
const publishDir = path.join(projectDir, 'bin', 'Release', 'net8.0-windows', 'win-x64', 'publish');
const resourcesDir = path.join(rootDir, 'resources', 'live-captions');

if (process.platform !== 'win32') {
  console.log('Skipping Live Captions helper build: Windows-only feature.');
  process.exit(0);
}

const dotnetCheck = spawnSync('dotnet', ['--version'], {
  encoding: 'utf8',
  shell: true
});

if (dotnetCheck.error || dotnetCheck.status !== 0) {
  console.error([
    'Unable to build the Windows Live Captions helper because the .NET SDK was not found.',
    '',
    'Install .NET SDK 8.0 or newer, then re-run this command:',
    '  https://dotnet.microsoft.com/en-us/download',
    '',
    'After installation, verify it is available with:',
    '  dotnet --version'
  ].join('\n'));
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

fs.emptyDirSync(resourcesDir);
fs.copySync(publishDir, resourcesDir);
fs.ensureFileSync(path.join(resourcesDir, '.gitkeep'));

console.log(`Live Captions helper copied to ${resourcesDir}`);
