// Generation worker: builds terrain tiles and vegetation scatter off the main
// thread and hands the typed arrays back without copying.
import { setSeed, buildTerrainArrays } from './terrain.js';
import { scatterTrees, scatterDetails, CHUNK } from './scatter.js';

self.onmessage = ({ data: job }) => {
  if (job.type === 'seed') {
    setSeed(job.seed);
    return;
  }
  const { id, cx, cz } = job;
  const res = { id, cx, cz, kind: job.kind };
  const transfer = [];
  if (job.kind === 'terrain') {
    const t = buildTerrainArrays(cx, cz, CHUNK, job.segments);
    Object.assign(res, t, { segments: job.segments });
    transfer.push(t.position.buffer, t.normal.buffer, t.color.buffer);
  } else if (job.kind === 'trees') {
    res.items = scatterTrees(cx, cz, job.cell);
    transfer.push(res.items.buffer);
  } else if (job.kind === 'details') {
    res.items = scatterDetails(cx, cz);
    transfer.push(res.items.buffer);
  }
  self.postMessage(res, transfer);
};
