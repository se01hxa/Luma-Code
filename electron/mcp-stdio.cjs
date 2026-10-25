const index=process.argv.indexOf('--bridge');
if(index<0||!process.argv[index+1]){process.stderr.write('Vexel MCP 연결 파일이 필요합니다.\n');process.exitCode=1;}
else require('./mcp-bridge.cjs').runProxy(process.argv[index+1]).catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
