import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const map=JSON.parse(readFileSync(new URL('../xiio/integrations/zed-acp-mcp-call-map.v1.json',import.meta.url),'utf8'));
let checks=0;
function check(x){assert.ok(x);checks++;}
check(map.schema==='xiio.sdk.zed-acp-mcp-call-map/v1');
check(map.host==='zed');
check(new Set(map.provider_lanes.map(x=>x.agent)).size===map.provider_lanes.length);
check(['Codex','Claude','Gemini CLI','Cursor'].every(x=>map.provider_lanes.some(y=>y.agent===x&&y.kind==='ACP')));
check(map.provider_lanes.some(x=>x.agent.includes('Ollama')&&x.kind==='TERMINAL'));
check(map.entrypoints.some(x=>x.xiio_contract==='source_mutation'&&x.effect_owner==='Ward'));
check(map.entrypoints.filter(x=>x.host_tool.startsWith('mcp:xiio:')).every(x=>x.status==='PROPOSED_TOOL_NAME_NOT_IMPLEMENTED'));
check(map.permission_policy.recommended_default==='confirm');
check(map.five_point_five.independent_effect_proof_required===true);
check(Object.values(map.acceptance).every(v=>v===false));
check(map.state==='CALL_MAP_SOURCE_ONLY_NO_RUNTIME_CREDIT');
console.log(JSON.stringify({schema:'xiio.sdk.zed-map-proof/v1',checks,failures:0,effect_authority:false}));
