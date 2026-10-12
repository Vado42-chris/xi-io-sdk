/** Read-only candidate canary. Does not authenticate tools or grant effect authority. */
export function qualifyClaim({text='',toolReceipts=[],score=null,required=8}={}) {
 const assertiveText=text.replace(/\b(?:plan|intend|want|need|will|going)\s+to\s+(?:run|execute|test|simulate|score|measure|deploy)\b[^.!?]*/gi,'');
 const claims=/\b(simulat(?:ed|ion)|scor(?:ed|ing)|measur(?:ed|ement)|test(?:ed|s)|executed|committed|deployed)\b/i.test(assertiveText);
 const verified=toolReceipts.filter(x=>x && x.native===true && x.status==='PASS' && x.operation && x.evidence_ref);
 const failures=[];
 if(claims && verified.length===0) failures.push('ACTION_CLAIM_WITHOUT_NATIVE_RECEIPT');
 if(score!==null){
  if(!Number.isInteger(score?.passed)||!Number.isInteger(score?.total)||score.total!==required||score.passed<0||score.passed>score.total) failures.push('SCORE_ARITHMETIC_INVALID');
  if(score?.threshold!==required) failures.push('SCORE_THRESHOLD_DRIFT');
  if(score?.passed===required && verified.length===0) failures.push('FALSE_GREEN_SCORE');
 }
 return {state:failures.length?'RED':'RECEIPT_QUALIFIED',failures,verified_receipts:verified.length,effect_authority:0};
}
