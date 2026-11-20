import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(existsSync('canopia-redesign/functions/producto/[id].js')?'canopia-redesign':'.');
const {onRequestGet:productPage}=await import(pathToFileURL(path.join(root,'functions/producto/[id].js')));
const {onRequestGet:categoryPage}=await import(pathToFileURL(path.join(root,'functions/categoria/[id].js')));
const {onRequestGet:sitemap}=await import(pathToFileURL(path.join(root,'functions/sitemap.xml.js')));
const html=readFileSync(path.join(root,'index.html'),'utf8');
const ordinary={id:'maceta',name:'Maceta',category:'grow',price:1000,image:'',stock:4,visible:1};
const restricted={...ordinary,id:'blocked',name:'Tabaco'};
const request=new Request('https://canopiagrow.com/producto/maceta');
const envFor=(product=ordinary)=>({
  ASSETS:{fetch:async()=>new Response(html)},
  canopia_db:{prepare:sql=>({bind(){return this;},first:async()=>product,all:async()=>({results:sql.includes('FROM categories')?[{name:'grow',description:'Cultivo'}]:[ordinary,restricted]})})}
});
test('direct product URLs reject restricted goods before exposing SSR content',async()=>{
  const response=await productPage({request,params:{id:'blocked'},env:envFor(restricted)});
  assert.equal(response.status,301);assert.equal(response.headers.get('Location'),'https://canopiagrow.com/');
});
test('product SSR has first-head critical entrance CSS and root-relative assets',async()=>{
  const response=await productPage({request,params:{id:'maceta'},env:envFor()});
  const body=await response.text();assert.equal(response.status,200);
  assert(body.indexOf('id="entry-critical"')<body.indexOf('</head>'));
  assert(body.indexOf('<base href="/">')<body.indexOf('</head>'));
  assert(body.includes('canopia-ssr-recover'));assert(body.includes('id="canopia-entry"'));
});
test('category SSR does not re-expose quarantined products',async()=>{
  const response=await categoryPage({request,params:{id:'grow'},env:envFor()});
  const body=await response.text();assert.equal(response.status,200);
  assert(!body.includes('/producto/blocked'));assert(body.includes('/producto/maceta'));
  assert(body.indexOf('id="entry-critical"')<body.indexOf('</head>'));
});
test('dynamic sitemap omits quarantined product URLs',async()=>{
  const response=await sitemap({env:envFor()});const xml=await response.text();
  assert.equal(response.status,200);assert(!xml.includes('/producto/blocked'));assert(xml.includes('/producto/maceta'));
});
