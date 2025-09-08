const currency = new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'});
const qtyFmt = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});

// ====== Простые конвертации единиц ======
const UNIT = {
  piece: { toBase: x=>x, fromBase: x=>x, base:'piece', label:'шт.' },
  g:     { toBase: x=>x, fromBase: x=>x, base:'g',     label:'г'   },
  kg:    { toBase: x=>x*1000, fromBase: x=>x/1000, base:'g', label:'кг' },
  ml:    { toBase: x=>x, fromBase: x=>x, base:'ml', label:'мл' },
  l:     { toBase: x=>x*1000, fromBase: x=>x/1000, base:'ml', label:'л' },
  tbsp:  { toBase: x=>x*15, fromBase: x=>x/15, base:'g', label:'ст.л.' }, // ~15 г
  tsp:   { toBase: x=>x*5, fromBase: x=>x/5, base:'g', label:'ч.л.' }    // ~5 г
};

// ====== Local pricebook (ценовая книжка) ======
function loadPricebook(){
  try{ return JSON.parse(localStorage.getItem('pricebook')||'{}'); } catch { return {} }
}
function savePricebook(pb){
  localStorage.setItem('pricebook', JSON.stringify(pb));
}

// ====== Рецепты (с ингредиентами) ======
let RECIPES = [];
async function loadRecipes(){
  try{
    const res = await fetch('recipes.json', {cache:'no-store'});
    if(!res.ok) throw new Error('HTTP '+res.status);
    RECIPES = await res.json();
  }catch(e){
    console.error('Не удалось загрузить recipes.json', e);
    RECIPES = [];
  }
  populateRecipeSelect();
}

function populateRecipeSelect(){
  const sel = document.getElementById('recipe-select');
  sel.innerHTML = '';
  if(RECIPES.length===0){
    const o = document.createElement('option');
    o.value=''; o.textContent='(Нет базы рецептов)';
    sel.appendChild(o);
    return;
  }
  const groups = RECIPES.reduce((acc,r)=>(acc[r.category]=acc[r.category]||[]).push(r)&&acc,{});
  for(const [cat, list] of Object.entries(groups)){
    const og = document.createElement('optgroup');
    og.label = cat;
    list.forEach(r=>{
      const o = document.createElement('option');
      o.value = r.id;
      o.textContent = `${r.name} — выход: ${r.yieldCount} ${r.yieldName}`;
      og.appendChild(o);
    });
    sel.appendChild(og);
  }
}

function findRecipe(id){ return RECIPES.find(r=>r.id===id) }

