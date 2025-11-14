// === CONFIG ===
const BACKEND = "http://127.0.0.1:5000"; // change if your backend URL differs

// DOM elements
const topicSelect = document.getElementById('topicSelect');
const personaSelect = document.getElementById('personaSelect');
const dialectSelect = document.getElementById('dialectSelect');
const explainBtn = document.getElementById('explainBtn');
const definitionP = document.getElementById('definition');
const analogyP = document.getElementById('analogy');
const dialectP = document.getElementById('dialect');
const practiceP = document.getElementById('practice');
const xpSpan = document.getElementById('xp');
const levelSpan = document.getElementById('level');
const farmVisual = document.getElementById('farmVisual');
const cacheBtn = document.getElementById('cacheBtn');
const cacheStatus = document.getElementById('cacheStatus');
const badgesContainer = document.getElementById('badgesContainer');

// Data holders
let definitions = [];
let analogies = [];
let dialectTemplates = null;
let gamify = null;

// --- Local state (persisted) ---
function loadState(){
  const raw = localStorage.getItem('emlv_state');
  if(raw) return JSON.parse(raw);
  return { xp: 0, level: 1, badges: [] };
}
function saveState(s){ localStorage.setItem('emlv_state', JSON.stringify(s)); }
let state = loadState();
updateGamifyUI();

// --- Helper functions ---
function showMessage(m){
  cacheStatus.textContent = m;
  setTimeout(()=>{ cacheStatus.textContent = ''; }, 3000);
}

function updateGamifyUI(){
  xpSpan.textContent = state.xp;
  levelSpan.textContent = state.level;
  // badges
  badgesContainer.innerHTML = '';
  (state.badges || []).forEach(b=>{
    const d = document.createElement('div');
    d.className='badge';
    d.textContent = b.name || b;
    badgesContainer.appendChild(d);
  });
  // farm visual stages
  if(state.xp < 50) farmVisual.textContent = "🌱 Dry Field";
  else if(state.xp < 150) farmVisual.textContent = "🌿 Sprouting";
  else if(state.xp < 300) farmVisual.textContent = "🌻 Growing";
  else farmVisual.textContent = "🌾 Ready to Harvest";
}

// populate topic select
function populateTopics(){
  topicSelect.innerHTML = "";
  definitions.forEach(d=>{
    const o = document.createElement('option');
    o.value = d.id;
    o.textContent = `${d.topic} (${d.subject})`;
    topicSelect.appendChild(o);
  });
}

// local retrieval helpers
function localGetDefinition(id){
  return definitions.find(x => x.id === id);
}
function localGetAnalogy(id, persona){
  const a = analogies.find(x=> x.concept_id === id);
  if(!a) return null;
  return a[`analogy_${persona}`] || null;
}

// --- Fetch & cache datasets ---
async function fetchAndCache(){
  try{
    const [defsR, anR, dtR, gmR] = await Promise.all([
      fetch(BACKEND + "/definition_list"),
      fetch(BACKEND + "/analogy_list"),
      fetch(BACKEND + "/dialect_templates"),
      fetch(BACKEND + "/gamify"),
    ]);
    if(!defsR.ok || !anR.ok) throw new Error("Fetch failed");

    const defsJ = await defsR.json();
    const anJ = await anR.json();
    const dtJ = await dtR.json();
    const gmJ = await gmR.json();

    definitions = defsJ.data || defsJ;
    analogies = anJ.data || anJ;
    dialectTemplates = dtJ;
    gamify = gmJ;

    // cache
    localStorage.setItem('class1_defs', JSON.stringify(definitions));
    localStorage.setItem('class1_analogs', JSON.stringify(analogies));
    localStorage.setItem('dialect_templates', JSON.stringify(dialectTemplates));
    localStorage.setItem('gamify', JSON.stringify(gamify));

    populateTopics();
    showMessage("Class 1 data cached for offline use.");
    return true;
  }catch(err){
    console.warn("fetch error:", err);
    // try load from cache
    const dcache = localStorage.getItem('class1_defs');
    const acache = localStorage.getItem('class1_analogs');
    const dtcache = localStorage.getItem('dialect_templates');
    const gcache = localStorage.getItem('gamify');

    if(dcache && acache){
      definitions = JSON.parse(dcache);
      analogies = JSON.parse(acache);
      dialectTemplates = dtcache ? JSON.parse(dtcache) : null;
      gamify = gcache ? JSON.parse(gcache) : null;
      populateTopics();
      showMessage("Loaded data from cache (offline mode).");
      return false;
    } else {
      showMessage("No data available. Start backend and press 'Force Cache'.");
      return false;
    }
  }
}

