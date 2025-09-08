const currency = new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'});

// ==== Конвертер единиц ====
const UNIT = {
  piece: { toBase: x=>x, fromBase: x=>x, base:'piece', label:'шт.' },
  g:     { toBase: x=>x, fromBase: x=>x, base:'g',     label:'г'   },
  kg:    { toBase: x=>x*1000, fromBase: x=>x/1000, base:'g', label:'кг' },
  ml:    { toBase: x=>x, fromBase: x=>x, base:'ml', label:'мл' },
  l:     { toBase: x=>x*1000, fromBase: x=>x/1000, base:'ml', label:'л' }
};

// ==== Рецепты и поиск ====
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
}

function normalize(str){ return (str||'').toLowerCase().replace(/[ё]/g,'е').trim(); }

function searchRecipes(query){
  const q = normalize(query);
  if(!q) return [];
  return RECIPES.filter(r => normalize(r.name).includes(q) || normalize(r.category).includes(q)).slice(0, 10);
}

function renderSearchResults(list){
  const ul = document.getElementById('recipe-results');
  ul.innerHTML = '';
  if(list.length === 0){
    const li = document.createElement('li');
    li.textContent = 'Ничего не найдено';
    li.style.color = '#777';
    ul.appendChild(li);
    return;
  }
  list.forEach(r=>{
    const li = document.createElement('li');
    li.innerHTML = `<b>${r.name}</b> <small>(${r.category})</small>`;
    li.addEventListener('click', ()=>loadRecipe(r.id));
    ul.appendChild(li);
  });
}

function setupSearch(){
  const input = document.getElementById('recipe-search');
  let timer = null;
  input.addEventListener('input', ()=>{
    clearTimeout(timer);
    timer = setTimeout(()=>{
      const results = searchRecipes(input.value);
      renderSearchResults(results);
    }, 150);
  });
}

// ==== Ценовая книжка (за упаковку) ====
function loadPricebook(){ try{ return JSON.parse(localStorage.getItem('pricebook_pack')||'{}'); } catch { return {} } }
function savePricebook(pb){ localStorage.setItem('pricebook_pack', JSON.stringify(pb)); }

