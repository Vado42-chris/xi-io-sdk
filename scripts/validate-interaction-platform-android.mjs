#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const c=JSON.parse(fs.readFileSync(new URL('../standards/interaction-platform.android.v1.json',import.meta.url),'utf8'));
assert.equal(c.schema,'xiio.sdk.interaction-platform-contract/v1');
assert.equal(c.breakpoints.mobile_max_css_px,1023);
assert.equal(c.breakpoints.desktop_min_css_px,1024);
assert.equal(c.android_webview.touch.minimum_target_css_px,44);
assert.equal(c.android_webview.touch.icon_only_requires_aria_label,true);
assert.equal(c.android_webview.touch.hover_only_reveal_forbidden_below_css_px,1024);
assert.equal(c.android_webview.contrast.normal_text_min_ratio,4.5);
assert.equal(c.android_webview.navigation.mobile_bottom_navigation_required,true);
assert.equal(c.android_webview.navigation.preserve_route_stacks,true);
assert.equal(c.android_webview.navigation.safe_area_padding_bottom,'env(safe-area-inset-bottom)');
assert.equal(c.android_webview.scrolling.major_layout_overscroll_behavior,'none');
assert.equal(c.flatpack_binding.inherit_by_default,true);
assert.equal(c.flatpack_binding.owner_retype_required,false);
assert.equal(c.flatpack_binding.private_user_data,false);
for(const target of ['inbox','publisher','articles','studio','dashboards','widgets','windows','websites','android-webview']){
  assert.ok(c.projection_targets.includes(target),target);
}
console.log(JSON.stringify({ok:true,schema:'xiio.sdk.interaction-platform-contract.validation/v1',denominator:18,pass:18,fail:0,owner_retype:0,effect_ceiling:0},null,2));