// --- Explain action ---
async function explainAction(){
  const concept = topicSelect.value;
  const persona = personaSelect.value;
  const dialect = dialectSelect.value;

  // try online explain
  try{
    const res = await fetch(`${BACKEND}/explain/${concept}?persona=${persona}&dialect=${dialect}`);
    const j = await res.json();
    if(j.status === 'ok'){
      handleExplainResult(j.definition, j.analogy, j.dialect_output, j.concept);
      return;
    }
    throw new Error("Explain returned non-ok");
  }catch(err){
    // offline fallback
    const dObj = localGetDefinition(concept);
    const def = dObj ? dObj.definition : "Definition not found.";
    const an = localGetAnalogy(concept, persona) || "Analogy not available.";
    let tpl = "{definition_simplified}. {analogy}";
    try{
      const dtRaw = localStorage.getItem('dialect_templates');
      const dt = dtRaw ? JSON.parse(dtRaw) : dialectTemplates;
      if(dt && dt.templates && dt.templates[dialect]) tpl = dt.templates[dialect].simple_pattern;
    }catch(e){}
    const dialectText = tpl.replace("{definition_simplified}", def).replace("{analogy}", an);
    handleExplainResult(def, an, dialectText, concept);
  }
}

// handle explanation show + award xp
function handleExplainResult(definition, analogy, dialectText, conceptId){
  definitionP.textContent = definition;
  analogyP.textContent = analogy;
  dialectP.textContent = dialectText;
  practiceP.textContent = "Practice: Try explaining this to someone in one sentence.";

  // award XP locally
  const xpAdd = 10;
  state.xp = (state.xp || 0) + xpAdd;

  // compute level from cached gamify levels if present
  let newLevel = 1;
  try{
    const g = gamify || JSON.parse(localStorage.getItem('gamify') || "null");
    if(g && g.levels){
      for(const lvl of g.levels){
        if(state.xp >= lvl.xp_required) newLevel = lvl.level;
      }
    } else {
      if(state.xp >= 300) newLevel = 4;
      else if(state.xp >=150) newLevel = 3;
      else if(state.xp >=50) newLevel = 2;
    }
  }catch(e){
    if(state.xp >= 300) newLevel = 4;
    else if(state.xp >=150) newLevel = 3;
    else if(state.xp >=50) newLevel = 2;
  }
  state.level = newLevel;

  // give simple badge for first answer
  if(!state.badges) state.badges = [];
  if(!state.badges.find(b=>b.id==='first_answer')){
    state.badges.push({ id:'first_answer', name:'First Seed' });
  }

  saveState(state);
  updateGamifyUI();

  // try to inform backend of xp (non-blocking)
  try{
    fetch(BACKEND + "/gain_xp", {
      method: "POST",
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ current_xp: state.xp - xpAdd, add: xpAdd })
    }).catch(()=>{/* ignore if offline */});
  }catch(e){}
}

// --- Buttons & init ---
explainBtn.addEventListener('click', explainAction);

cacheBtn.addEventListener('click', async ()=>{
  cacheStatus.textContent = "Caching...";
  await fetchAndCache();
  cacheStatus.textContent = "Cached";
  setTimeout(()=>{ cacheStatus.textContent = ""; }, 2200);
});

async function init(){
  // try to load cached data if available
  const ok = await fetchAndCache();
  // if backend reachable ok==true, otherwise using cached data
  // show initial state
  updateGamifyUI();
  if(definitions.length>0) populateTopics();
}

init();
