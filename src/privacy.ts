import { useSyncExternalStore } from 'react';
import { maskDocument, redactKnown, secretSpans } from '../shared/secrets.mjs';
import type { PrivacyStatus } from './types';
let state: PrivacyStatus={mode:'always',active:true,clients:[],detecting:true};
const listeners=new Set<()=>void>(), values=new Set<string>();
window.luma.onPrivacy(status=>{state=status;listeners.forEach(fn=>fn());});
void window.luma.privacyStatus().then(status=>{state=status;listeners.forEach(fn=>fn());});
export const usePrivacy=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>state);
export function rememberSecrets(name:string,content:string){for(const s of secretSpans(name,content))if(s.value.length>=4)values.add(s.value);}
export const protectedDocument=(name:string,content:string)=>maskDocument(name,content);
export const privateText=(text:string)=>state.active?maskDocument('output.txt',redactKnown(text,values)).content:text;
export const privacyActive=()=>state.active;
