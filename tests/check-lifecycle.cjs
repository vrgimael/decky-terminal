const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync((process.env.DECKY_TERMINAL_BUNDLE || require('path').resolve(__dirname, '../dist/index.js')),'utf8');
const start=source.indexOf('const Terminal = () => {'),end=source.indexOf('\nfunction registerRoutes()',start);
const component=source.slice(start,end);
function harness(options={}){
 let slots=[],index=0,pending=[],dirty=false,tree,id='one',destroyed=false,keyboardListener;
 let timers=new Map(),frames=new Map(),tick=0,listeners=new Map(),output=new Map(),calls=[],instances=[],statuses=new Map(),configGate;
 const nodes=new WeakMap(),doc={visibilityState:'visible',activeElement:null};
 const historyListeners=new Set();
 const history={location:{pathname:'/decky-terminal-focus/terminals/one'},listen(fn){historyListeners.add(fn);return ()=>historyListeners.delete(fn)}};
 const navigate=pathname=>{history.location={pathname};historyListeners.forEach(fn=>fn(history.location,'PUSH'))};
 const win={location:{pathname:'/library/home'},document:doc,SP_REACT:null,getComputedStyle:()=>({visibility:options.pageHidden?'hidden':'visible'}),
 addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},removeEventListener(type,fn){listeners.get(type)?.delete(fn)}};doc.defaultView=win;
 const React={
 useContext(){return options.noRouter?null:{history,location:history.location}},
 useState(value){const n=index++;if(!slots[n])slots[n]={value};return [slots[n].value,next=>{const v=typeof next==='function'?next(slots[n].value):next;if(!Object.is(v,slots[n].value)){slots[n].value=v;dirty=true}}]},
 useRef(value){const n=index++;return (slots[n]??={value:{current:value}}).value},
 useEffect(fn,deps){const n=index++,old=slots[n];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i]))){slots[n]={deps,cleanup:old?.cleanup};pending.push({n,fn})}},
 createElement(type,props,...children){return {type,props:props??{},children}}
 };win.SP_REACT=React;
 const mkNode=()=>({isConnected:true,getClientRects:()=>options.pageHidden?[]:[{}],ownerDocument:doc,tabIndex:0,addEventListener(){},removeEventListener(){},contains(){return false},focus(){doc.activeElement=this},blur(){if(doc.activeElement===this)doc.activeElement=null}});
 class Xterm {
 constructor(){this.options={};this.modes={applicationCursorKeysMode:false};this.rows=10;this.cols=80;this.writes=[];this.inputs=[];this.handlers={};this.resizeCount=0;this.focusCount=0;instances.push(this)}
 open(div){assert(!this.disposed);this.element={};this.textarea=mkNode()}
 loadAddon(addon){this.addon=addon}
 resize(cols,rows){assert(!this.disposed);assert(cols>0&&rows>0);this.cols=cols;this.rows=rows;this.resizeCount++;this.handlers.resize?.({cols,rows})}
 focus(){assert(!this.disposed);this.focusCount++;this.textarea?.focus()}
 blur(){this.textarea?.blur()}
 input(s){assert(!this.disposed);this.inputs.push(s);this.handlers.data?.(s)}
 write(s){assert(!this.disposed);this.writes.push(s)}
 dispose(){this.disposed=true;this.handlers={}}
 onData(fn){this.handlers.data=fn;return {dispose:()=>{delete this.handlers.data}}}
 onResize(fn){this.handlers.resize=fn;return {dispose:()=>{delete this.handlers.resize}}}
 onTitleChange(fn){this.handlers.title=fn;return {dispose:()=>{delete this.handlers.title}}}
 }
 const DFL={useParams:()=>({id}),Focusable:'Focusable',DialogButton:'DialogButton',TextField:'TextField',staticClasses:{},GamepadButton:{DIR_UP:9,DIR_DOWN:10,DIR_LEFT:11,DIR_RIGHT:12,OK:1,CANCEL:2}};
 const manager={IsShowingVirtualKeyboard:{Value:false,Subscribe(fn){keyboardListener=fn;return {Unsubscribe(){if(keyboardListener===fn)keyboardListener=undefined}}}}};
 const call=async(name,...args)=>{calls.push([name,...args]);if(name==='get_config'){if(configGate)return await configGate;return {__version__:1,use_dpad:true}}if(name==='get_terminal')return statuses.get(args[0])??{is_completed:false,title:'Test shell'};if(name==='send_terminal_buffer')output.get('terminal_output#'+args[0])?.('saved output');return true};
 const ctx={window:win,DFL,SP_REACT:React,TerminalRouterContext:{},useTerminalKeyboardManager:()=>manager,xtermExports:{Terminal:Xterm},addonFitExports:{FitAddon:class{proposeDimensions(){return {rows:30,cols:90}}}},call,
 addEventListener:(key,fn)=>{output.set(key,fn);return fn},removeEventListener:(key,fn)=>{if(output.get(key)===fn)output.delete(key)},
 setTimeout:(fn,ms)=>{timers.set(++tick,{fn,ms});return tick},clearTimeout:key=>timers.delete(key),
 requestAnimationFrame:fn=>{frames.set(++tick,fn);return tick},cancelAnimationFrame:key=>frames.delete(key),console:{log(){},warn(){},error(...a){throw Error('component logged error '+a.join(' '))}},XTermCSS:'css',IconDialogButton:'IconDialogButton'};
 for(const name of component.match(/\bFa\w+/g)??[])ctx[name]=name;
 vm.createContext(ctx);vm.runInContext(component+'\n globalThis.RenderTerminal=Terminal;',ctx);
 function commit(node){if(!node||typeof node!=='object')return;const ref=node.props?.ref;if(ref){let el=nodes.get(ref);if(!el){el=node.type==='TextField'?{m_elInput:mkNode()}:mkNode();nodes.set(ref,el)}ref.current=el}node.children?.flat(Infinity).forEach(commit)}
 function render(){assert(!destroyed);dirty=false;index=0;pending=[];tree=ctx.RenderTerminal();commit(tree);const effects=pending;for(const e of effects)slots[e.n].cleanup?.();for(const e of effects)slots[e.n].cleanup=e.fn()}
 async function settle(){for(let i=0;i<30;i++){await Promise.resolve();if(dirty)render()}}
 const flatten=node=>node&&typeof node==='object'?[node,...(node.children??[]).flat(Infinity).flatMap(flatten)]:[];
 const button=text=>flatten(tree).find(n=>n.props?.onClick&&n.children.some(x=>typeof x==='string'&&x.includes(text)));
 function expand(){const b=flatten(tree).find(n=>n.props?.onClick&&flatten(n).some(c=>c.type==='FaExpand'));assert(b,'fullscreen entry available');b.props.onClick()}
 function event(type,extra={}){const e={type,ctrlKey:false,shiftKey:false,altKey:false,metaKey:false,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...extra};for(const fn of [...listeners.get(type)??[]]){fn(e);if(e.stopped)break}return e}
 async function flushFrames(){const f=[...frames.values()];frames.clear();f.forEach(fn=>fn());await settle()}
 async function advanceTimers(){const f=[...timers.values()];timers.clear();f.forEach(t=>t.fn());await settle()}
 function unmount(){destroyed=true;slots.forEach(s=>s?.cleanup?.())}
 return {render,settle,expand,button,event,navigate,flushFrames,advanceTimers,unmount,instances,calls,output,statuses,win,
 setId(v){id=v;navigate('/decky-terminal-focus/terminals/'+v);render()},get tree(){return tree},get historyListenerCount(){return historyListeners.size},get listenerCount(){return [...listeners.values()].reduce((n,s)=>n+s.size,0)},get timerCount(){return timers.size},get frameCount(){return frames.size},get keyboardListener(){return keyboardListener},gateConfig(p){configGate=p}};
}
(async()=>{
 const h=harness();h.render();await h.settle();await h.flushFrames();assert.equal(h.instances.length,1);const x=h.instances[0];assert.equal(h.output.size,1);assert.equal(x.writes[0],'saved output');
 assert.equal(h.win.location.pathname,'/library/home');
 h.event('keydown',{key:'ArrowLeft'});assert.equal(x.inputs.at(-1),'\x1b[D');
 x.input('physical typing');await h.settle();assert(h.calls.some(c=>c[0]==='send_terminal_input'&&c[2]==='physical typing'));
 h.keyboardListener(true);x.input('virtual typing');await h.settle();assert(h.calls.some(c=>c[0]==='send_terminal_input'&&c[2]==='virtual typing'));h.keyboardListener(false);await h.flushFrames();
 console.log('PASS: internal terminal route accepts physical and virtual typing despite browser URL remaining on Home.');
 for(let i=0;i<3;i++){h.expand();await h.settle();await h.flushFrames();assert(h.button('Exit fullscreen'));h.button('Exit fullscreen').props.onClick();await h.settle();await h.flushFrames();assert(!h.button('Exit fullscreen'));assert.equal(h.instances.length,1);assert.equal(h.output.size,1);assert.equal(x.writes[0],'saved output');const e=h.event('keydown',{key:'Escape'});assert(!e.stopped);h.button('Steam navigation active').props.onClick();await h.settle()}
 assert.equal(h.calls.filter(c=>c[0]==='subscribe_terminal').length,1);assert.equal(h.calls.filter(c=>c[0]==='unsubscribe_terminal').length,0);
 console.log('PASS: repeated fullscreen entry/exit keeps one connection and preserves output; exit releases Escape.');
 const beforeOSK=x.focusCount;h.keyboardListener(true);
 assert(!h.event('keydown',{key:'Enter'}).stopped);
 assert(!h.event('vgp_onbuttondown',{detail:{button:2,source:1}}).stopped);
 h.event('pointerdown',{target:{closest:()=>false}});
 h.keyboardListener(false);await h.flushFrames();assert.equal(x.focusCount,beforeOSK+1);
 h.keyboardListener(true);h.button('Terminal input captured').props.onClick();await h.settle();const releasedFocus=x.focusCount;
 h.keyboardListener(false);await h.flushFrames();assert.equal(x.focusCount,releasedFocus);
 h.button('Steam navigation active').props.onClick();await h.settle();
 const duplicateStart=x.inputs.length;
 h.event('vgp_onbuttondown',{detail:{button:10,source:2}});
 h.event('keydown',{key:'ArrowDown'});await h.advanceTimers();assert.equal(x.inputs.length,duplicateStart+1);
 h.event('keyup',{key:'ArrowDown'});
 console.log('PASS: keyboard close restores focus; keyboard controls bypass capture; explicit release respected; overlapping arrows send once.');
 h.event('vgp_onbuttondown',{detail:{button:9,source:2}});const count=x.inputs.length;h.navigate('/library');await h.advanceTimers();assert.equal(x.inputs.length,count);assert.equal(h.win.location.pathname,'/library/home');const homeSends=h.calls.filter(c=>c[0]==='send_terminal_input').length;x.input('background typing');await h.settle();assert.equal(h.calls.filter(c=>c[0]==='send_terminal_input').length,homeSends);let e=h.event('keydown',{key:'Escape'});assert(!e.stopped);const f=x.focusCount;h.keyboardListener(true);h.keyboardListener(false);await h.flushFrames();assert.equal(x.focusCount,f);
 h.navigate('/decky-terminal-focus/terminals/one');e=h.event('keydown',{key:'ArrowUp'});assert(e.stopped);assert.equal(x.inputs.at(-1),'\x1b[A');
 console.log('PASS: navigation away bypasses capture and cancels delayed input/focus; return resumes live terminal.');
 h.expand();await h.settle();h.statuses.set('one',{is_completed:true,exitcode:0});await h.advanceTimers();await h.flushFrames();assert(!h.button('Exit fullscreen'));e=h.event('keydown',{key:'Escape'});assert(!e.stopped);assert(JSON.stringify(h.tree,(key,value)=>key==='ref'?undefined:value).includes('Shell exited (0)'));h.button('Steam navigation active').props.onClick();await h.settle();e=h.event('keydown',{key:'Enter'});assert(!e.stopped);assert.equal(x.writes[0],'saved output');
 console.log('PASS: shell exit leaves fullscreen, reports status, preserves output, and cannot recapture a dead shell.');
 h.setId('two');await h.settle();await h.flushFrames();assert.equal(h.instances.length,2);assert(x.disposed);assert(!h.output.has('terminal_output#one'));assert(h.output.has('terminal_output#two'));e=h.event('keydown',{key:'ArrowDown'});assert(e.stopped);assert.equal(h.instances[1].inputs.at(-1),'\x1b[B');h.unmount();assert.equal(h.listenerCount,0);assert.equal(h.historyListenerCount,0);assert.equal(h.timerCount,0);assert.equal(h.frameCount,0);assert.equal(h.output.size,0);assert(!h.keyboardListener);
 console.log('PASS: terminal-ID change creates fresh session; unmount removes listeners, subscriptions, timers, and frames.');
 const delayed=harness();let resolve;delayed.gateConfig(new Promise(r=>resolve=r));delayed.render();await delayed.settle();delayed.unmount();resolve({__version__:1});await Promise.resolve();await Promise.resolve();assert.equal(delayed.output.size,0);assert.equal(delayed.calls.filter(c=>c[0]==='subscribe_terminal').length,0);assert.equal(delayed.listenerCount,0);
 console.log('PASS: late connection response after unmount cannot subscribe or use disposed xterm.');
 const visible=harness({noRouter:true});visible.render();await visible.settle();visible.instances[0].input('fallback typing');await visible.settle();assert(visible.calls.some(c=>c[0]==='send_terminal_input'&&c[2]==='fallback typing'));visible.unmount();
 const hidden=harness({noRouter:true,pageHidden:true});hidden.render();await hidden.settle();const blocked=hidden.event('keydown',{key:'Escape'});assert(!blocked.stopped);hidden.instances[0].input('hidden typing');await hidden.settle();assert(!hidden.calls.some(c=>c[0]==='send_terminal_input'));hidden.unmount();
 console.log('PASS: missing router export keeps visible-page typing usable and leaves hidden pages uncaptured.');
})().catch(e=>{console.error(e);process.exitCode=1});
