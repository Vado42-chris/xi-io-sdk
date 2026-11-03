export const BLACK_WINDOW_SETTINGS_SCHEMA='xiio.studio.black-window-settings/v1';
export const BLACK_WINDOW_SETTINGS_KEY='xiio.studio.black-window-settings/v1';

export const BLACK_WINDOW_SETTING_DEFS=Object.freeze([
  Object.freeze({id:'density',family:'appearance',label:'Control density',kind:'select',values:['comfortable','compact'],default:'comfortable'}),
  Object.freeze({id:'font_scale',family:'accessibility',label:'Interface scale',kind:'select',values:['0.9','1','1.1','1.2'],default:'1'}),
  Object.freeze({id:'high_contrast',family:'accessibility',label:'High contrast',kind:'toggle',default:false}),
  Object.freeze({id:'reduced_motion',family:'accessibility',label:'Reduced motion',kind:'toggle',default:false}),
  Object.freeze({id:'keyboard_navigation',family:'accessibility',label:'Enhanced keyboard navigation',kind:'toggle',default:true}),
  Object.freeze({id:'reopen_last_session',family:'resource',label:'Reopen last local session',kind:'toggle',default:true}),
  Object.freeze({id:'autosave_policy',family:'resource',label:'Autosave policy',kind:'select',values:['manual','local-safe'],default:'manual'}),
  Object.freeze({id:'model_preference',family:'ai',label:'AI model preference',kind:'select',values:['local-first','ask-each-time'],default:'local-first'}),
  Object.freeze({id:'paid_provider_fallback',family:'ai',label:'Paid-provider fallback',kind:'select',values:['never','ask'],default:'never'})
]);

const defs=new Map(BLACK_WINDOW_SETTING_DEFS.map(def=>[def.id,def]));
const clone=v=>JSON.parse(JSON.stringify(v));

export function defaultBlackWindowSettings(){
  return Object.freeze({
    schema:BLACK_WINDOW_SETTINGS_SCHEMA,
    generation:1,
    values:Object.freeze(Object.fromEntries(BLACK_WINDOW_SETTING_DEFS.map(def=>[def.id,def.default]))),
    authority_granted:false,
    effect_ceiling:'LOCAL_PRESENTATION_AND_RECOVERY_PREFERENCES_ONLY'
  });
}

export function validateBlackWindowSettings(input){
  if(!input||input.schema!==BLACK_WINDOW_SETTINGS_SCHEMA||!input.values||typeof input.values!=='object')return {ok:false,first_red:'SCHEMA_INVALID'};
  for(const def of BLACK_WINDOW_SETTING_DEFS){
    const value=input.values[def.id];
    if(def.kind==='toggle'&&typeof value!=='boolean')return {ok:false,first_red:'SETTING_INVALID:'+def.id};
    if(def.kind==='select'&&!def.values.includes(String(value)))return {ok:false,first_red:'SETTING_INVALID:'+def.id};
  }
  if(input.authority_granted!==false)return {ok:false,first_red:'SETTINGS_MUST_NOT_GRANT_AUTHORITY'};
  if(input.effect_ceiling!=='LOCAL_PRESENTATION_AND_RECOVERY_PREFERENCES_ONLY')return {ok:false,first_red:'EFFECT_CEILING_INVALID'};
  return {ok:true,first_red:null};
}

export function updateBlackWindowSettings(current,patch={}){
  const base=validateBlackWindowSettings(current).ok?clone(current):clone(defaultBlackWindowSettings());
  const values={...base.values};
  for(const [key,value] of Object.entries(patch)){
    const def=defs.get(key);
    if(!def)throw new TypeError('UNKNOWN_SETTING:'+key);
    if(def.kind==='toggle'){
      if(typeof value!=='boolean')throw new TypeError('SETTING_INVALID:'+key);
      values[key]=value;
    }else{
      const normalized=String(value);
      if(!def.values.includes(normalized))throw new TypeError('SETTING_INVALID:'+key);
      values[key]=normalized;
    }
  }
  return Object.freeze({...base,generation:Number(base.generation||0)+1,values:Object.freeze(values),authority_granted:false,effect_ceiling:'LOCAL_PRESENTATION_AND_RECOVERY_PREFERENCES_ONLY'});
}

export function loadBlackWindowSettings(storage){
  try{
    const raw=storage?.getItem?.(BLACK_WINDOW_SETTINGS_KEY);
    if(!raw)return defaultBlackWindowSettings();
    const parsed=JSON.parse(raw);
    return validateBlackWindowSettings(parsed).ok?Object.freeze(parsed):defaultBlackWindowSettings();
  }catch{
    return defaultBlackWindowSettings();
  }
}

