import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const javaHome = process.env.JAVA_HOME;
const sdk = process.env.ANDROID_HOME;
if (!javaHome || !sdk) throw new Error('Use npm run android:apk para configurar o ambiente.');
const tool = (name) => join(sdk, 'build-tools', '36.0.0', name);
const signingDirectory = join(homedir(), '.local', 'share', 'steakup', 'signing');
const credentialsFile = join(signingDirectory, 'release-signing.json');
await mkdir(signingDirectory, { recursive: true, mode: 0o700 });
function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, { env: { ...process.env, ...extraEnv }, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Falha na etapa ${command.split(/[\\/]/).at(-1)}. Verifique as ferramentas de compilação e os arquivos de assinatura locais.`);
  return result.stdout;
}
let credentials;
if (existsSync(credentialsFile)) {
  credentials = JSON.parse(await readFile(credentialsFile, 'utf8'));
  if (!existsSync(credentials.keystore)) throw new Error('Chave de assinatura ausente. Restaure seu backup; uma nova chave não atualizaria o APK já instalado.');
} else {
  const keystore = join(signingDirectory, 'steakup-release.jks');
  if (existsSync(keystore)) throw new Error('Já existe uma chave sem configuração. Preserve-a e restaure os dados de assinatura.');
  credentials = { keystore, alias: 'steakup', password: randomBytes(32).toString('base64url') };
  await writeFile(credentialsFile, JSON.stringify(credentials, null, 2), { flag: 'wx', mode: 0o600 });
  run(join(javaHome, 'bin', 'keytool.exe'), ['-genkeypair', '-keystore', keystore, '-storetype', 'JKS', '-alias', credentials.alias,
    '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=SteakUp, OU=Mobile, O=SteakUp, C=BR',
    '-storepass:env', 'STEAKUP_SIGNING_PASSWORD', '-keypass:env', 'STEAKUP_SIGNING_PASSWORD'],
  { STEAKUP_SIGNING_PASSWORD: credentials.password });
  console.log('Chave de produção criada fora do projeto. Faça backup privado da pasta de assinatura.');
}
const unsigned = resolve('android/app/build/outputs/apk/release/app-release-unsigned.apk');
const aligned = resolve('android/app/build/outputs/apk/release/app-release-aligned.apk');
const signed = resolve('android/app/build/outputs/apk/release/SteakUp-1.0.5.apk');
run(tool('zipalign.exe'), ['-f', '-P', '16', '4', unsigned, aligned]);
const signer = ['-jar', tool('lib/apksigner.jar')];
run(join(javaHome, 'bin', 'java.exe'), [...signer, 'sign', '--ks', credentials.keystore, '--ks-key-alias', credentials.alias,
  '--ks-pass', 'env:STEAKUP_SIGNING_PASSWORD', '--key-pass', 'env:STEAKUP_SIGNING_PASSWORD', '--out', signed, aligned],
{ STEAKUP_SIGNING_PASSWORD: credentials.password });
console.log(run(join(javaHome, 'bin', 'java.exe'), [...signer, 'verify', '--verbose', '--print-certs', signed]));
run(tool('zipalign.exe'), ['-c', '-P', '16', '4', signed]);
console.log(`APK de produção assinado e verificado: ${signed}`);
