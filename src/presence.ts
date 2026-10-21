import { useSyncExternalStore } from 'react';
import type { PresenceStatus, PresenceOptions } from './types';
let state: PresenceStatus | undefined;
const listeners=new Set<()=>void>();
function receive(next:PresenceStatus){state=next;listeners.forEach(fn=>fn());}
window.luma.onPresence(receive);
void window.luma.presenceStatus().then(receive).catch(()=>{});
export function usePresence(){return useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>state);}
export async function savePresence(patch:Partial<PresenceOptions>){receive(await window.luma.setPresence(patch));}
let metadata:Record<string,unknown>={},timer:ReturnType<typeof setTimeout>|undefined;
export function presenceMetadata(patch:Record<string,unknown>){metadata={...metadata,...patch};if(timer)return;timer=setTimeout(()=>{timer=undefined;void window.luma.presenceUpdate(metadata).catch(()=>{});metadata.userAction=false;},250);}
