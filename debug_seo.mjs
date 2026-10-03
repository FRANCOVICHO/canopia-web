import { buildProductHtml, escapeHtml, truncate } from './functions/_lib/seo.js';

// Case: description="<", how does it appear in the output?
const p = {id:" ",name:" ",description:"<",price:0,image:"",category:"",tag:"",visible:0,updated_at:""};
const html = buildProductHtml(p, "");
const htmlHead = html.slice(0, html.indexOf('<script type="application/ld+json">'));

console.log('description:', JSON.stringify(p.description));
console.log('escapeHtml(description):', JSON.stringify(escapeHtml(p.description)));
// where does &lt; appear in the head?
const ltIdx = htmlHead.indexOf('&lt;');
console.log('&lt; found at:', ltIdx);
if (ltIdx >= 0) {
  console.log('Context:', JSON.stringify(htmlHead.slice(ltIdx - 30, ltIdx + 30)));
}
// check meta description tag
const descIdx = htmlHead.indexOf('name="description"');
console.log('\nmeta description tag:');
console.log(htmlHead.slice(descIdx, descIdx + 80));

// Now try a multi-char description with <
const p2 = {id:"x",name:"Test",description:"Hello <World>",price:10,image:"img.jpg",category:"Cat",tag:"",visible:1,updated_at:""};
const html2 = buildProductHtml(p2, "");
const head2 = html2.slice(0, html2.indexOf('<script type="application/ld+json">'));
const descIdx2 = head2.indexOf('name="description"');
console.log('\nMulti-char description with <:');
console.log(head2.slice(descIdx2, descIdx2 + 100));
console.log('escapeHtml("Hello <World>"):', escapeHtml("Hello <World>"));
console.log('html2.includes(escapeHtml("Hello <World>")):', html2.includes(escapeHtml("Hello <World>")));
