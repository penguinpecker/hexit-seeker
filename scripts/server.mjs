import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('web/dist');
const types={'.html':'text/html','.js':'text/javascript','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost'),name=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!name.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try{const data=await readFile(name);res.writeHead(200,{'content-type':types[path.extname(name)]||'application/octet-stream','cache-control':'no-store'}).end(data);}
  catch{res.writeHead(404).end('Not found');}
}).listen(4198,'127.0.0.1',()=>console.log('Hexit Seeker preview: http://127.0.0.1:4198'));
