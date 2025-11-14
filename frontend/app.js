// === CONFIG ===
const BACKEND = "http://127.0.0.1:5000"; // change only if your backend runs elsewhere

// DOM elements
const topicSelect = document.getElementById("topicSelect");
const personaSelect = document.getElementById("personaSelect");
const dialectSelect = document.getElementById("dialectSelect");
const explainBtn = document.getElementById("explainBtn");

const definitionP = document.getElementById("definition");
const analogyP = document.getElementById("analogy");
const dialectP = document.getElementById("dialect");
const practiceP = document.getElementById("practice");

const xpSpan = document.getElementById("xp");
const levelSpan = document.getElementById("level");
const farmVisual = document.getElementById("farmVisual");
const cacheBtn = document.getElementById("cacheBtn");
const cacheStatus = document.getElementById("cacheStatus");
const badgesContainer = document.getElementById("badgesContainer");

// Data holders
let definitions = [];
let analogies = [];
let dialectTemplates = {};
let gamify = { levels: [{level:1,xp_required:0}] };

// --- Local state (persisted) ---
function loadState(){
  return JSON.parse(localStorage.getItem("emlv_state") || '{"xp":0,"level":1,"badges":[]}');
}
function saveState(s){ localStorage.setItem("emlv_state", JSON.stringify(s)); }
let state = loadState();
updateGamifyUI();

// --- Helper functions ---
function showMessage(m){
  cacheStatus.textContent = m;
  setTimeout(()=>{ cacheStatus.textContent = ""; }, 2800);
}

function updateGamifyUI(){
  xpSpan.textContent = state.xp;
  levelSpan.textContent = state.level;
  badgesContainer.innerHTML = "";
  (state.badges || []).forEach(b=>{
    const d = document.createElement('div');
    d.className='badge';
    d.textContent = b.name || b;
    badgesContainer.appendChild(d);
  });
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

    // normalize possible shapes
    definitions = defsJ.data || defsJ.definitions || defsJ;
    analogies   = anJ.data   || anJ.analogies    || anJ;
    dialectTemplates = dtJ.templates || dtJ;
    gamify = gmJ || gamify;

    localStorage.setItem('class1_defs', JSON.stringify(definitions));
    localStorage.setItem('class1_analogs', JSON.stringify(analogies));
    localStorage.setItem('dialect_templates', JSON.stringify(dialectTemplates));
    localStorage.setItem('gamify', JSON.stringify(gamify));

    populateTopics();
    showMessage("Class 1 data cached (online).");
    return true;
  }catch(err){
    console.warn("fetch error:", err);
    const dcache = localStorage.getItem('class1_defs');
    const acache = localStorage.getItem('class1_analogs');
    const dtcache = localStorage.getItem('dialect_templates');
    const gcache = localStorage.getItem('gamify');

    if(dcache && acache){
      definitions = JSON.parse(dcache);
      analogies = JSON.parse(acache);
      dialectTemplates = dtcache ? JSON.parse(dtcache) : dialectTemplates;
      gamify = gcache ? JSON.parse(gcache) : gamify;
      populateTopics();
      showMessage("Loaded data from cache (offline).");
      return false;
    } else {
      showMessage("No data cached. Start backend and press 'Force Cache'.");
      return false;
    }
  }
}

// --- Explain action ---
async function explainAction(){
  const concept = topicSelect.value;
  if(!concept){ showMessage("Please choose a topic"); return; }
  const persona = personaSelect.value;
  const dialect = dialectSelect.value;

  // try online explain
  try{
    const res = await fetch(`${BACKEND}/explain/${encodeURIComponent(concept)}?persona=${encodeURIComponent(persona)}&dialect=${encodeURIComponent(dialect)}`);
    if(!res.ok) throw new Error("Explain failed");
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
      if(dt && dt[dialect] && dt[dialect].simple_pattern) tpl = dt[dialect].simple_pattern;
      else if(dt && dt.templates && dt.templates[dialect]) tpl = dt.templates[dialect].simple_pattern;
    }catch(e){}
    const dialectText = tpl.replace("{definition_simplified}", def).replace("{analogy}", an);
    handleExplainResult(def, an, dialectText, concept);
  }
}

// handle explanation show + award xp
function handleExplainResult(definition, analogy, dialectText, conceptId){
  definitionP.textContent = definition || "—";
  analogyP.textContent = analogy || "—";
  dialectP.textContent = dialectText || "—";
  practiceP.textContent = "Practice: Try explaining this to someone in one sentence.";

  // award XP locally
  const xpAdd = 10;
  state.xp = (state.xp || 0) + xpAdd;

  // compute level from cached gamify levels if present
  try{
    const g = gamify || JSON.parse(localStorage.getItem('gamify') || "null");
    if(g && g.levels && Array.isArray(g.levels)){
      // find highest level where xp_required <= state.xp
      let newLevel = 1;
      for(const lvl of g.levels){
        if(state.xp >= lvl.xp_required) newLevel = lvl.level;
      }
      state.level = newLevel;
    }
  }catch(e){
    // fallback simple levels
    if(state.xp >= 300) state.level = 4;
    else if(state.xp >=150) state.level = 3;
    else if(state.xp >=50) state.level = 2;
  }

  // give simple badge for first answer
  if(!state.badges) state.badges = [];
  if(!state.badges.find(b=>b.id==='first_answer')){
    state.badges.push({ id:'first_answer', name:'First Seed' });
  }

  saveState(state);
  updateGamifyUI();

  // inform backend of xp (non-blocking)
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
  await fetchAndCache();
  updateGamifyUI();
}

init();