// ====== Рендер таблицы ингредиентов ======
function renderIngredients(recipe){
  const tbody = document.getElementById('ingredients-body');
  const pb = loadPricebook();
  tbody.innerHTML = '';
  recipe.ingredients.forEach((ing, idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${ing.name}</td>
      <td><input type="number" step="0.01" min="0" value="${ing.qty}" data-idx="${idx}" data-role="qty"></td>
      <td>
        <select data-idx="${idx}" data-role="unit">
          ${Object.keys(UNIT).map(u=>`<option value="${u}" ${u===ing.unit?'selected':''}>${UNIT[u].label}</option>`).join('')}
        </select>
      </td>
      <td><input type="number" step="0.0001" min="0" value="${pb[ing.name]?.pricePerUnit ?? ''}" placeholder="введите" data-idx="${idx}" data-role="ppu"></td>
      <td>
        <select data-idx="${idx}" data-role="ppuUnit">
          ${Object.keys(UNIT).map(u=>`<option value="${u}" ${pb[ing.name]?.ppuUnit===u?'selected':''}>${UNIT[u].label}</option>`).join('')}
        </select>
      </td>
      <td class="cost" data-idx="${idx}">—</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('recipe-yield').value = recipe.yieldCount;
  document.getElementById('recipe-section').classList.remove('hidden');

  // Listeners for recalculation
  tbody.querySelectorAll('input,select').forEach(el=>el.addEventListener('input', recalcTotals));
  recalcTotals();
}

function recalcTotals(){
  const tbody = document.getElementById('ingredients-body');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  let total = 0;
  rows.forEach(row=>{
    const idx = row.querySelector('td.cost').dataset.idx;
    const qty = parseFloat(row.querySelector('input[data-role="qty"]').value)||0;
    const unit = row.querySelector('select[data-role="unit"]').value;
    const ppu = parseFloat(row.querySelector('input[data-role="ppu"]').value)||0;
    const ppuUnit = row.querySelector('select[data-role="ppuUnit"]').value;

    // Приводим все в базовые единицы и считаем стоимость
    const needBase = UNIT[unit].toBase(qty);
    const pricePerBase = ppu / UNIT[ppuUnit].toBase(1); // цена за базовую единицу
    const cost = needBase * pricePerBase;
    total += cost;

    row.querySelector('td.cost').textContent = currency.format(cost || 0);
  });

  document.getElementById('recipe-total').textContent = currency.format(total);
  const yieldCount = Math.max(1, parseInt(document.getElementById('recipe-yield').value,10)||1);
  const ppu = total / yieldCount;
  document.getElementById('recipe-ppu').value = currency.format(ppu);
}

function savePricebookFromTable(){
  const tbody = document.getElementById('ingredients-body');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const pb = loadPricebook();
  rows.forEach(row=>{
    const name = row.children[0].textContent;
    const ppu = parseFloat(row.querySelector('input[data-role="ppu"]').value)||0;
    const ppuUnit = row.querySelector('select[data-role="ppuUnit"]').value;
    if(ppu>0){
      pb[name] = { pricePerUnit: ppu, ppuUnit };
    }
  });
  savePricebook(pb);
}

function compareNow(){
  const readyName = document.getElementById('ready-name').value.trim();
  const packPrice = parseFloat(document.getElementById('ready-pack-price').value)||0;
  const packCount = Math.max(1, parseInt(document.getElementById('ready-pack-count').value,10)||1);
  const readyPPU = packPrice / packCount;

  const yieldCount = Math.max(1, parseInt(document.getElementById('recipe-yield').value,10)||1);
  const homeTotalText = document.getElementById('recipe-total').textContent;
  const homeTotal = Number(homeTotalText.replace(/[^0-9,.-]/g,'').replace(',','.')) || 0;
  const homePPU = homeTotal / yieldCount;

  // Render battle
  document.getElementById('ready-summary-name').textContent = `Готовое: ${readyName}`;
  document.getElementById('ready-ppu').textContent = currency.format(readyPPU);
  document.getElementById('ready-total').textContent = currency.format(packPrice);
  document.getElementById('ready-count').textContent = packCount;

  const recipeId = document.getElementById('recipe-select').value;
  const recipe = findRecipe(recipeId);
  document.getElementById('home-summary-name').textContent = `Домашнее: ${recipe?.name||'Рецепт'}`;
  document.getElementById('home-ppu').textContent = currency.format(homePPU);
  document.getElementById('home-total').textContent = currency.format(homeTotal);
  document.getElementById('home-count').textContent = yieldCount;

  const cheaper = readyPPU < homePPU ? 'Готовое' : (homePPU < readyPPU ? 'Домашнее' : 'Ничья');
  const absDiff = Math.abs(readyPPU - homePPU);
  const pct = readyPPU===homePPU ? 0 : Math.round((absDiff / Math.max(readyPPU, homePPU))*100);
  const winnerText = cheaper==='Ничья'
    ? 'Ничья — одинаковая цена за штуку'
    : `Победитель: ${cheaper}! Отрыв ${pct}% (${currency.format(absDiff)} за штуку)`;
  document.getElementById('winner-text').textContent = winnerText;

  const gapbar = document.getElementById('gapbar');
  gapbar.style.background = cheaper==='Ничья'
    ? 'linear-gradient(90deg,#bbb,#bbb)'
    : 'linear-gradient(90deg, #00a86b '+pct+'%, #ff6a00 '+pct+'%)';

  // Recommendation
  const household = Math.max(1, parseInt(document.getElementById('household-size').value,10)||1);
  const daysHorizon = 2; // простая эвристика
  const needPieces = household * daysHorizon * 2; // 2 блина на человека x дни
  let rec = '';
  if(yieldCount > packCount && household===1 && homePPU >= readyPPU){
    rec = 'Если ты один/одна, выход 12 шт. может быть избыточным. При этом домашние не дешевле — можно взять готовые.';
  } else if (homePPU < readyPPU && yieldCount >= packCount){
    rec = 'Если семья больше 1-2 человек, домашние выгоднее и ещё получится больше штук — хороший выбор!';
  } else if (homePPU >= readyPPU && yieldCount < packCount){
    rec = 'Домашние дороже и штук получается меньше — готовые выглядят лучше.';
  } else {
    rec = 'Смотри по ситуации: сравни цену за штуку и сколько реально съедите за 1–2 дня, чтобы не выбрасывать еду.';
  }
  document.getElementById('recommendation').textContent = rec;

  document.getElementById('battle-section').classList.remove('hidden');

  // History
  const hist = JSON.parse(localStorage.getItem('rvh_history')||'[]');
  hist.unshift({
    title: `${readyName} vs ${recipe?.name||'Рецепт'} — ${packCount} vs ${yieldCount}`,
    result: winnerText,
    ts: Date.now()
  });
  localStorage.setItem('rvh_history', JSON.stringify(hist.slice(0,50)));
  renderHistory();
}

function renderHistory(){
  const list = document.getElementById('history');
  const hist = JSON.parse(localStorage.getItem('rvh_history')||'[]');
  list.innerHTML='';
  hist.forEach(item=>{
    const li = document.createElement('li');
    li.innerHTML = `<span>${item.title}</span><span>${item.result}</span>`;
    list.appendChild(li);
  });
}

function onLoadRecipe(){
  const id = document.getElementById('recipe-select').value;
  const r = findRecipe(id);
  if(!r){ alert('Рецепт не найден'); return; }
  renderIngredients(r);
}

function setup(){
  loadRecipes();
  renderHistory();
  document.getElementById('load-recipe').addEventListener('click', onLoadRecipe);
  document.getElementById('save-pricebook').addEventListener('click', ()=>{ savePricebookFromTable(); alert('Цены сохранены.'); });
  document.getElementById('compare').addEventListener('click', compareNow);
  document.getElementById('clear-history').addEventListener('click', ()=>{ localStorage.removeItem('rvh_history'); renderHistory(); });
}

document.addEventListener('DOMContentLoaded', setup);
