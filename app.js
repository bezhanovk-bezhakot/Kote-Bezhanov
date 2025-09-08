const currency = new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'});

// Конвертер единиц
const UNIT = {
  piece: { toBase: x=>x, fromBase: x=>x, base:'piece', label:'шт.' },
  g:     { toBase: x=>x, fromBase: x=>x, base:'g',     label:'г'   },
  kg:    { toBase: x=>x*1000, fromBase: x=>x/1000, base:'g', label:'кг' },
  ml:    { toBase: x=>x, fromBase: x=>x, base:'ml', label:'мл' },
  l:     { toBase: x=>x*1000, fromBase: x=>x/1000, base:'ml', label:'л' }
};

// Локальная ценовая книжка: { [ingredientName]: { packPrice, packSize, packUnit } }
function loadPricebook(){ try{ return JSON.parse(localStorage.getItem('pricebook_pack')||'{}'); } catch { return {} } }
function savePricebook(pb){ localStorage.setItem('pricebook_pack', JSON.stringify(pb)); }

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
    const o = document.createElement('option'); o.value=''; o.textContent='(Нет базы рецептов)'; sel.appendChild(o); return;
  }
  const groups = RECIPES.reduce((acc,r)=>(acc[r.category]=acc[r.category]||[]).push(r)&&acc,{});
  for(const [cat, list] of Object.entries(groups)){
    const og = document.createElement('optgroup'); og.label = cat;
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

function renderIngredients(recipe){
  const tbody = document.getElementById('ingredients-body');
  const pb = loadPricebook();
  tbody.innerHTML = '';
  recipe.ingredients.forEach((ing)=>{
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
  document.getElementById('recipe-yield').value = recipe.yieldCount;
  document.getElementById('recipe-section').classList.remove('hidden');

  tbody.querySelectorAll('input,select').forEach(el=>el.addEventListener('input', recalcTotals));
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
      const pricePerBase = packPrice / packBase; // цена за 1 базовую единицу
      cost = needBase * pricePerBase;            // доля от упаковки
    }
    row.children[6].textContent = currency.format(cost || 0);
    total += cost;
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
    const name      = row.children[0].textContent;
    const packPrice = parseFloat(row.children[3].querySelector('input').value)||0;
    const packSize  = parseFloat(row.children[4].querySelector('input').value)||0;
    const packUnit  = row.children[5].querySelector('select').value;
    if(packPrice>0 && packSize>0){
      pb[name] = { packPrice, packSize, packUnit };
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

  document.getElementById('ready-summary-name').textContent = `Готовое: ${readyName}`;
  document.getElementById('ready-ppu').textContent = currency.format(readyPPU);
  document.getElementById('ready-total').textContent = currency.format(packPrice);
  document.getElementById('ready-count').textContent = packCount;

  const recipeId = document.getElementById('recipe-select').value;
  const recipe = RECIPES.find(r=>r.id===recipeId);
  document.getElementById('home-summary-name').textContent = `Домашнее: ${recipe?.name||'Рецепт'}`;
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

  // Простая рекомендация по семье
  const household = Math.max(1, parseInt(document.getElementById('household-size').value,10)||1);
  let rec = '';
  if(yieldCount > packCount && household===1 && homePPU >= readyPPU){
    rec = 'Для одного 12 шт. может быть избыточно, а домашние не дешевле — готовые рациональнее.';
  } else if (homePPU < readyPPU && yieldCount >= packCount && household >= 2){
    rec = 'Для семьи домашние выгоднее и ещё получится больше штук — отличный выбор!';
  } else if (homePPU >= readyPPU && yieldCount < packCount){
    rec = 'Домашние дороже и выход меньше — готовые выглядят лучше.';
  } else {
    rec = 'Сравни цену за штуку и реальное потребление, чтобы не выбрасывать еду.';
  }
  document.getElementById('recommendation').textContent = rec;

  document.getElementById('battle-section').classList.remove('hidden');
}

function onLoadRecipe(){
  const id = document.getElementById('recipe-select').value;
  const r = RECIPES.find(x=>x.id===id);
  if(!r){ alert('Рецепт не найден'); return; }
  renderIngredients(r);
}

function setup(){
  loadRecipes();
  document.getElementById('load-recipe').addEventListener('click', onLoadRecipe);
  document.getElementById('save-pricebook').addEventListener('click', ()=>{ savePricebookFromTable(); alert('Цены сохранены.'); });
  document.getElementById('compare').addEventListener('click', compareNow);
}

document.addEventListener('DOMContentLoaded', setup);
