const sensitiveName = /(?:token|secret|password|passwd|api[_-]?key|private[_-]?key|credential|authorization|client[_-]?secret|토큰|비밀번호)/i;
export const isEnvFile = name => /(?:^|[\\/])(?:\.env(?:[.\w-]*)?|[^\\/]+\.env)$/i.test(name);
export function secretSpans(name, content) {
  const result=[]; let offset=0;
  for (const line of content.split(/(?<=\n)/)) {
    // dotenv assignments and named secrets in code/config files. Values remain in the backing model.
    if(result.length && offset<result.at(-1).end){offset+=line.length;continue;}
    const match=/^(\s*(?:export\s+)?(?:(?:const|let|var)\s+)?["']?([\w.\-\uAC00-\uD7A3]+)["']?\s*[:=]\s*)([\s\S]*)/.exec(line);
    if (match && (isEnvFile(name) || sensitiveName.test(match[2]))) {
      const rhs=match[3].replace(/[\r\n]+$/, ''), quote=rhs[0];
      let start=offset+match[1].length, end=start+rhs.length;
      if (quote==='"' || quote==="'" || quote==='`') { const limit=isEnvFile(name)||quote==='`'?content.length:offset+line.length;let close=start+1;for(;close<limit;close++)if(content[close]===quote&&content[close-1]!=='\\')break;start++;end=Math.min(close,limit); }
      else { const comment=rhs.search(/\s+#/); if(comment>=0)end=start+comment; while(end>start && /[\s;,}]/.test(content[end-1]))end--; }
      if(end>start)result.push({start,end,value:content.slice(start,end)});
    }
    offset+=line.length;
  }
  return result;
}
export function maskDocument(name, content) {
  const spans=secretSpans(name,content); let result=content;
  for(const {start,end} of [...spans].reverse())result=result.slice(0,start)+'***'+result.slice(end);
  return { content:result, count:spans.length };
}
export function redactKnown(text, values) { for(const value of [...values].filter(Boolean).sort((a,b)=>b.length-a.length)) text=text.split(value).join('***'); return text; }
export { sensitiveName };