export function saveBlackWindowSettings(storage,current,patch={}){
  if(!storage?.setItem||!storage?.getItem)throw new Error('SETTINGS_STORAGE_UNAVAILABLE');
  const next=updateBlackWindowSettings(current,patch);
  const bytes=JSON.stringify(next);
  storage.setItem(BLACK_WINDOW_SETTINGS_KEY,bytes);
  const readback=storage.getItem(BLACK_WINDOW_SETTINGS_KEY);
  if(readback!==bytes)throw new Error('SETTINGS_READBACK_MISMATCH');
  const parsed=JSON.parse(readback);
  if(!validateBlackWindowSettings(parsed).ok)throw new Error('SETTINGS_READBACK_INVALID');
  return Object.freeze(parsed);
}

export function projectBlackWindowSettings(settings,contextual=[]){
  const current=validateBlackWindowSettings(settings).ok?settings:defaultBlackWindowSettings();
  const families={};
  for(const def of BLACK_WINDOW_SETTING_DEFS){
    (families[def.family]??=[]).push(Object.freeze({...def,value:current.values[def.id]}));
  }
  return Object.freeze({
    schema:'xiio.studio.black-window-settings-projection/v1',
    generation:current.generation,
    families:Object.freeze(families),
    contextual:Object.freeze(Array.isArray(contextual)?clone(contextual):[]),
    authority_granted:false,
    effect_ceiling:current.effect_ceiling
  });
}

export function applyBlackWindowSettingsToDocument(settings,documentRef=globalThis.document){
  if(!documentRef?.documentElement)return false;
  const v=settings.values;
  const root=documentRef.documentElement;
  root.dataset.xiioDensity=v.density;
  root.dataset.xiioContrast=v.high_contrast?'high':'normal';
  root.dataset.xiioReducedMotion=v.reduced_motion?'true':'false';
  root.dataset.xiioKeyboardNavigation=v.keyboard_navigation?'enhanced':'standard';
  root.style.setProperty('--xiio-user-scale',String(v.font_scale));
  return true;
}

const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function mountBlackWindowSettings({mount,storage=globalThis.localStorage,contextualSettings=[]}={}){
  const host=typeof mount==='string'?globalThis.document?.querySelector(mount):mount;
  if(!host)return null;
  let settings=loadBlackWindowSettings(storage);
  const render=()=>{
    const projection=projectBlackWindowSettings(settings,contextualSettings);
    host.innerHTML=`
      <div class="eyebrow">Black-level window settings</div>
      <h1>Universal settings</h1>
      <p class="lead">These preferences affect XI-IO window presentation, local recovery and AI routing defaults. They do not grant file, provider, legal or remote effect authority.</p>
      ${Object.entries(projection.families).map(([family,rows])=>`
        <section class="panel" data-settings-family="${esc(family)}">
          <h3>${esc(family)}</h3>
          <div class="details">${rows.map(row=>`
            <div class="detail">
              <dt><label for="xiio-setting-${esc(row.id)}">${esc(row.label)}</label></dt>
              <dd>${row.kind==='toggle'
                ? `<input id="xiio-setting-${esc(row.id)}" data-black-setting="${esc(row.id)}" type="checkbox" ${row.value?'checked':''}>`
                : `<select id="xiio-setting-${esc(row.id)}" data-black-setting="${esc(row.id)}">${row.values.map(value=>`<option value="${esc(value)}" ${String(row.value)===String(value)?'selected':''}>${esc(value)}</option>`).join('')}</select>`
              }</dd>
            </div>`).join('')}</div>
        </section>`).join('')}
      <section class="panel">
        <h3>Product/context settings</h3>
        <p class="muted">Product settings remain contextual and cannot override universal authority or persistence semantics.</p>
        ${projection.contextual.length?projection.contextual.map(x=>`<div class="card"><strong>${esc(x.setting_ref||x.id||'contextual-setting')}</strong></div>`).join(''):'<p class="blocked">No contextual product settings are admitted by the active resource.</p>'}
      </section>
      <div class="note" data-black-settings-status>Saved locally · generation ${projection.generation} · authority 0</div>
    `;
    host.querySelectorAll('[data-black-setting]').forEach(control=>{
      control.onchange=()=>{
        const id=control.dataset.blackSetting;
        const value=control.type==='checkbox'?control.checked:control.value;
        try{
          settings=saveBlackWindowSettings(storage,settings,{[id]:value});
          applyBlackWindowSettingsToDocument(settings);
          render();
        }catch(error){
          const status=host.querySelector('[data-black-settings-status]');
          if(status)status.textContent='Settings save failed · '+String(error?.message||error);
        }
      };
    });
    applyBlackWindowSettingsToDocument(settings);
    return projection;
  };
  return render();
}
