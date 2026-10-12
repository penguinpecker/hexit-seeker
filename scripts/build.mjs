import {build} from 'esbuild';
import {mkdirSync,cpSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildTable,keySig,sigKey,MIX} from '../pricing/src/index.ts';

const tables=MIX.map(([k])=>{const requested=k*.45,t=buildTable(keySig(sigKey(requested)));return {...t,requested,edges:[...t.edges],w:[...t.w]};});
let deployment={};try{deployment=JSON.parse(readFileSync('deployment.json','utf8'));}catch{}
const API=process.env.HEXIT_API||deployment.api||'http://127.0.0.1:8789';
writeFileSync('web/src/tables.json',JSON.stringify(tables));
mkdirSync('web/dist',{recursive:true});
for(const [entry,out] of [['chain','hexit-chain'],['avatars','avatars'],['quotes.worker','quotes.worker']]){
  await build({entryPoints:[`web/src/${entry}.ts`],outfile:`web/dist/${out}.js`,bundle:true,format:'iife',platform:'browser',target:'es2020',minify:true,legalComments:'eof',define:{__HEXIT_API__:JSON.stringify(API)}});
}
for(const name of ['fonts','icons','vendor','index.html','manifest.webmanifest'])cpSync(`web/${name}`,`web/dist/${name}`,{recursive:true});
mkdirSync('android/app/src/main/assets',{recursive:true});
cpSync('web/dist','android/app/src/main/assets/www',{recursive:true});
// Optional maintainer check; a public checkout builds from its own assets.
const original=process.env.HEXIT_ORIGINAL_APP;
const files=['fonts/inter-latin.woff2','fonts/material-symbols-hexit.woff2','fonts/space-grotesk-latin.woff2','icons/icon-512.png','icons/icon-192.png','vendor/qrcode.min.js'];
if(original){
const assets=files.map(file=>{const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');return{file,original:sha(`${original}/${file}`),seeker:sha(`web/${file}`)};});
if(assets.some(a=>a.original!==a.seeker))throw new Error('Original asset changed');
mkdirSync('deliverables',{recursive:true});
writeFileSync('deliverables/asset-parity.json',JSON.stringify(assets,null,2)+'\n');
console.log('Original fonts, icons and QR assets match byte for byte.');
}
console.log('Built Hexit Seeker web assets and Android bundle.');
