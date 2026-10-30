const net = require('node:net');
const { randomUUID } = require('node:crypto');
const DEFAULTS = { enabled: false, applicationId: '1562471621191540817', showProject: true, showFile: true, showPosition: true, showMouse: true, hideSensitive: true, pipe: 'auto' };
const LOGO = 'https://raw.githubusercontent.com/sua1dev/Vexel/main/assets/icon.png';
const text = (value, max = 128) => [...String(value || '').replace(/[\x00-\x1f\x7f]/g, ' ').trim()].slice(0, max).join('');
const base = value => text(String(value || '').replace(/\\/g, '/').split('/').pop());
const number = value => Number.isSafeInteger(value) && value > 0 && value <= 10000000 ? value : 0;
function options(input = {}) {
  const result = { ...DEFAULTS };
  for (const key of ['enabled','showProject','showFile','showPosition','showMouse','hideSensitive']) if (typeof input[key] === 'boolean') result[key] = input[key];
  if (input.applicationId !== undefined) { if (!/^\d{17,20}$/.test(input.applicationId)) throw Error('Application ID는 17~20자리 숫자여야 합니다.'); result.applicationId = input.applicationId; }
  if (input.pipe !== undefined) { if (!/^(auto|[0-9])$/.test(input.pipe)) throw Error('올바른 Discord 연결 번호를 선택해주세요.'); result.pipe = input.pipe; }
  return result;
}
function activity(meta = {}, prefs = DEFAULTS, start = Math.floor(Date.now()/1000)) {
  const file = base(meta.file), hidden = prefs.hideSensitive && (meta.sensitive || /(^\.env(?:\.|$)|\.env$|\.pem$|\.key$)/i.test(file));
  const project = prefs.showProject && !hidden ? text(base(meta.project),32) : '';
  const details = hidden ? '보호된 파일 작업 중' : prefs.showFile && file ? `${meta.editing ? '편집 중' : '살펴보는 중'} · ${file}` : 'Vexel에서 작업 중';
  const parts = project ? [project] : [];
  if (!hidden && file && prefs.showPosition && number(meta.line)) parts.push(`커서 ${number(meta.line)}:${number(meta.column)||1}`);
  if (!hidden && file && prefs.showPosition && number(meta.editLine)) parts.push(`수정 ${number(meta.editLine)}줄`);
  if (!hidden && file && prefs.showMouse) parts.push(number(meta.mouseLine) ? `마우스 ${number(meta.mouseLine)}:${number(meta.mouseColumn)||1}` : '마우스 편집기 밖');
  return { type: 0, details: text(details), state: text(parts.join(' · ') || (hidden ? '파일 정보 숨김' : '프로젝트를 여는 중')), timestamps: { start }, assets: { large_image: LOGO, large_text: 'Vexel' }, instance: false };
}
function frame(op, data) { const body=Buffer.from(JSON.stringify(data)), result=Buffer.alloc(body.length+8);result.writeUInt32LE(op,0);result.writeUInt32LE(body.length,4);body.copy(result,8);return result; }
function createPresence({ getOptions, onChange = () => {}, connect = p => net.createConnection(p), pipePath = i => `\\\\.\\pipe\\discord-ipc-${i}`, interval = 15000, retry = 10000, idle = 300000 } = {}) {
  let socket, buffer=Buffer.alloc(0), reconnect, tick, timeout, stopped=true, ready=false, index=0, configured='', meta={}, touched=Date.now(), start=Math.floor(Date.now()/1000), lastSent=0, previous='', pending, acknowledged=null, status='disabled', error='';
  const prefs=()=>options(getOptions?.() || {});
  const snapshot=()=>({options:prefs(),status,error,preview:activity(meta,prefs(),start),lastActivity:acknowledged});
  const emit=()=>onChange(snapshot());
  function write(op,data){if(socket&&!socket.destroyed)socket.write(frame(op,data));}
  function send(force=false, clear=false) {
    if(!ready || pending)return;
    const value=clear || Date.now()-touched>idle ? null : activity(meta,prefs(),start), key=JSON.stringify(value);
    if(!force && (Date.now()-lastSent<interval || key===previous))return;
    const nonce=randomUUID(); pending={nonce,value,key};lastSent=Date.now();
    write(1,{cmd:'SET_ACTIVITY',args:{pid:process.pid,activity:value},nonce});
    clearTimeout(timeout);timeout=setTimeout(()=>socket?.destroy(),10000);timeout.unref?.();
  }
  function schedule(){clearTimeout(reconnect);if(!stopped)reconnect=setTimeout(open,retry);reconnect?.unref?.();}
  function open(){
    if(stopped)return;const p=prefs();if(!p.enabled){status='disabled';emit();return;}
    const selected=p.pipe==='auto'?index:Number(p.pipe);status='connecting';emit();
    let s;try{s=connect(pipePath(selected));}catch{index=(index+1)%10;schedule();return;}
    socket=s;buffer=Buffer.alloc(0);ready=false;pending=null;
    timeout=setTimeout(()=>s.destroy(),5000);timeout.unref?.();
    s.on('connect',()=>write(0,{v:1,client_id:p.applicationId}));
    s.on('data',chunk=>{
      if(socket!==s)return;buffer=Buffer.concat([buffer,chunk]);
      try{while(buffer.length>=8){const op=buffer.readUInt32LE(0),len=buffer.readUInt32LE(4);if(len>1024*1024)throw Error('잘못된 RPC 응답');if(buffer.length<len+8)break;const payload=buffer.subarray(8,8+len);buffer=buffer.subarray(8+len);const data=JSON.parse(payload.toString());
        if(op===3){write(4,data);continue;}if(op===2){error='Discord가 연결을 종료했습니다. Application ID를 확인해주세요.';s.destroy();break;}
        if(op!==1)continue;
        if(data.evt==='READY'){clearTimeout(timeout);ready=true;status='connected';error='';previous='';lastSent=0;emit();send(true);}
        else if(data.nonce===pending?.nonce){clearTimeout(timeout);if(data.evt==='ERROR'){status='error';error='Discord 활동 등록 실패: '+text(data.data?.message,180);}else{acknowledged=pending.value;previous=pending.key;status='connected';error='';}pending=null;emit();}
      }}catch{s.destroy();}
    });
    s.on('error',()=>{});
    s.on('close',()=>{if(socket!==s)return;clearTimeout(timeout);ready=false;pending=null;socket=null;if(stopped)return;status='waiting';if(!error)error='Discord 데스크톱 또는 RPC 지원 클라이언트를 기다리는 중입니다.';emit();index=(index+1)%10;clearTimeout(reconnect);reconnect=setTimeout(open,p.pipe==='auto'&&index!==0?250:retry);reconnect.unref?.();});
  }
  function stop(){stopped=true;clearTimeout(reconnect);clearTimeout(timeout);clearInterval(tick);if(ready)write(1,{cmd:'SET_ACTIVITY',args:{pid:process.pid,activity:null},nonce:randomUUID()});const old=socket;socket=null;old?.end();const kill=setTimeout(()=>old?.destroy(),200);kill.unref?.();ready=false;pending=null;acknowledged=null;status='disabled';error='';emit();}
  function configure(force=false){const p=prefs(),key=JSON.stringify([p.enabled,p.applicationId,p.pipe]);if(force||configured!==key){stop();configured=key;if(p.enabled){stopped=false;index=0;open();tick=setInterval(()=>send(),1000);tick.unref?.();}}else send();emit();return snapshot();}
  function update(value={}){const next={project:base(value.project),file:base(value.file),line:number(value.line),column:number(value.column),editLine:number(value.editLine),mouseLine:number(value.mouseLine),mouseColumn:number(value.mouseColumn),editing:!!value.editing,sensitive:!!value.sensitive};if(value.userAction||JSON.stringify(next)!==JSON.stringify(meta))touched=Date.now();meta=next;send();emit();return snapshot();}
  return { configure, update, status:snapshot, stop };
}
module.exports={DEFAULTS,LOGO,options,activity,frame,createPresence};
