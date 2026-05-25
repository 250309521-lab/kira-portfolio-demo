const fs=require('fs'), vm=require('vm');
let elements={};
function el(id){return elements[id]||(elements[id]={id,style:{},className:'',innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){},contains(){return false}},scrollIntoView(){},addEventListener(){},parentNode:{insertBefore(){}}});}
const document={
 getElementById:el,
 querySelectorAll(){return []},
 querySelector(){return el('q')},
 addEventListener(){},
 createElement(){return el('new'+Math.random())},
 activeElement:null
};
const localStorage={getItem(){return null},setItem(){}};
const window={electron:{isElectron:false},addEventListener(){},print(){}};
const ctx={console,document,localStorage,window,setTimeout:(fn)=>fn(),setInterval(){},clearInterval(){},Date,Math,JSON,Number,parseInt,isNaN,confirm(){return true},alert(){},FileReader:function(){},Blob:function(){},URL:{createObjectURL(){return ''},revokeObjectURL(){}},fetch(){return Promise.reject(new Error('no'))},AbortSignal:{timeout(){return {}}},requestAnimationFrame(fn){return setTimeout(fn,0)},cancelAnimationFrame(){}};
vm.createContext(ctx);
const code=fs.readFileSync('/mnt/data/ktp514/app.js','utf8');
try{vm.runInContext(code,ctx,{filename:'app.js'}); console.log('loaded');}catch(e){console.error('LOADERR',e); process.exit()}
try{ctx.currentUser={name:'Malik',role:'admin',avatar:'M',color:'#4a8af4'}; ctx.initApp(); console.log('content length',elements.content.innerHTML.length, elements.content.innerHTML.slice(0,100));}catch(e){console.error('INITERR',e.stack)}
try{ctx.goto('pay'); console.log('pay length',elements.content.innerHTML.length, elements['topbar-title'].textContent)}catch(e){console.error('GOTOERR',e.stack)}
