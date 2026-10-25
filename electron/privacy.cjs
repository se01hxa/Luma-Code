const { execute, systemPS } = require('./runtimes.cjs');
const path = require('node:path');
const CLIENTS=/^(?:discord(?:canary|ptb|development)?|vesktop|vencord|equicord|armcord|legcord)(?:\.exe)?$/i;
async function createPrivacy(getConfig, emit, scanner) {
  const {secretSpans,maskDocument,redactKnown,sensitiveName}=await import('../shared/secrets.mjs');
  const values=new Set(); let clients=[], detecting=true, stopped=false, timer, busy=false;
  let active=true, sharing=false;
  const status=()=>({mode:getConfig().mode || 'always',active,clients,detecting,sharing});
  const update=()=>{const mode=getConfig().mode || 'always'; const next=mode==='always'||(mode==='sharing'&&sharing)||(mode==='auto'&&(detecting||clients.length>0)); const changed=next!==active;active=next;emit('privacy:changed',{...status(),changed});return status();};
  for(const [name,value] of Object.entries(process.env))if(sensitiveName.test(name)&&value?.length>=4)values.add(value);
  const observe=(name,content)=>{for(const s of secretSpans(name,content))if(s.value.length>=4&&s.value.length<=8192)values.add(s.value);};
  const redact=text=>active?maskDocument('output.txt',redactKnown(text,values)).content:text;
  const poll=async()=>{if(stopped||busy)return;busy=true;try{const names=scanner?await scanner():await execute(systemPS(),['-NoProfile','-NonInteractive','-Command',"Get-Process -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName -Unique"],process.env,4000).then(r=>r.code===0?r.output.split(/\r?\n/):null);if(names){clients=[...new Set(names.filter(n=>CLIENTS.test(n.trim())).map(n=>n.trim()))];detecting=false;}else detecting=true;}catch{detecting=true;}finally{busy=false;if(!stopped)update();}};
  // Match suffixes against known secret prefixes so a token split over terminal chunks cannot leak.
  const stream=()=>{let pending='';return {push(data,final=false){if(!active){pending='';return data;}pending+=data;pending=pending.replace(/\x1b\[[0-9;]*m/g,'');const incomplete=pending.lastIndexOf('\x1b');let escapeTail='';if(!final&&incomplete>=0&&!/[A-Za-z]/.test(pending.slice(incomplete+2))){escapeTail=pending.slice(incomplete);pending=pending.slice(0,incomplete);}pending=redactKnown(pending,values);let hold=0;if(!final)for(const value of values)for(let n=Math.min(value.length-1,pending.length);n>hold;n--)if(pending.endsWith(value.slice(0,n))){hold=n;break;}const safe=pending.slice(0,pending.length-hold);pending=pending.slice(pending.length-hold)+escapeTail;return redact(safe);},reset(){pending='';}};};
  return {status,update,setSharing:value=>{sharing=value===true;return update();},observe,redact,redactAlways:text=>maskDocument('output.txt',redactKnown(text,values)).content,stream,maskDocument,async start(){update();await poll();timer=setInterval(poll,2500);timer.unref();},stop(){stopped=true;clearInterval(timer);},poll,CLIENTS};
}
module.exports={createPrivacy,CLIENTS};
