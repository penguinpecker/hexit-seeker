from pathlib import Path
import json,os,re,subprocess
root=Path(__file__).resolve().parents[1]
props=dict(line.split('=',1) for line in (root/'keys/release.properties').read_text().splitlines())
env=os.environ.copy();env['HEXIT_KEY_PASSWORD']=props['storePassword'];env['JAVA_HOME']='/Applications/Android Studio.app/Contents/jbr/Contents/Home'
out=subprocess.run([env['JAVA_HOME']+'/bin/keytool','-list','-v','-keystore',str(root/'keys/hexit-seeker-release.jks'),'-storepass:env','HEXIT_KEY_PASSWORD'],env=env,check=True,capture_output=True,text=True).stdout
release=re.search(r'SHA256: ([0-9A-F:]+)',out).group(1)
out=subprocess.run(['/Users/pp/Library/Android/sdk/build-tools/36.0.0/apksigner','verify','--print-certs',str(root/'android/app/build/outputs/apk/debug/app-debug.apk')],env=env,check=True,capture_output=True,text=True).stdout
raw=re.search(r'certificate SHA-256 digest: ([0-9a-f]+)',out).group(1)
debug=':'.join(raw[i:i+2] for i in range(0,len(raw),2)).upper()
links=[{'relation':['delegate_permission/common.handle_all_urls'],'target':{'namespace':'android_app','package_name':package,'sha256_cert_fingerprints':[fingerprint]}} for package,fingerprint in [('com.hexit.seeker',release),('com.hexit.seeker.debug',debug)]]
(root/'server/assetlinks.json').write_text(json.dumps(links,indent=2)+'\n')
print('Published public certificate fingerprints for Hexit wallet identity verification.')
