#!/bin/bash
cd "$(dirname "$0")/.."
curl -sf http://127.0.0.1:3053/api/health | node -e "
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  try{const j=JSON.parse(d);
    console.log('Server:', j.ok?'OK':'NOT OK', '| version', j.version, '| up', Math.round(j.uptimeSeconds/60)+'min');
    console.log('AI:', j.ai.active, j.ai.ready?'(ready)':'(not ready — offline rules in use)');
    console.log('Queue:', j.headline);
    for (const [k,v] of Object.entries(j.providers||{})) console.log(' -', v.label+':', v.ready?'ready':'missing '+v.missing.join(', '));
  }catch(e){console.error('Health endpoint did not answer. Is the app running? (npm start)');process.exit(1)}
});"
