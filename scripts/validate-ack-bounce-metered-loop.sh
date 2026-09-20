#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPEC="$ROOT/standards/ack/ack-bounce-metered-loop.v1.json"

fail(){ printf '{"schema":"xiio.sdk.ack-bounce.validator/v1","state":"FAIL","reason":"%s","effect_authority":0}\n' "$1"; exit 1; }
[ -f "$SPEC" ] || fail MISSING_ACK_BOUNCE_SPEC
spec="$(cat "$SPEC")"
for token in \
  "SDK-ACK-BOUNCE-METERED-LOOP" \
  "POSTED" \
  "APPLY_RETURN" \
  "READBACK" \
  "REAP" \
  "owner_cog_delta" \
  "time_money_delta" \
  "packet_density_gears" \
  "compile_before_submit" \
  "@ibal conductor" \
  "OWNER_AS_CLOCK = FAIL" \
  "ACK_LEDGER_WITHOUT_SDK_CONSUMER = STEW" \
  "B10_NO_PROSE_ONLY_ACK"; do
  case "$spec" in *"$token"*) ;; *) fail "MISSING_TOKEN_${token// /_}" ;; esac
done
printf '{"schema":"xiio.sdk.ack-bounce.validator/v1","state":"PASS","spec":"standards/ack/ack-bounce-metered-loop.v1.json","effect_authority":0,"surfaces":["ACK lifecycle","bounce rules","metered billing syncopation","team sync","ROTFL monitor binding"],"hard":"ACK ledger without SDK consumer is stew; prose ACK is not ACK packet"}\n'
