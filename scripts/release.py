"""Build with a durable app-specific release key; never print signing secrets."""
from pathlib import Path
import hashlib, json, os, secrets, shutil, subprocess, sys

root=Path(__file__).resolve().parents[1]
java=Path(os.environ.get('JAVA_HOME', '/Applications/Android Studio.app/Contents/jbr/Contents/Home'))
if not (java/'bin/java').exists(): raise SystemExit('Set JAVA_HOME to a JDK 17 or newer installation.')
sdk=Path(os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or Path.home()/'Library/Android/sdk')
tools=sdk/'build-tools/36.0.0'
if not (tools/'apksigner').exists(): raise SystemExit('Set ANDROID_HOME to an Android SDK with Build Tools 36.0.0 installed.')
if '--regenerate-ui' in sys.argv and not os.environ.get('HEXIT_ORIGINAL_APP'):
    raise SystemExit('Set HEXIT_ORIGINAL_APP before using --regenerate-ui.')
keys=root/'keys'
keys.mkdir(mode=0o700,exist_ok=True)
props=keys/'release.properties'
keystore=keys/'hexit-seeker-release.jks'
env=os.environ.copy()
env['JAVA_HOME']=str(java)
env['ANDROID_HOME']=str(sdk)
if not props.exists():
    if keystore.exists(): raise SystemExit('Existing signing key has no properties; restore its credentials. Key was not overwritten.')
    password=secrets.token_urlsafe(36)
    env['HEXIT_KEY_PASSWORD']=password
    subprocess.run([str(java/'bin/keytool'),'-genkeypair','-keystore',str(keystore),'-storetype','PKCS12',
        '-alias','hexit-seeker','-keyalg','RSA','-keysize','4096','-validity','10000',
        '-dname','CN=Hexit Seeker, O=Hexit','-storepass:env','HEXIT_KEY_PASSWORD','-keypass:env','HEXIT_KEY_PASSWORD'],check=True,env=env)
    props.write_text('storeFile=hexit-seeker-release.jks\nkeyAlias=hexit-seeker\nstorePassword='+password+'\nkeyPassword='+password+'\n')
    props.chmod(0o600);keystore.chmod(0o600)
if '--regenerate-ui' in sys.argv:
    for script in ['adapt-ui.py','ranked-ui.py','push-ui.py','web2-ui.py','live-ui.py']:
        subprocess.run(['python3','scripts/'+script],cwd=root,check=True,env=env)
subprocess.run(['npm','run','build'],cwd=root,check=True,env=env)
subprocess.run(['./gradlew',':app:assembleRelease',':app:lintRelease'],cwd=root/'android',check=True,env=env)
apk=root/'deliverables/Hexit-Seeker-0.3.1-signed.apk'
apk.parent.mkdir(parents=True,exist_ok=True)
shutil.copy2(root/'android/app/build/outputs/apk/release/app-release.apk',apk)
result=subprocess.run([str(tools/'apksigner'),'verify','--verbose','--print-certs',str(apk)],check=True,env=env,text=True,capture_output=True)
(root/'deliverables/signature-verification.txt').write_text(result.stdout)
subprocess.run([str(tools/'zipalign'),'-c','-P','16','-v','4',str(apk)],check=True,stdout=subprocess.DEVNULL)
sha=hashlib.sha256(apk.read_bytes()).hexdigest()
(root/'deliverables/SHA256SUMS.txt').write_text(sha+'  '+apk.name+'\n')
print('Release signed and verified:',apk)
print('SHA-256:',sha)
