const fs=require('fs'),assert=require('assert/strict');
const steamPath=process.env.STEAM_UI_PATH || require('path').join(require('os').homedir(), '.steam/steam/steamui');
if(!fs.existsSync(require('path').join(steamPath,'sp.js'))){console.log('SKIP: local Steam export integration (Steam not installed)');process.exit(0)}
const steam=fs.readFileSync(require('path').join(steamPath,'sp.js'),'utf8');
const plugin=fs.readFileSync((process.env.DECKY_TERMINAL_BUNDLE || require('path').resolve(__dirname, '../dist/index.js')),'utf8');
const manager={IsShowingVirtualKeyboard:{Value:false}};
function loadModule(id,nextId,deps){
 const marker=id+':((je,te,t)=>{',start=steam.indexOf(marker);
 assert(start>=0,'module present '+id);
 const end=steam.indexOf('}),'+nextId+':',start);assert(end>start);
 const exported={};const requireModule=id=>deps[id]??{};
 requireModule.d=(exports,getters)=>{for(const [name,get] of Object.entries(getters))Object.defineProperty(exports,name,{get,enumerable:true})};
 new Function('je','te','t',steam.slice(start+marker.length,end))({},exported,requireModule);
 return exported;
}
const contextModule=loadModule(29827,57531,{63696:{createContext:()=>({}),useContext:()=>({VirtualKeyboardManager:manager})}});
const hookModule=loadModule(83571,25538,{63696:{createContext:()=>({})},29827:contextModule});
const moduleExports=[...Object.values(contextModule),...Object.values(hookModule)];
const begin=plugin.indexOf('const useTerminalKeyboardManager ='),end=plugin.indexOf('const TerminalRouterContext =',begin);
let matches;
const DFL={findModuleExport(predicate){matches=moduleExports.filter(predicate);return matches[0]}};
const selected=new Function('DFL',plugin.slice(begin,end)+'return useTerminalKeyboardManager;')(DFL);
assert.equal(matches.length,1);assert.equal(selected,hookModule.D7);assert.equal(selected(),manager);
// Reproduce the old failure against the actual provider, then verify rejection.
const provider=contextModule.ER;assert.throws(()=>provider(),/instance/);assert(!matches.includes(provider));
const missing=new Function('DFL',plugin.slice(begin,end)+'return useTerminalKeyboardManager;')({findModuleExport:()=>undefined});assert.equal(missing(),undefined);
console.log('PASS: actual Steam export scan selects exactly the context hook; crashing provider rejected; absent export safe.');
// Visibility, routing, and pointer integration are exercised by check-lifecycle.cjs.
