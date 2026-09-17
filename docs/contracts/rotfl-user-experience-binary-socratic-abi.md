# ROTFL User × Experience × Test Binary Socratic ABI

Status: white-label SDK contract candidate
Scope: decomposition, testing, primitive discovery, UX qualification, simulation conduct, and reusable lesson promotion.

## Core model

ROTFL treats the human as the User and X as the Experience under test.

~~~text
USER
+ EXPERIENCE
+ CURRENT REQUIREMENT / GOAL DENOMINATOR
-> TEST
-> BINARY OBSERVATION
-> SOCRATIC DECOMPOSITION
-> SMALLEST SEMANTIC LEAF
-> HOT_PATCH / TRUE_WAIT / NO_EFFECT
-> RECOMPOSE
-> WHOLE-EXPERIENCE RETEST
~~~

The test is not only a verifier. It is also a discovery instrument for reusable templates, primitives, variables, invariants, hostile cases, and missing owner boundaries.

Hard:

~~~text
USER != MODEL
EXPERIENCE != UI_ONLY
TEST != PASS_LABEL
TEST_FAILURE != AUTOMATIC_NEW_WORK
QUESTION != REQUIREMENT
PRIMITIVE != DOMAIN_TRUTH
BINARY_ACCOUNTING != CLOSURE
UNKNOWN != FALSE
LOCAL_PASS != WHOLE_EXPERIENCE_PASS
~~~

## Binary Socratic loop

Each Socratic turn asks one bounded decision-relevant question about the current experience denominator.

~~~text
1. What was the User trying to accomplish?
2. What exact Experience was expected?
3. What exact Experience was observed?
4. Which required invariant differs?
5. Is that invariant KNOWN?
6. What evidence binds the observation?
7. What is the smallest causal leaf that can explain the delta?
8. Does an existing primitive/template/owner already represent that leaf?
9. What one bounded test would distinguish the remaining alternatives?
10. What changed-only HOT_PATCH, WAIT, NO_EFFECT, or owner decision follows?
~~~

Every machine-evaluable answer uses the binary ABI:

~~~text
known_bit
value_bit
required_bit
current_bit
source_bound_bit
changed_bit
~~~

known_bit=0 masks value_bit; UNKNOWN never earns false, pass, no-effect, or N/A credit.

## Experience denominator

A User Experience denominator may include, as applicable:

~~~text
user_ref
user_goal_ref
journey / interaction ref
required outcome
required information
required action
required response
required accessibility behavior
required trust/safety behavior
required timing/order
required navigation/discoverability
required recovery path
required handoff/continuation
required effect/readback state
required source/provenance state
required release/delivery state
~~~

The denominator is compiled from current requirements, current graph relationships, current source/proof, and applicable product/domain owners. Prompt nouns do not define it.

## Smallest common denominator stopping rule

Socratic decomposition stops only when a leaf has all of:

~~~text
ONE subject
ONE semantic owner
ONE variable or invariant
ONE current generation
ONE proof/evidence requirement
ONE effect/authority boundary
ONE independently executable or observable test
ONE bounded return target
~~~

Call this a SEMANTIC_LEAF.

If the candidate still contains multiple owners, multiple independent failure causes, multiple effect boundaries, or multiple tests that can vary independently, it is still compound and must be decomposed again.

Do not decompose below semantic meaning merely to obtain smaller syntax, files, functions, sentences, or bytes.

~~~text
SMALLER_TEXT != SMALLER_SEMANTIC_LEAF
ONE_FILE != ONE_PRIMITIVE
ONE_FUNCTION != ONE_INVARIANT
ONE_BIT != COMPLETE_MEANING
~~~

## Test-to-template / primitive discovery

A test finding is classified before promotion:

