const fs=require('fs'),assert=require('assert/strict');
const plugin=fs.readFileSync((process.env.DECKY_TERMINAL_BUNDLE || require('path').resolve(__dirname, '../dist/index.js')),'utf8');
const libraries=require('path').join(process.env.STEAM_UI_PATH || require('path').join(require('os').homedir(), '.steam/steam/steamui'), 'libraries')+'/';
if(!fs.existsSync(libraries)){console.log('SKIP: local Steam router integration (Steam not installed)');process.exit(0)}
const filename=fs.readdirSync(libraries).find(name=>name.endsWith('.js')&&fs.readFileSync(libraries+name,'utf8').includes('49519:('));assert(filename);
const source=fs.readFileSync(libraries+filename,'utf8');
const start=source.indexOf('49519:('),moduleText=source.slice(start);
assert(moduleText.slice(0,400).includes('XZ:()=>D0'),'installed router exports its context');
const creator=moduleText.match(/W0=(function\(\w+\)\{var \w+=s0\(\);return \w+\.displayName=\w+,\w+\})/);assert(creator,'Steam context naming initializer');
const makeContext=new Function('s0','return ('+creator[1]+');')(()=>({Provider:{},Consumer:{}}));
const route=makeContext('Router'),history=makeContext('Router-History');
const a=plugin.indexOf('const TerminalRouterContext ='),b=plugin.indexOf('const Terminal =',a);let selected;
const React={createContext:()=>({fallback:true})};
const DFL={findModuleExport(predicate){selected=[{displayName:'Router'},history,()=>({history:{}}),route].find(predicate);return selected}};
const context=new Function('DFL','SP_REACT',plugin.slice(a,b)+'return TerminalRouterContext;')(DFL,React);assert.equal(context,route);assert.equal(selected,route);
const fallback=new Function('DFL','SP_REACT',plugin.slice(a,b)+'return TerminalRouterContext;')({},React);assert(fallback.fallback);
const terminal=plugin.slice(b,plugin.indexOf('function registerRoutes()',b));assert(!terminal.includes('window.location.pathname'),'terminal guard must never use browser pathname');
console.log('PASS: installed router context initializer and export verified; exact Router context selected; non-contexts rejected; missing-export fallback safe; browser-path dependency absent.');
