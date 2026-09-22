#!/usr/bin/env node
import assert from 'node:assert/strict';
import {paginateIndex} from '../src/data/paged-index.mjs';
const rows=Array.from({length:23},(_,i)=>({id:'r'+i,n:i}));
const p1=paginateIndex({rows,generation:'g1',query:{q:'alpha'},limit:10,index_ref:'test'});
assert.equal(p1.count,10);assert.ok(p1.next_cursor);
const p2=paginateIndex({rows,generation:'g1',query:{q:'alpha'},limit:10,cursor:p1.next_cursor,index_ref:'test'});
assert.equal(p2.offset,10);assert.equal(p2.rows[0].id,'r10');
const p3=paginateIndex({rows,generation:'g1',query:{q:'alpha'},limit:10,cursor:p2.next_cursor,index_ref:'test'});
assert.equal(p3.count,3);assert.equal(p3.next_cursor,null);
assert.throws(()=>paginateIndex({rows,generation:'g2',query:{q:'alpha'},limit:10,cursor:p1.next_cursor,index_ref:'test'}),/CURSOR_GENERATION_STALE/);
assert.throws(()=>paginateIndex({rows,generation:'g1',query:{q:'beta'},limit:10,cursor:p1.next_cursor,index_ref:'test'}),/CURSOR_QUERY_STALE/);
console.log(JSON.stringify({schema:'xiio.sdk.paged-index-check/v1',result:'PASS',pages:3,rows:23,hostiles:2,false_green:0}));
