export const BASELINE_DIMENSIONS = Object.freeze([
  ['REGISTRATION', 10],
  ['INTEGRATION_CLASS', 10],
  ['HYDRATION', 10],
  ['WORKER_CAPABILITY', 10],
  ['MAIN_TRUTH', 10],
  ['BRANCH_STEW', 10],
  ['SDK_ADOPTION', 10],
  ['ACK_DISTRIBUTION', 10],
  ['RETURN_CURRENTNESS', 10],
  ['PRIVACY_BOUNDARY', 10],
]);

const PASS = new Set(['PASS','CURRENT','N_A_WITH_EVIDENCE']);

export function scoreRepoBaseline(repo, observations = {}) {
  if (!repo?.repository) throw new Error('repository required');
  const cells = BASELINE_DIMENSIONS.map(([id, points]) => {
    const obs = observations[id] ?? {};
    const state = String(obs.state ?? 'UNKNOWN').toUpperCase();
    const earned = PASS.has(state) && obs.proof_ref ? points : 0;
    return { id, max: points, earned, state, proof_ref: obs.proof_ref ?? null, blocker: obs.blocker ?? null };
  });
  return {
    schema: 'xiio.sdk.repo-baseline-score/v1',
    repository: repo.repository,
    score: cells.reduce((n,c)=>n+c.earned,0),
    max: 100,
    state: cells.every(c=>c.earned===c.max) ? '100' : 'NOT_100',
    cells,
  };
}

export function scoreOrgBaseline(repos, observationsByRepo = {}) {
  const rows = repos.map((repo)=>scoreRepoBaseline(repo, observationsByRepo[repo.repository] ?? {}));
  const total = rows.reduce((n,r)=>n+r.score,0);
  const max = rows.length * 100;
  return {
    schema: 'xiio.sdk.org-baseline-score/v1',
    repo_denominator: rows.length,
    score_points: total,
    max_points: max,
    pct: max ? Number(((total/max)*100).toFixed(2)) : 0,
    repos_100: rows.filter(r=>r.state==='100').length,
    repos_not_100: rows.filter(r=>r.state!=='100').length,
    state: rows.length && rows.every(r=>r.state==='100') ? '100' : 'NOT_100',
    rows,
    hard: ['AVERAGE_100 != ALL_REQUIRED_REPOS_100','UNKNOWN != PASS','NO_PROOF = NO_POINTS'],
  };
}