~~~text
finding
-> existing owner/primitive collision
-> REUSE_EXISTING
 | EXTEND_EXISTING
 | PRODUCT_SPECIALIZATION
 | TEMPLATE_CANDIDATE
 | PORTABLE_PRIMITIVE_CANDIDATE
 | HOSTILE_FIXTURE
 | EVIDENCE_ONLY
 | OWNER_DECISION
 | UNKNOWN
~~~

A reusable template is a stable interrogation/denominator pattern that can be applied to structurally similar experiences.

A reusable primitive is a stable semantic leaf or behavior with a clear owner, contract, tests, and boundaries.

Hard:

~~~text
ONE FAILURE != NEW PRIMITIVE
ONE ADOPTER != PORTABLE
REPEATED WORDING != SAME SEMANTIC
SAME SEMANTIC != SAME IMPLEMENTATION
TEST DISCOVERS CANDIDATE != TEST OWNS CANDIDATE
~~~

Portable promotion follows existing ROTFL lesson/backfeed/adopter rules and requires current owner collision plus appropriate independent/second-context evidence.

## Team / simulation conductor

A simulation freezes one current experience denominator and assigns only affected cells/leaves.

Each worker receives:

~~~text
root_ref
sim_generation
user/experience subject refs
scoped expected cells
source/evidence refs
tool/capability refs
effect ceiling
return target
wake condition
~~~

Each worker returns:

~~~text
observed cells
evidence refs
reason codes
result state
return target
~~~

Reducer classes:

~~~text
MATCH
MISMATCH
UNKNOWN_OBSERVED
UNKNOWN_EXPECTED
STALE_GENERATION
MISSING_DENOMINATOR_CELL
EXTRA_UNDECLARED_CELL
~~~

The conductor wakes only graph-proven affected work.

~~~text
MISMATCH -> bounded miner/HOT_PATCH path
UNKNOWN -> exact missing bridge / research / WAIT
STALE -> changed-only REBASE + RE-ONBOARD
MATCH -> preserve current state
EXTRA -> collide/classify before denominator expansion
~~~

Observer roles never mutate the subject they independently qualify.

## UX qualification

UX qualification measures whether the User achieved the intended Experience under current requirements.

Useful evidence can include:

~~~text
task success
task failure
steps / interactions
time or latency where meaningful
error/recovery path
accessibility behavior
cognitive-load/restatement pressure
navigation/discoverability
trust/clarity
handoff success
cold-start recovery
requirement preservation
regression escape/prevention
~~~

No opaque UX score is required. Preserve dimensional measurements and their denominators.

## Recomposition rule

After a leaf HOT_PATCH:

~~~text
patch leaf
-> targeted leaf test
-> graph affected-set compile
-> affected consumer retest
-> requirement denominator replay
-> whole-experience sanity
-> RETURN / APPLY_RETURN
-> REAP stale donors/selectors/findings
-> changed-only REBASE / RE-ONBOARD
-> NEXT
~~~

A local patch cannot earn whole-experience closure while another required experience cell remains unknown or false.

## Relationship to existing SDK contracts

This ABI composes with:

- rotfl-binary-variable-invariant-abi.md
- rotfl-serialized-semantic-event-chain-abi.md
- rotfl-department-head-manifest-skill-abi.md
- whole-experience HOT_PATCH lesson
- binary requirement-stickiness lesson
- current graph / affected-set / RETURN / APPLY_RETURN / Reaper / Cadence owners

It does not create a second UX authority, test framework, relationship graph, Work database, Cadence engine, observer registry, CRM, Rosetta runtime, or effect plane.

## Compact invariant

~~~text
USER × EXPERIENCE × TEST
-> QUESTIONS
-> BINARY DIFFERENCES
-> SMALLEST SEMANTIC LEAVES
-> REUSABLE TEMPLATES / PRIMITIVES
-> HOT_PATCH
-> RECOMPOSE
-> RETEST THE USER EXPERIENCE
~~~

This is Socratic decomposition accelerated by binary state, current graph relationships, and deterministic return/reap/rebase loops.
