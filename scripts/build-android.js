const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const rootDir = path.resolve(__dirname, '..');
const androidDir = path.join(rootDir, 'android');

// Resolve JDK 21 path
let javaHome = process.env.JAVA_HOME;
if (!javaHome || !fs.existsSync(javaHome)) {
  const customJdk = 'C:\\Program Files\\Microsoft\\jdk-21.0.13.21-hotspot';
  if (fs.existsSync(customJdk)) {
    javaHome = customJdk;
  } else {
    const fallbackJdk = path.join(os.homedir(), '.tools', 'jdk-21', 'jdk-21.0.13+9');
    if (fs.existsSync(fallbackJdk)) {
      javaHome = fallbackJdk;
    }
  }
}

// Resolve Android SDK
let androidHome = process.env.ANDROID_HOME;
if (!androidHome || !fs.existsSync(androidHome)) {
  const defaultSdk = path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
  if (fs.existsSync(defaultSdk)) {
    androidHome = defaultSdk;
  }
}

const env = {
  ...process.env,
  ...(javaHome ? { JAVA_HOME: javaHome, PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH}` } : {}),
  ...(androidHome ? { ANDROID_HOME: androidHome, ANDROID_SDK_ROOT: androidHome } : {}),
};

console.log('===> 1. Building Web Client assets...');
execSync('npm run build -w client', { cwd: rootDir, stdio: 'inherit', env });

console.log('\n===> 2. Syncing Capacitor Android assets...');
execSync('npx cap sync android', { cwd: rootDir, stdio: 'inherit', env });

console.log('\n===> 3. Building Signed Android APK with Gradle (assembleRelease)...');
const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
execSync(`${gradlewCmd} assembleRelease`, { cwd: androidDir, stdio: 'inherit', env });

const releaseApk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const rootApk = path.join(rootDir, 'NexusNight.apk');
if (fs.existsSync(releaseApk)) {
  fs.copyFileSync(releaseApk, rootApk);
  const stat = fs.statSync(rootApk);
  const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);
  console.log('\n======================================================');
  console.log('✅ Android Signed Release APK Build Successful!');
  console.log(`📦 Root APK: ${rootApk}`);
  console.log(`📦 Gradle APK: ${releaseApk}`);
  console.log(`📊 File Size: ${sizeMb} MB`);
  console.log('======================================================\n');
} else {
  console.error('\n❌ Error: Output APK not found at expected path:', releaseApk);
  process.exit(1);
}