// ==== Рендер рецепта ====
let CURRENT_RECIPE = null;
function loadRecipe(id){
  const r = RECIPES.find(x=>x.id===id);
  if(!r){ alert('Рецепт не найден'); return; }
  CURRENT_RECIPE = r;
  document.getElementById('recipe-title').textContent = `3) Ингредиенты для: ${r.name}`;
  document.getElementById('recipe-meta').textContent = `${r.category} • стандартный выход: ${r.yieldCount} ${r.yieldName}`;

  // Таблица
  const tbody = document.getElementById('ingredients-body');
  tbody.innerHTML='';
  const pb = loadPricebook();
  r.ingredients.forEach(ing=>{
    const saved = pb[ing.name] || {};
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${ing.name}</td>
      <td><input type="number" step="0.01" min="0" value="${ing.qty}"></td>
      <td>
        <select>
          ${Object.keys(UNIT).map(u=>`<option value="${u}" ${u===ing.unit?'selected':''}>${UNIT[u].label}</option>`).join('')}
        </select>
      </td>
      <td><input type="number" step="0.01" min="0" value="${saved.packPrice ?? ''}" placeholder="цена за упаковку"></td>
      <td><input type="number" step="0.01" min="0" value="${saved.packSize ?? ''}" placeholder="объём упаковки"></td>
      <td>
        <select>
          ${Object.keys(UNIT).map(u=>`<option value="${u}" ${saved.packUnit===u?'selected':''}>${UNIT[u].label}</option>`).join('')}
        </select>
      </td>
      <td class="cost">—</td>
    `;
    tbody.appendChild(tr);
  });

  // Автоподстановка выхода из базы (редактируемо)
  const yieldInput = document.getElementById('recipe-yield');
  yieldInput.value = r.yieldCount;
  document.getElementById('yield-hint').textContent = `По умолчанию: ${r.yieldCount} ${r.yieldName} (можно изменить)`;
  document.getElementById('recipe-section').classList.remove('hidden');

  // Пересчёт
  tbody.querySelectorAll('input,select').forEach(el=>el.addEventListener('input', recalcTotals));
  yieldInput.addEventListener('input', recalcTotals);
  recalcTotals();
}

function recalcTotals(){
  const tbody = document.getElementById('ingredients-body');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  let total = 0;
  rows.forEach(row=>{
    const needQty   = parseFloat(row.children[1].querySelector('input').value)||0;
    const needUnit  = row.children[2].querySelector('select').value;
    const packPrice = parseFloat(row.children[3].querySelector('input').value)||0;
    const packSize  = parseFloat(row.children[4].querySelector('input').value)||0;
    const packUnit  = row.children[5].querySelector('select').value || needUnit;

    const needBase = UNIT[needUnit].toBase(needQty);
    const packBase = UNIT[packUnit].toBase(packSize);
    let cost = 0;
    if (packBase > 0) {
      const pricePerBase = packPrice / packBase;
      cost = needBase * pricePerBase;
    }
    row.children[6].textContent = currency.format(cost || 0);
    total += cost;
  });
  document.getElementById('recipe-total').textContent = currency.format(total);
  const yieldCount = Math.max(1, parseInt(document.getElementById('recipe-yield').value,10)||1);
  const ppu = total / yieldCount;
  document.getElementById('recipe-ppu').value = currency.format(ppu);
}

// ==== Сохранение цен ====
function savePricebookFromTable(){
  const tbody = document.getElementById('ingredients-body');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const pb = loadPricebook();
  rows.forEach(row=>{
    const name      = row.children[0].textContent;
    const packPrice = parseFloat(row.children[3].querySelector('input').value)||0;
    const packSize  = parseFloat(row.children[4].querySelector('input').value)||0;
    const packUnit  = row.children[5].querySelector('select').value;
    if(packPrice>0 && packSize>0){
      pb[name] = { packPrice, packSize, packUnit };
    }
  });
  savePricebook(pb);
  alert('Цены сохранены.');
}

// ==== Сравнение ====
function compareNow(){
  const readyName = document.getElementById('ready-name').value.trim() || 'Готовое блюдо';
  const packPrice = parseFloat(document.getElementById('ready-pack-price').value)||0;
  const packCount = Math.max(1, parseInt(document.getElementById('ready-pack-count').value,10)||1);
  const readyPPU = packPrice / packCount;

  const yieldCount = Math.max(1, parseInt(document.getElementById('recipe-yield').value,10)||1);
  const homeTotalText = document.getElementById('recipe-total').textContent;
  const homeTotal = Number(homeTotalText.replace(/[^0-9,.-]/g,'').replace(',','.')) || 0;
  const homePPU = homeTotal / yieldCount;

  document.getElementById('ready-summary-name').textContent = `Готовое: ${readyName}`;
  document.getElementById('ready-ppu').textContent = currency.format(readyPPU);
  document.getElementById('ready-total').textContent = currency.format(packPrice);
  document.getElementById('ready-count').textContent = packCount;

  const recipeName = CURRENT_RECIPE ? CURRENT_RECIPE.name : 'Рецепт';
  document.getElementById('home-summary-name').textContent = `Домашнее: ${recipeName}`;
  document.getElementById('home-ppu').textContent = currency.format(homePPU);
  document.getElementById('home-total').textContent = currency.format(homeTotal);
  document.getElementById('home-count').textContent = yieldCount;

  const cheaper = readyPPU < homePPU ? 'Готовое' : (homePPU < readyPPU ? 'Домашнее' : 'Ничья');
  const absDiff = Math.abs(readyPPU - homePPU);
  const pct = readyPPU===homePPU ? 0 : Math.round((absDiff / Math.max(readyPPU, homePPU))*100);
  const winnerText = cheaper==='Ничья' ? 'Ничья — одинаковая цена за штуку'
    : `Победитель: ${cheaper}! Отрыв ${pct}% (${currency.format(absDiff)} за штуку)`;
  document.getElementById('winner-text').textContent = winnerText;

  const gapbar = document.getElementById('gapbar');
  gapbar.style.background = cheaper==='Ничья'
    ? 'linear-gradient(90deg,#bbb,#bbb)'
    : 'linear-gradient(90deg, #00a86b '+pct+'%, #ff6a00 '+pct+'%)';

  const household = Math.max(1, parseInt(document.getElementById('household-size').value,10)||1);
  let rec = '';
  const packCountNum = packCount;
  const yieldNum = yieldCount;
  if(yieldNum > packCountNum && household===1 && homePPU >= readyPPU){
    rec = 'Для одного 12 шт. может быть избыточно, а домашние не дешевле — готовые рациональнее.';
  } else if (homePPU < readyPPU && yieldNum >= packCountNum && household >= 2){
    rec = 'Для семьи домашние выгоднее и ещё получится больше штук — отличный выбор!';
  } else if (homePPU >= readyPPU && yieldNum < packCountNum){
    rec = 'Домашние дороже и выход меньше — готовые выглядят лучше.';
  } else {
    rec = 'Сравни цену за штуку и реальное потребление, чтобы не выбрасывать еду.';
  }
  document.getElementById('recommendation').textContent = rec;

  document.getElementById('battle-section').classList.remove('hidden');
}

// ==== Старт ====
function setup(){
  loadRecipes().then(()=>{
    setupSearch();
  });
  document.getElementById('save-pricebook').addEventListener('click', savePricebookFromTable);
  document.getElementById('compare').addEventListener('click', compareNow);
}

document.addEventListener('DOMContentLoaded', setup);
