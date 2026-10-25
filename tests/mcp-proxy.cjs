const i=process.argv.indexOf('--bridge');
require('../electron/mcp-bridge.cjs').runProxy(i>=0?process.argv[i+1]:process.argv[2]).catch(e=>{process.stderr.write(e.message+'\n');process.exit(1);});
