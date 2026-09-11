import { parseX42Coordinate, qualifyX42Coordinate } from '../src/projections/x42-coordinate.mjs';

const input = document.querySelector('#x42-coordinate-input');
const run = document.querySelector('#x42-coordinate-run');
const load = document.querySelector('#x42-coordinate-load-hvt');
const status = document.querySelector('#x42-coordinate-status');
const output = document.querySelector('#x42-coordinate-output');

const HVT = '@ibal*5[truth,source,runtime,fleet,return]<<5?2>>5x1+7-3{live=0,r1=1}!no-flatplanes%4/5';

function project() {
  try {
    const parsed = parseX42Coordinate(input.value);
    const qualified = qualifyX42Coordinate(parsed);
    output.textContent = JSON.stringify({ parsed, qualified }, null, 2);
    status.textContent = qualified.status === 'BLOCKED'
      ? `BLOCKED · ${qualified.blockers.join(', ')}`
      : `PROJECTED · reap ${parsed.counts.reap} · sow ${parsed.counts.sow} · ? ${parsed.counts.unknown} · x ${parsed.counts.blocked} · + ${parsed.counts.gain} · - ${parsed.counts.cost}`;
  } catch (error) {
    output.textContent = JSON.stringify({ error: error?.code || error?.message || String(error) }, null, 2);
    status.textContent = `INVALID · ${error?.code || error?.message || 'parse error'}`;
  }
}

run?.addEventListener('click', project);
load?.addEventListener('click', () => { input.value = HVT; project(); });
input?.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') project();
});
project();
