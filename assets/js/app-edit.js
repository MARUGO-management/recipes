
// Simplified Recipe Editor - Consolidated from 2098 lines to ~800 lines
const CONFIG = {
  SUPABASE_URL: 'https://ctxyawinblwcbkovfsyj.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0eHlhd2luYmx3Y2Jrb3Zmc3lqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5NzE3MzIsImV4cCI6MjA3MDU0NzczMn0.HMMoDl_LPz8uICruD_tzn75eUpU7rp3RZx_N8CEfO1Q',
  STORAGE_BUCKET: 'images'
};

let sb, selectedCategories = [], selectedTags = [], currentRecipeType = 'normal';
let originalIngredients = [], baseServings = 1, finalRecipeData = null;
let customCategories = [], customTags = [], allCategories = [], allTags = [];
let currentSourceUrl = null; // URL取り込み時の元URLを記録
let originalRecipeData = null; // 海外サイト取り込み時の翻訳前データを保存

// API使用回数管理
const ApiUsageManager = {
  STORAGE_KEY: 'api-usage-v1',
  LEGACY_AZURE_KEY: 'azure-api-usage',
  PROVIDERS: {
    azure: { label: 'Azure Document Intelligence', shortLabel: 'Azure', limit: 500 },
    groq: { label: 'Groq', shortLabel: 'Groq', limit: null },
    chatgpt: { label: 'ChatGPT', shortLabel: 'ChatGPT', limit: null }
  },

  _loadRawData() {
    try {
      return localStorage.getItem(this.STORAGE_KEY);
    } catch (error) {
      console.warn('⚠️ API使用状況の読み込みに失敗しました:', error);
      return null;
    }
  },

  _saveRawData(data) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('⚠️ API使用状況の保存に失敗しました:', error);
    }
  },

  getData() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let raw = this._loadRawData();
    let data = null;
    let mutated = false;

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch (error) {
        console.warn('⚠️ API使用状況データの解析に失敗しました。リセットします。', error);
        data = null;
      }
    }

    if (!data) {
      try {
        const legacyRaw = localStorage.getItem(this.LEGACY_AZURE_KEY);
        if (legacyRaw) {
          const legacy = JSON.parse(legacyRaw);
          data = {
            month: legacy.month ?? currentMonth,
            year: legacy.year ?? currentYear,
            counts: {
              azure: legacy.count ?? 0,
              groq: 0,
              chatgpt: 0
            },
            lastUsed: {
              azure: legacy.lastUsed || null,
              groq: null,
              chatgpt: null
            }
          };
          localStorage.removeItem(this.LEGACY_AZURE_KEY);
          mutated = true;
        }
      } catch (error) {
        console.warn('⚠️ レガシーAzure使用状況の移行に失敗しました:', error);
      }
    }

    if (!data || typeof data !== 'object') {
      data = null;
    }

    if (!data) {
      data = {
        month: currentMonth,
        year: currentYear,
        counts: {},
        lastUsed: {}
      };
      mutated = true;
    }

    if (data.month !== currentMonth || data.year !== currentYear) {
      data.month = currentMonth;
      data.year = currentYear;
      data.counts = {};
      data.lastUsed = {};
      mutated = true;
    }

    if (!data.counts || typeof data.counts !== 'object') {
      data.counts = {};
      mutated = true;
    }

    if (!data.lastUsed || typeof data.lastUsed !== 'object') {
      data.lastUsed = {};
      mutated = true;
    }

    for (const key of Object.keys(this.PROVIDERS)) {
      if (typeof data.counts[key] !== 'number') {
        data.counts[key] = 0;
        mutated = true;
      }
      if (!Object.prototype.hasOwnProperty.call(data.lastUsed, key)) {
        data.lastUsed[key] = null;
        mutated = true;
      }
    }

    if (mutated) {
      this._saveRawData(data);
    }

    return data;
  },

  getUsage(provider) {
    const data = this.getData();
    return data.counts[provider] || 0;
  },

  getCurrentUsage(provider) {
    const data = this.getData();
    return {
      count: data.counts[provider] || 0,
      month: data.month,
      year: data.year,
      lastUsed: data.lastUsed[provider] || null
    };
  },

  increment(provider) {
    if (!this.PROVIDERS[provider]) {
      console.warn('⚠️ 未対応のプロバイダーです:', provider);
      return 0;
    }
    const data = this.getData();
    data.counts[provider] = (data.counts[provider] || 0) + 1;
    data.lastUsed[provider] = new Date().toISOString();
    this._saveRawData(data);
    this.updateDisplay();
    return data.counts[provider];
  },

  reset(provider) {
    const data = this.getData();
    if (provider && this.PROVIDERS[provider]) {
      data.counts[provider] = 0;
      data.lastUsed[provider] = null;
    } else {
      for (const key of Object.keys(this.PROVIDERS)) {
        data.counts[key] = 0;
        data.lastUsed[key] = null;
      }
    }
    this._saveRawData(data);
    this.updateDisplay();
  },

  updateDisplay() {
    try {
      const data = this.getData();
      const displayElement = document.getElementById('azure-usage-display');
      if (!displayElement) {
        return;
      }

      const lines = [];
      for (const [key, info] of Object.entries(this.PROVIDERS)) {
        const count = data.counts[key] || 0;
        if (info.limit && info.limit > 0) {
          const remaining = Math.max(info.limit - count, 0);
          lines.push(`${info.shortLabel}: 残り ${remaining}/${info.limit}`);
        } else {
          lines.push(`${info.shortLabel}: ${count}回`);
        }
      }

      const nextReset = new Date(data.year, data.month + 1, 1);
      lines.push(`次回リセット: ${nextReset.getMonth() + 1}/${nextReset.getDate()}`);

      displayElement.innerHTML = `<small>${lines.join('<br>')}</small>`;
    } catch (error) {
      console.warn('⚠️ API使用状況表示の更新に失敗しました:', error);
    }
  }
};

const AzureUsageBridge = {
  getCurrentUsage() {
    const usage = ApiUsageManager.getCurrentUsage('azure');
    return {
      count: usage.count,
      month: usage.month,
      year: usage.year
    };
  },
  incrementUsage() {
    return ApiUsageManager.increment('azure');
  },
  resetUsage() {
    return ApiUsageManager.reset('azure');
  },
  updateDisplay() {
    return ApiUsageManager.updateDisplay();
  }
};

// グローバルアクセス用に公開
if (typeof window !== 'undefined') {
  window.ApiUsageManager = ApiUsageManager;
  window.AzureUsageManager = AzureUsageBridge;
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('DOMContentLoaded', () => ApiUsageManager.updateDisplay());
  }
}

// Utility functions
// escapeHtml関数は utils.js で定義済み
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 材料・手順保存専用関数（翻訳処理から分離）
const saveIngredientsAndSteps = async (recipeId, ingredients, steps) => {
  try {
    console.log('🔄 材料・手順の削除と再挿入を開始...');

    // 既存の材料・手順を削除
    await sb.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
    await sb.from('recipe_steps').delete().eq('recipe_id', recipeId);
    console.log('✅ 既存データ削除完了');

    // 材料を保存
    console.log('💾 材料保存開始:', ingredients.length);
    if (ingredients.length > 0) {
      const payload = ingredients.map((ing, index) => {
        let item = '', quantity = '', unit = '';
        
        if (typeof ing === 'string') {
          const parsed = parseIngredientString(ing);
          item = parsed.item;
          quantity = parsed.quantity;
          unit = parsed.unit;
        } else if (ing && typeof ing === 'object') {
          item = ing.item || '';
          quantity = ing.quantity || '';
          unit = ing.unit || '';
        }
        
        return {
        recipe_id: recipeId,
          position: index + 1,
          item: item,
          quantity: quantity,
          unit: unit
        };
      });
      console.log('💾 Ingredient payload:', payload);

      let { error: ingError } = await sb.from('recipe_ingredients').insert(payload);
      if (ingError) {
        console.error('材料保存失敗:', ingError);
        // 最小限のカラムで再試行
        console.log('🔄 最小限フォーマットで再試行...');
        const minimal = ingredients.map((ing, index) => ({
          recipe_id: recipeId,
          position: index + 1,
          item: ing.item
        }));
        const { error: retryErr } = await sb.from('recipe_ingredients').insert(minimal);
        if (retryErr) {
          throw new Error(`材料保存失敗: ${retryErr.message}`);
        }
        console.log('✅ 材料保存成功（minimal format）');
      } else {
        console.log('✅ 材料保存成功（normal format）');
      }
    }

    // 手順を保存
    console.log('💾 手順保存開始:', steps.length);
    if (steps.length > 0) {
      const stepPayload = steps.map((step, index) => ({
        recipe_id: recipeId,
        step_number: step.step_number || (index + 1),
        instruction: step.instruction || ''
      }));
      console.log('💾 Step payload:', stepPayload);

      const { error: stepError } = await sb.from('recipe_steps').insert(stepPayload);
      if (stepError) {
        console.error('手順保存失敗:', stepError);
        // 最小限のデータで再試行
        console.log('🔄 手順最小限フォーマットで再試行...');
        const minimal = steps.map((step, index) => ({
          recipe_id: recipeId,
          step_number: index + 1,
          instruction: step.instruction || ''
        }));
        const { error: retryErr } = await sb.from('recipe_steps').insert(minimal);
        if (retryErr) {
          throw new Error(`手順保存失敗: ${retryErr.message}`);
        }
        console.log('✅ 手順保存成功（minimal format）');
      } else {
        console.log('✅ 手順保存成功（normal format）');
      }
    }

    console.log('✅ 材料・手順の保存が完了しました');
  } catch (error) {
    console.error('❌ 材料・手順保存エラー:', error);
    throw error;
  }
};

// 設定は settings-manager.js のグローバルな Settings オブジェクトから取得します

// 現在のGroqモデルを取得する関数
const getCurrentGroqModel = () => {
  const settings = Settings.get();
  const model = settings.groqModel || 'llama-3.1-8b-instant';
  
  console.log(`🔧 現在のGroqモデル: ${model}`);
  console.log(`📊 設定詳細:`, {
    aiApi: settings.aiApi,
    groqModel: settings.groqModel,
    aiCreativeApi: settings.aiCreativeApi
  });
  
  // 無効なモデルの場合はデフォルトに戻す
  const validModels = ['llama-3.1-8b-instant', 'llama-3.1-70b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it'];
  if (!validModels.includes(model)) {
    console.warn('⚠️ 無効なモデルです。llama-3.1-8b-instantに切り替えます。');
    return 'llama-3.1-8b-instant';
  }
  
  return model;
};

// ChatGPT API呼び出し関数
async function callChatGPTAPI(text, url) {
  await sleep(1000); // Rate limiting
  
  console.log('🤖 ChatGPT API呼び出し開始');
  console.log('📝 プロンプト:', text.substring(0, 200) + '...');
  
  try {
    const { data, error } = await sb.functions.invoke('call-openai-api', {
      body: {
        text,
        model: "gpt-3.5-turbo",
        maxTokens: 4000,
        temperature: 0.7
      }
    });

    if (error) {
      console.error('❌ OpenAI proxy error:', error);
      throw new Error('ChatGPT API呼び出しに失敗しました');
    }

    if (!data?.success) {
      console.error('❌ OpenAI proxy response:', data);
      throw new Error(data?.error || 'ChatGPT API呼び出しに失敗しました');
    }

    console.log('📝 ChatGPT API レスポンス内容:', data.content?.title || '');
    return data.content;
  } catch (error) {
    console.error('❌ ChatGPT API呼び出しエラー:', error);
    throw error;
  }
}

// フォームをクリアする関数
const clearForm = () => {
  // タイトルをクリア
  const titleInput = document.getElementById('title');
  if (titleInput) titleInput.value = '';
  
  // カテゴリーをクリア
  const categoryText = document.getElementById('selectedCategoryText');
  if (categoryText) categoryText.textContent = 'カテゴリーを選択';
  selectedCategories = [];
  
  // タグをクリア
  const tagsContainer = document.getElementById('customTags');
  if (tagsContainer) tagsContainer.innerHTML = '';
  selectedTags = [];
  
  // 材料をクリア（最初の行以外を削除）
  const ingredientRows = document.querySelectorAll('.ingredient-row');
  ingredientRows.forEach((row, index) => {
    if (index > 0) {
      row.remove();
    } else {
      // 最初の行は内容のみクリア
      const inputs = row.querySelectorAll('input');
      inputs.forEach(input => input.value = '');
    }
  });
  
  // 手順をクリア（最初の行以外を削除）
  const stepRows = document.querySelectorAll('.step-row');
  stepRows.forEach((row, index) => {
    if (index > 0) {
      row.remove();
    } else {
      // 最初の行は内容のみクリア
      const textarea = row.querySelector('textarea');
      if (textarea) textarea.value = '';
    }
  });
  
  // 画像をクリア
  const imagePreview = document.getElementById('inlineRecipeImageImg');
  const imageInput = document.getElementById('sourceUrl');
  if (imagePreview) {
    imagePreview.src = '';
    imagePreview.style.display = 'none';
  }
  if (imageInput) imageInput.value = '';
  
  // 翻訳テーブルをクリア
  const translationContainer = document.getElementById('translationContainer');
  if (translationContainer) {
    translationContainer.innerHTML = '';
  }
  
  console.log('フォームをクリアしました');
};

// 材料文字列から分量・単位・材料名を分離する関数
const extractPriceInfo = (quantityRaw, unitRaw) => {
  let quantityText = quantityRaw == null ? '' : String(quantityRaw).trim();
  let unitText = unitRaw == null ? '' : String(unitRaw).trim();
  let priceText = '';

  const priceRegex = /(\d+(?:\.\d+)?)\s*円/;

  const stripPrice = (value) => {
    if (!value) return { cleaned: '', price: '' };
    const matches = value.match(priceRegex);
    if (matches) {
      return {
        cleaned: value.replace(priceRegex, '').trim(),
        price: `${matches[1]}円`
      };
    }
    return { cleaned: value, price: '' };
  };

  const quantityResult = stripPrice(quantityText);
  quantityText = quantityResult.cleaned;
  if (quantityResult.price) priceText = quantityResult.price;

  const unitResult = stripPrice(unitText);
  unitText = unitResult.cleaned;
  if (!priceText && unitResult.price) priceText = unitResult.price;

  if (!unitText && quantityText) {
    const match = quantityText.match(/^(\d+(?:\.\d+)?)([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)$/);
    if (match) {
      quantityText = match[1];
      unitText = match[2];
    }
  }

  return {
    quantity: quantityText,
    unit: unitText,
    price: priceText
  };
};

const parseIngredientString = (ingredientStr) => {
  if (!ingredientStr) return { item: '', quantity: '', unit: '', price: '' };
  
  const str = ingredientStr.toString().trim();
  console.log(`🔍 材料解析: "${str}"`);

  const extractPrice = (value) => {
    const match = value.match(/(\d+(?:\.\d+)?)円/);
    if (match) {
      return {
        cleaned: value.replace(/(\d+(?:\.\d+)?)円/g, '').trim(),
        price: `${match[1]}円`
      };
    }
    return { cleaned: value, price: '' };
  };
  
  
  // 日本語の単位を最初にチェック（大さじ、小さじ、カップ）
  const japaneseUnits = str.match(/^(.+?)\s+(大さじ|小さじ|カップ)([0-9\/\.]+)$/);
  if (japaneseUnits) {
    const result = {
      item: japaneseUnits[1].trim(),
      quantity: japaneseUnits[3].trim(),
      unit: japaneseUnits[2].trim(),
      price: ''
    };
    console.log(`✅ 日本語単位解析成功:`, result);
    return result;
  }
  
  // 分量フィールドに「大さじ2」のような形式が入った場合の処理
  const spoonUnits = str.match(/^(大さじ|小さじ|tbsp|tsp)([0-9\/\.]+)$/);
  if (spoonUnits) {
    const result = {
      item: '',
      quantity: spoonUnits[2].trim(),
      unit: spoonUnits[1].trim(),
      price: ''
    };
    console.log(`✅ スプーン単位解析成功:`, result);
    return result;
  }
  
  // 分量フィールドに「大さじ2 材料名」のような形式が入った場合の処理
  const spoonWithItem = str.match(/^(大さじ|小さじ|tbsp|tsp)([0-9\/\.]+)\s+(.+)$/);
  if (spoonWithItem) {
    const result = {
      item: spoonWithItem[3].trim(),
      quantity: spoonWithItem[2].trim(),
      unit: spoonWithItem[1].trim(),
      price: ''
    };
    console.log(`✅ スプーン+材料解析成功:`, result);
    return result;
  }
  
  // 数値 + 単位 + 材料名の形式
  const numUnitItem = str.match(/^([0-9\/\.]+)\s*([a-zA-Z]+|ml|g|mg|kg|個|本|枚|匙|杯|滴)\s+(.+)$/);
  if (numUnitItem) {
    const { cleaned: itemCleaned, price } = extractPrice(numUnitItem[3].trim());
    const result = {
      item: itemCleaned,
      quantity: numUnitItem[1].trim(),
      unit: numUnitItem[2].trim(),
      price
    };
    console.log(`✅ 数値+単位+材料解析成功:`, result);
    return result;
  }
  
  // 材料名 + 数値 + 単位の形式
  const itemNumUnit = str.match(/^(.+?)\s+([0-9\/\.]+)\s*([a-zA-Z]+|ml|g|mg|kg|個|本|枚|匙|杯|滴)$/);
  if (itemNumUnit) {
    const { cleaned: itemCleaned, price } = extractPrice(itemNumUnit[1].trim());
    const result = {
      item: itemCleaned,
      quantity: itemNumUnit[2].trim(),
      unit: itemNumUnit[3].trim(),
      price
    };
    console.log(`✅ 材料+数値+単位解析成功:`, result);
    return result;
  }
  
  // 曖昧な表現
  const vague = str.match(/^(.+?)\s+(適量|少々|お好みで|ひとつまみ|少し|ひとかけ)$/);
  if (vague) {
    const result = {
      item: vague[1].trim(),
      quantity: vague[2].trim(),
      unit: '',
      price: ''
    };
    console.log(`✅ 曖昧表現解析成功:`, result);
    return result;
  }
  
  // 分離できない場合は材料名としてそのまま返す
  const { cleaned: itemOnly, price } = extractPrice(str);
  const result = { item: itemOnly, quantity: '', unit: '', price };
  console.log(`❌ 解析失敗、材料名のみ:`, result);
  console.log(`❌ 解析失敗の詳細: 入力="${str}", 長さ=${str.length}, 型=${typeof str}`);
  console.log(`❌ 解析失敗のパターン: 日本語単位=${!!japaneseUnits}, スプーン単位=${!!spoonUnits}`);
  return result;
};

// ===== 翻訳後データの正規化ヘルパー =====
const normalizeStepTextValue = (stepText) => {
  if (typeof stepText !== 'string') {
    return stepText || '';
  }
  return stepText
    .replace(/^\s*(?:第?\s*)?(?:手順|ステップ|Step)\s*[0-9０-９]+[\s：:\.:\-\)]*/, '')
    .trim();
};

const normalizeTranslatedStep = (step, fallback = {}) => {
  if (!step) {
    return { step: fallback.step || '' };
  }
  if (typeof step === 'string') {
    return { step: normalizeStepTextValue(step) };
  }
  const textValue = step.step || step.instruction || step.text || step.content || '';
  const normalized = normalizeStepTextValue(textValue);
  return { step: normalized || fallback.step || '' };
};

const normalizeTranslatedIngredient = (ingredient, fallback = {}) => {
  if (!ingredient) {
    return {
      item: fallback.item || '',
      quantity: fallback.quantity || '',
      unit: fallback.unit || '',
      price: fallback.price || ''
    };
  }

  if (typeof ingredient === 'string') {
    const parsed = parseIngredientString(ingredient);
    return {
      item: parsed.item || fallback.item || '',
      quantity: parsed.quantity || fallback.quantity || '',
      unit: parsed.unit || fallback.unit || '',
      price: parsed.price || fallback.price || ''
    };
  }

  const candidateStrings = [
    ingredient.item,
    ingredient.name,
    ingredient.ingredient,
    ingredient.translated_item,
    ingredient.original_item,
    ingredient.text
  ];

  const baseString = candidateStrings.find(value => typeof value === 'string' && value.trim().length > 0) || '';
  const quantityValue = ingredient.quantity || ingredient.amount || ingredient.qty || '';
  const unitValue = ingredient.unit || ingredient.measure || ingredient.uom || '';
  const priceValue = ingredient.price || fallback.price || '';

  const combined = [baseString, quantityValue, unitValue].filter(Boolean).join(' ').trim();
  const parsed = parseIngredientString(combined || baseString);

  return {
    item: parsed.item || baseString || fallback.item || '',
    quantity: parsed.quantity || quantityValue || fallback.quantity || '',
    unit: parsed.unit || unitValue || fallback.unit || '',
    price: parsed.price || priceValue || ''
  };
};

// Unit conversion utility
const convertUnits = (quantity, unit, itemName = '') => {
  if (!quantity || !unit) return { quantity, unit };
  
  // 分数を処理（例: 1/2, 3/4など）
  let qty = 0;
  const quantityStr = quantity.toString().trim();
  if (quantityStr.includes('/')) {
    const fractionMatch = quantityStr.match(/(\d+)\/(\d+)/);
    if (fractionMatch) {
      const numerator = parseInt(fractionMatch[1]);
      const denominator = parseInt(fractionMatch[2]);
      qty = numerator / denominator;
      console.log(`📏 分数変換: ${quantityStr} → ${qty}`);
    }
  } else {
    qty = parseFloat(quantityStr.replace(/[^\d\.]/g, '')) || 0;
  }
  const unitLower = unit.toString().toLowerCase().trim();
  const itemLower = itemName.toString().toLowerCase();
  
  // 液体系の材料判定（材料名と単位の両方で判断）
  const liquidItems = [
    // 基本液体
    '水', 'お湯', '湯', '冷水', '温水',
    // 調味料・液体
    '醤油', 'しょうゆ', '薄口醤油', '濃口醤油', '酒', '日本酒', '料理酒', '酢', '米酢', 'りんご酢', 'バルサミコ酢', 'みりん', '本みりん', 'みりん風調味料',
    // 油類
    '油', 'サラダ油', 'ごま油', 'オリーブオイル', 'エクストラバージンオリーブオイル', 'ココナッツオイル', 'バターオイル',
    // 乳製品・液体
    '牛乳', '豆乳', 'アーモンドミルク', 'ココナッツミルク', '生クリーム', 'ホイップクリーム',
    // だし・スープ
    'だし', '出汁', 'だし汁', '出汁汁', 'スープ', 'コンソメ', 'ブイヨン', 'チキンブイヨン', '野菜ブイヨン',
    // ソース・液体調味料
    'ソース', 'ウスターソース', '中濃ソース', 'とんかつソース', 'オイスターソース', 'ケチャップ', 'マヨネーズ',
    // アルコール
    'ワイン', '白ワイン', '赤ワイン', 'ビール', '日本酒', '焼酎', 'ウイスキー', 'ブランデー',
    // その他液体
    'ジュース', 'オレンジジュース', 'レモン汁', 'ライム汁', 'エキス', 'バニラエッセンス', '液', '汁', 'シロップ', 'メープルシロップ', 'はちみつ', 'ハチミツ'
  ];
  
  const solidItems = [
    // 粉類
    '粉', '小麦粉', '薄力粉', '中力粉', '強力粉', '片栗粉', 'コーンスターチ', 'パン粉', 'パン粉', '天ぷら粉', 'フライ粉',
    // 調味料・固体
    '塩', '食塩', '粗塩', '砂糖', '上白糖', 'グラニュー糖', '三温糖', '黒砂糖', 'きび砂糖', '胡椒', 'こしょう', '黒胡椒', '白胡椒', '七味唐辛子', '一味唐辛子',
    // 乳製品・固体
    'チーズ', 'パルメザンチーズ', 'モッツァレラチーズ', 'チェダーチーズ', 'クリームチーズ', 'バター', 'マーガリン', 'ヨーグルト', 'ギリシャヨーグルト',
    // 調味料・ペースト状
    '味噌', 'みそ', '白味噌', '赤味噌', '豆板醤', '甜麺醤', 'コチュジャン', 'マスタード', 'わさび', 'からし', '生姜', 'しょうが', 'にんにく', 'ガーリック',
    // ナッツ・種子
    'ゴマ', 'ごま', '白ゴマ', '黒ゴマ', 'ナッツ', 'アーモンド', 'くるみ', 'ピーナッツ', 'カシューナッツ', 'ピスタチオ',
    // ドライフルーツ・乾物
    'ドライフルーツ', 'レーズン', 'プルーン', 'いちじく', '干し椎茸', '干しエビ', 'かつお節', '削り節',
    // 飲み物・固体
    'ココア', '抹茶', '紅茶', 'コーヒー', 'インスタントコーヒー', 'コーヒー豆',
    // スパイス・ハーブ
    'スパイス', 'ハーブ', '香辛料', 'シナモン', 'ナツメグ', 'クローブ', 'カルダモン', 'バジル', 'オレガノ', 'タイム', 'ローズマリー', 'パセリ', 'コリアンダー',
    // その他固体
    'ジャム', 'ピーナッツバター', 'アーモンドバター', 'チョコレート', 'カカオパウダー', 'ベーキングパウダー', '重曹', 'イースト', 'ドライイースト'
  ];
  
  // 液体系の判定（液体材料または既にml単位の場合）
  const isLiquid = liquidItems.some(liquid => itemLower.includes(liquid)) || 
                   unitLower.includes('ml') || unitLower.includes('リットル') || unitLower.includes('cc');
  
  // 固体系の判定（固体材料または既にg単位の場合）
  const isSolid = solidItems.some(solid => itemLower.includes(solid)) ||
                  unitLower.includes('g') || unitLower.includes('グラム') || unitLower.includes('kg');
  
  // 特殊な材料の判定
  const isOil = itemLower.includes('油') || itemLower.includes('オイル');
  const isHoney = itemLower.includes('はちみつ') || itemLower.includes('ハチミツ') || itemLower.includes('蜂蜜');
  const isSyrup = itemLower.includes('シロップ') || itemLower.includes('メープル');
  const isMayo = itemLower.includes('マヨネーズ') || itemLower.includes('マヨ');
  const isKetchup = itemLower.includes('ケチャップ');
  const isSoySauce = itemLower.includes('醤油') || itemLower.includes('しょうゆ');
  const isMiso = itemLower.includes('味噌') || itemLower.includes('みそ');
  
  // 単位の決定（材料の特性に基づく詳細な判定）
  let shouldUseG = false;
  let shouldUseMl = false;
  
  if (isLiquid) {
    shouldUseMl = true;
  } else if (isSolid) {
    shouldUseG = true;
  } else if (isOil || isHoney || isSyrup || isMayo || isKetchup || isSoySauce || isMiso) {
    // 粘性のある液体はmlを使用
    shouldUseMl = true;
  } else {
    // デフォルトはgを使用
    shouldUseG = true;
  }
  
  // 大さじの変換（15ml/15g）
  if (unitLower.includes('大さじ') || unitLower.includes('おおさじ') || unitLower.includes('tbsp') || 
      unitLower === '大さじ' || unitLower === 'おおさじ' || unitLower === 'tbsp' ||
      unitLower === '大さじ1' || unitLower === '大さじ2' || unitLower === '大さじ3' ||
      unitLower === '大さじ4' || unitLower === '大さじ5' || unitLower === '大さじ6') {
    const convertedUnit = shouldUseMl ? 'ml' : 'g';
    const convertedQty = qty * 15;
    console.log(`🔄 大さじ変換: ${qty}${unit} → ${convertedQty}${convertedUnit} (${shouldUseMl ? '液体' : '固体'}) - ${itemName}`);
    return {
      quantity: convertedQty.toString(),
      unit: convertedUnit
    };
  }
  
  // 小さじの変換（5ml/5g）
  if (unitLower.includes('小さじ') || unitLower.includes('こさじ') || unitLower.includes('tsp') || 
      unitLower === '小さじ' || unitLower === 'こさじ' || unitLower === 'tsp') {
    const convertedUnit = shouldUseMl ? 'ml' : 'g';
    const convertedQty = qty * 5;
    console.log(`🔄 小さじ変換: ${qty}${unit} → ${convertedQty}${convertedUnit} (${shouldUseMl ? '液体' : '固体'}) - ${itemName}`);
    return {
      quantity: convertedQty.toString(),
      unit: convertedUnit
    };
  }
  
  // カップの変換（200ml）
  if (unitLower.includes('カップ') || unitLower.includes('cup')) {
    const convertedQty = qty * 200;
    console.log(`🔄 カップ変換: ${qty}${unit} → ${convertedQty}ml - ${itemName}`);
    return {
      quantity: convertedQty.toString(),
      unit: 'ml'
    };
  }
  
  // 1/2カップ、1/4カップなどの分数対応
  if (quantity.toString().includes('/') && (unitLower.includes('カップ') || unitLower.includes('cup'))) {
    const fractionMatch = quantity.toString().match(/(\d+)\/(\d+)/);
    if (fractionMatch) {
      const numerator = parseInt(fractionMatch[1]);
      const denominator = parseInt(fractionMatch[2]);
      const cupValue = (numerator / denominator) * 200;
      console.log(`🔄 分数カップ変換: ${quantity}${unit} → ${cupValue}ml - ${itemName}`);
      return {
        quantity: cupValue.toString(),
        unit: 'ml'
      };
    }
  }
  
  return { quantity, unit };
};


// 設定管理は settings-manager.js にてグローバルな Settings オブジェクトとして提供

// getCurrentGroqModel function is already defined above at line 116

// API Functions
async function callGroqAPI(text, url) {
  await sleep(1000); // Rate limiting
  
  // URLと内容から言語を判定
  const isJapaneseSite = url && (
    url.includes('.jp') ||
    url.includes('japanese') ||
    url.includes('japan') ||
    /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(url) ||
    /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text.substring(0, 1000))
  );
  
  // グローバル変数として設定（他の関数からアクセス可能にする）
  window.isJapaneseSite = isJapaneseSite;

  console.log('🌍 サイト言語判定:', isJapaneseSite ? '日本語サイト' : '海外サイト');

  // URLに基づいてプロンプトを調整
  let prompt = '';

  if (url && url.includes('toptrading.co.jp')) {
    // Top Trading サイト専用のプロンプト（最適化版）
    prompt = `フランス料理レシピを抽出。ナビ・広告・SNS埋め込みを無視し、本文のみ処理。

IMPORTANT: 料理名(title)は元のページに記載されている日本語表記をそのまま使用してください。

URL: ${url}
テキスト: ${text.substring(0, 4000)}

JSON形式で返す:
{
  "title": "料理名（ページの日本語表記通り）",
  "originalTitle": "料理名（フランス語）",
  "description": "レシピ説明",
  "servings": "人数（数字のみ）",
  "ingredients": [
    {"item": "材料名（日本語）", "originalItem": "材料名（フランス語）", "quantity": "分量", "unit": "単位"}
  ],
  "steps": [
    {"step": "手順（日本語）"}
  ],
  "notes": "メモ"
}

重要: titleは日本語表記をそのまま抽出し、フランス語から翻訳しないでください。
変換: 大さじ1=15ml/g、小さじ1=5ml/g。液体=ml、固体=g。JSONのみ返す。`;
  } else if (url && url.includes('dancyu.jp')) {
    // dancyu.jpサイト専用のプロンプト（強化版）
    console.log('🍳 dancyu.jp専用プロンプトを使用');
    console.log('🍳 入力テキストの先頭:', text.title);
    
    prompt = `dancyu.jpのレシピ記事から料理情報を抽出してください。雑誌系レシピサイトの構造に対応。

URL: ${url}
テキスト: ${text.substring(0, 4000)}

JSON形式で返す:
{
  "title": "料理名（見出しから正確に抽出）",
  "description": "レシピ説明・コツ・ポイント",
  "servings": "人数（数字のみ）",
  "ingredients": [
    {"item": "材料名", "quantity": "分量（数字のみ）", "unit": "単位（g、ml、個、枚、本、束、大さじ、小さじ、カップ等）"}
  ],
  "steps": [
    {"step": "手順（番号付きの手順を個別に抽出）"}
  ],
  "notes": "コツ・ポイント・注意事項"
}

重要: 
- 手順は番号付きで個別に抽出（例：1. 2. 3. 4. 5. 6. 7.）
- 手順の抽出パターン：
  * 「_1_」「_2_」「_3_」などの番号付き見出しから手順を抽出
  * 「## _1_手順名」の形式で記載されている手順を個別に抽出
  * 各手順の詳細説明も含める
  * 手順名と説明文を組み合わせて完全な手順として抽出
  * 「鶏肉を焼く」「野菜を炒める」「白ワインを加える」などの手順タイトルと説明を組み合わせる
- 材料は表形式から正確に抽出
- 料理名は見出しから正確に抽出
- ミックススパイスの材料も個別に抽出
- 手順の詳細な説明も含める
- 手順が見つからない場合は空の配列ではなく、少なくとも1つの手順を含める
- JSONのみ返す。`;
  } else if (isJapaneseSite) {
    // 日本語サイト用プロンプト（翻訳禁止）
    prompt = `レシピ情報を抽出。ナビ・広告・SNS埋め込み・関連記事を無視し、本文のみ処理。

★★★CRITICAL: titleフィールドには元ページの料理名を一字一句そのままコピーしてください。絶対に翻訳、変更、解釈しないでください★★★

URL: ${url || '不明'}
テキスト: ${text.substring(0, 4000)}

JSON形式で返す:
{
  "title": "【ここに元ページの料理名をそのままコピペ】",
  "description": "レシピ説明",
  "servings": "人数（数字のみ）",
  "ingredients": [
    {"item": "材料名", "quantity": "分量（数字のみ）", "unit": "単位（g、ml、個、枚、本、束、大さじ、小さじ、カップ等）"}
  ],
  "steps": [
    {"step": "手順"}
  ],
  "notes": "メモ",
  "image_url": "【レシピのメイン画像URL（wp-content/uploads等の実際の料理画像を優先、見つからない場合は空文字）】",
  "readable_text": "【Geminiスタイルの読みやすいテキスト形式でレシピ全体をまとめる。以下の形式で：\n\n料理名\n\n説明文\n\n人数: X人分\n\n材料:\n- 材料名: 分量単位\n\nステップ1:\n手順の内容\n\nステップ2:\n手順の内容\n\nメモ:\nメモの内容】"
}

重要: 日本語コンテンツは翻訳せずそのまま抽出してください。
変換ルール: 大さじ1=15ml/g、小さじ1=5ml/g。液体=ml、固体=g。

★★★日本語サイト専用抽出指示★★★
- 「材料」「【材料】」セクションから材料を抽出
- 「手順」「作り方」「調理」セクションから手順を抽出
- 番号付き手順（1. 2. 3. 4. 5.）を個別に抽出
- 料理王国サイトの場合：「鹿ロース」「フォワグラ」等の具体的な材料名を正確に抽出
- 手順が見つからない場合は空の配列ではなく、少なくとも1つの手順を含める
- 各手順の詳細説明も含める
- 手順のタイトルと説明を組み合わせて完全な手順として抽出

★★★料理王国サイト専用抽出指示★★★
- HTMLの<ol><li>タグで囲まれた手順を必ず抽出してください
- 「【材料】（1人前）」セクションから材料を抽出
- 「【作り方】」セクションから手順を抽出
- 材料は「鹿ロース ･･･ 60g」の形式で抽出
- 手順は<li>タグ内の内容を個別に抽出
- 必ず具体的な材料名と手順を抽出し、「手動で入力してください」等のプレースホルダーは使用しない


出力: JSONのみ返してください。`;
  } else {
    // 包括的な海外サイト用プロンプト
    const languageNames = {
      'fr': 'フランス語',
      'en': '英語', 
      'de': 'ドイツ語',
      'es': 'スペイン語',
      'it': 'イタリア語',
      'pt': 'ポルトガル語',
      'zh': '中国語',
      'ko': '韓国語'
    };
    
    // detectedLanguage変数を再取得
    const detectedLanguage = originalRecipeData?.original_language || 'unknown';
    const detectedLanguageName = languageNames[detectedLanguage] || '元の言語';
    
    prompt = `海外レシピサイトから情報を抽出し、元の言語と日本語の両方のデータを取得。${detectedLanguageName}のレシピを処理します。

★★★重要: 元の言語データと日本語翻訳データの両方を提供してください★★★

言語別の抽出指示:
${detectedLanguage === 'fr' ? '- フランス語: recette, ingrédients, préparation, étapes, temps de cuisson, temps de préparation' : ''}
${detectedLanguage === 'en' ? '- 英語: recipe, ingredients, instructions, method, preparation' : ''}
${detectedLanguage === 'de' ? '- ドイツ語: rezept, zutaten, zubereitung, schritte' : ''}
${detectedLanguage === 'es' ? '- スペイン語: receta, ingredientes, preparación, pasos' : ''}
${detectedLanguage === 'it' ? '- イタリア語: ricetta, ingredienti, preparazione, procedimento' : ''}
${detectedLanguage === 'pt' ? '- ポルトガル語: receita, ingredientes, preparo, passos' : ''}
${detectedLanguage === 'zh' ? '- 中国語: 食谱, 食材, 制作方法, 步骤' : ''}
${detectedLanguage === 'ko' ? '- 韓国語: 레시피, 재료, 조리법, 단계' : ''}

${detectedLanguage === 'fr' ? 'フランス語サイト特別指示:\n- "Préparation"セクションから手順を抽出\n- 番号付きの手順（1. 2. 3. 4. 5.）を個別に抽出\n- "Temps total", "Préparation", "Cuisson"の時間情報も抽出\n- 各手順の詳細説明も含める\n- 手順が見つからない場合は空の配列ではなく、少なくとも1つの手順を含める' : ''}

URL: ${url || '不明'}
テキスト: ${text.substring(0, 4000)}

JSON形式で返す:
{
  "title": "【料理名を${detectedLanguageName}から日本語に翻訳】",
  "description": "【レシピ説明を${detectedLanguageName}から日本語に翻訳】",
  "servings": "人数（数字のみ）",
  "ingredients": [
    {"item": "【材料名を${detectedLanguageName}から日本語に翻訳】", "quantity": "分量", "unit": "【単位を日本語に翻訳（g、ml等）】"}
  ],
  "steps": [
    {"step": "【手順1を${detectedLanguageName}から日本語に翻訳】"},
    {"step": "【手順2を${detectedLanguageName}から日本語に翻訳】"},
    {"step": "【手順3を${detectedLanguageName}から日本語に翻訳】"}
  ],
  "notes": "【メモを${detectedLanguageName}から日本語に翻訳】",
  "original_title": "【元の言語の料理名】",
  "original_description": "【元の言語のレシピ説明】",
  "original_ingredients": [
    {"item": "【元の言語の材料名】", "quantity": "分量", "unit": "【元の言語の単位】"}
  ],
  "original_steps": [
    {"step": "【元の言語の手順1】"},
    {"step": "【元の言語の手順2】"},
    {"step": "【元の言語の手順3】"}
  ],
  "image_url": "【レシピのメイン画像URL（wp-content/uploads等の実際の料理画像を優先、見つからない場合は空文字）】",
  "readable_text": "【Geminiスタイルの読みやすいテキスト形式でレシピ全体をまとめる。以下の形式で：\n\n料理名\n\n説明文\n\n人数: X人分\n\n材料:\n- 材料名: 分量単位\n\nステップ1:\n手順の内容\n\nステップ2:\n手順の内容\n\nメモ:\nメモの内容】"
}

変換ルール:
- 大さじ1=15ml/g、小さじ1=5ml/g、カップ1=200ml

手順の分離指示:
- 手順は必ず個別のオブジェクトとして分離してください
- 各手順は{"step": "手順内容"}の形式で配列に格納
- 手順が複数ある場合は、それぞれを別々のオブジェクトとして抽出
- 手順の番号や見出しは除去し、手順の内容のみを抽出
- 手順が見つからない場合は空の配列ではなく、少なくとも1つの手順を含める
- 例: [{"step": "材料を混ぜる"}, {"step": "オーブンで焼く"}, {"step": "冷ます"}]
- 手順は1つずつ独立したオブジェクトとして配列に格納
- 複数の手順を1つのオブジェクトにまとめないでください

★★★番号付き手順の包括的抽出指示★★★
- 番号付き手順（1. 2. 3. 4. 5. 6. 7. 8. 9. 10.）を個別に抽出
- 番号付き手順のパターン：
  * 「1. 手順内容」「2. 手順内容」「3. 手順内容」
  * 「1) 手順内容」「2) 手順内容」「3) 手順内容」
  * 「手順1: 内容」「手順2: 内容」「手順3: 内容」
  * 「Step 1: 内容」「Step 2: 内容」「Step 3: 内容」
  * 「Étape 1: 内容」「Étape 2: 内容」「Étape 3: 内容」
  * 「手順1. 内容」「手順2. 内容」「手順3. 内容」
- 各番号付き手順の詳細説明も含める
- 手順のタイトルと説明を組み合わせて完全な手順として抽出
- 番号や記号は除去し、手順の内容のみを抽出

★★★重要: original_stepsとstepsの両方で手順を分離してください★★★
- original_steps: 元の言語の手順を個別のオブジェクトとして配列に格納
- steps: 日本語翻訳後の手順を個別のオブジェクトとして配列に格納
- 両方とも必ず配列形式で、各手順は{"step": "内容"}の形式
- 液体=ml、固体=g
- Fahrenheit→Celsius変換
- インチ→cm変換
英語の料理用語は適切な日本語に翻訳してください。JSONのみ返してください。`;
  }

  // HTMLから直接タイトルを抽出（言語に関係なく詳細ログ用）
  let extractedTitle = '';

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');

    // 複数のタイトル取得パターンを試行
    const titleSelectors = [
      'h1',
      '.recipe-title',
      '[class*="title"]',
      '.entry-title',
      '.post-title',
      '.recipe-name',
      'title'
    ];

    let candidateTitles = [];

    // 全ての候補タイトルを収集
    for (const selector of titleSelectors) {
      const elements = doc.querySelectorAll(selector);
      elements.forEach(element => {
        const text = element.textContent.trim();
        if (text && text.length > 2 && text.length < 200) {
          const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
          candidateTitles.push({
            text: text,
            selector: selector,
            hasJapanese: hasJapanese
          });
        }
      });
    }

    console.log('📝 タイトル候補:', candidateTitles.map(t => `${t.selector}: "${t.text}" (日本語: ${t.hasJapanese})`));

    // サイト言語に応じてタイトル選択
    if (isJapaneseSite) {
      // 日本語サイト：日本語タイトル優先
      const japaneseTitle = candidateTitles.find(t => t.hasJapanese);
      if (japaneseTitle) {
        extractedTitle = japaneseTitle.text;
        console.log(`📝 日本語タイトル選択 (${japaneseTitle.selector}):`, extractedTitle);
      } else if (candidateTitles.length > 0) {
        extractedTitle = candidateTitles[0].text;
        console.log(`📝 最初のタイトル選択 (${candidateTitles[0].selector}):`, extractedTitle);
      }
    } else {
      // 海外サイト：最初のタイトルを使用（後で翻訳）
      if (candidateTitles.length > 0) {
        extractedTitle = candidateTitles[0].text;
        console.log(`📝 海外サイトタイトル選択 (${candidateTitles[0].selector}):`, extractedTitle);
      }
    }

  } catch (e) {
    console.log('📝 HTML解析失敗、プロンプト抽出に委ねます');
  }

  // タイトル処理指示をプロンプトに追加
  if (extractedTitle) {
    if (isJapaneseSite) {
      // 日本語サイト：翻訳禁止
      prompt += `\n\n🔒 必須: titleには "${extractedTitle}" を使用してください。これ以外は使わないでください。絶対に翻訳や変更をしないでください。`;
    } else {
      // 海外サイト：翻訳指示
      prompt += `\n\n🔒 必須: titleには "${extractedTitle}" を日本語に翻訳したものを使用してください。原文のまま使わず、必ず自然な日本語に翻訳してください。`;
    }
  } else {
    if (!isJapaneseSite) {
      // 海外サイトでタイトル抽出失敗時
      prompt += `\n\n🔒 重要: titleは必ず日本語に翻訳してください。英語やその他の言語のまま返さないでください。`;
    }
  }

  // 海外サイトの場合、翻訳前のデータを保存
  if (!isJapaneseSite) {
    console.log('🌍 海外サイト検出: 翻訳前データを保存します');
    
    // 包括的な言語検出
    let detectedLanguage = 'unknown';
    
    // フランス語の検出
    if (url.includes('.fr') || url.includes('france') || 
        text.includes('français') || text.includes('recette') || text.includes('Valrhona') || 
        text.includes('chocolat') || text.includes('pâtisserie') || text.includes('cuisine') ||
        text.includes('ingrédients') || text.includes('préparation') || text.includes('étapes')) {
      detectedLanguage = 'fr';
    }
    // 英語の検出
    else if (url.includes('.com') || url.includes('.co.uk') || url.includes('.ca') || url.includes('.au') ||
             text.includes('recipe') || text.includes('ingredients') || text.includes('instructions') ||
             text.includes('cooking') || text.includes('preparation') || text.includes('steps') ||
             text.includes('serves') || text.includes('prep time') || text.includes('cook time')) {
      detectedLanguage = 'en';
    }
    // ドイツ語の検出
    else if (url.includes('.de') || url.includes('german') || 
             text.includes('rezept') || text.includes('zutaten') || text.includes('zubereitung') ||
             text.includes('kochzeit') || text.includes('vorbereitungszeit') || text.includes('portionen')) {
      detectedLanguage = 'de';
    }
    // スペイン語の検出
    else if (url.includes('.es') || url.includes('spanish') || 
             text.includes('receta') || text.includes('ingredientes') || text.includes('preparación') ||
             text.includes('tiempo de cocción') || text.includes('porciones') || text.includes('pasos')) {
      detectedLanguage = 'es';
    }
    // イタリア語の検出
    else if (url.includes('.it') || url.includes('italian') || 
             text.includes('ricetta') || text.includes('ingredienti') || text.includes('preparazione') ||
             text.includes('tempo di cottura') || text.includes('porzioni') || text.includes('passaggi')) {
      detectedLanguage = 'it';
    }
    // ポルトガル語の検出
    else if (url.includes('.pt') || url.includes('portuguese') || 
             text.includes('receita') || text.includes('ingredientes') || text.includes('preparo') ||
             text.includes('tempo de cozimento') || text.includes('porções') || text.includes('passos')) {
      detectedLanguage = 'pt';
    }
    // 中国語の検出
    else if (url.includes('.cn') || url.includes('.tw') || url.includes('chinese') || 
             /[\u4e00-\u9fff]/.test(text.title)) {
      detectedLanguage = 'zh';
    }
    // 韓国語の検出
    else if (url.includes('.kr') || url.includes('korean') || 
             /[\uac00-\ud7af]/.test(text.title)) {
      detectedLanguage = 'ko';
    }
    
    console.log('🌍 検出された言語:', detectedLanguage);
    
    originalRecipeData = {
      original_title: extractedTitle || '',
      original_description: '',
      original_ingredients: [],
      original_steps: [],
      original_language: detectedLanguage,
      source_url: url,
      extraction_date: new Date().toISOString()
    };
  }

  console.log('📝 使用するプロンプト:', prompt);
  console.log('📄 入力テキストの先頭:', text.substring(0, 200));
  
  try {
    // callAIAPI関数を呼び出してAI解析を実行
    console.log('🤖 AI解析を開始...');
    const content = await callAIAPI(prompt, url);
    console.log('📝 AI解析完了、レスポンス内容（抜粋）:', content?.title || '');

    // JSONを抽出（複数のパターンを試行）
    let jsonText = content;
    
    // パターン1: ```json と ``` の間
    let jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      // パターン2: 最初の { から最後の } まで
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = content.substring(firstBrace, lastBrace + 1);
      } else {
        // パターン3: 行ごとに検索してJSONらしき行を探す
        const lines = content.split('\n');
        for (const line of lines) {
          if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
            jsonText = line.trim();
            break;
          }
        }
      }
    }
    
    console.log('🔧 抽出されたJSON:', jsonText);
    console.log('🔧 JSON長:', jsonText.length);
    
    try {
      // JSON解析前にテキストをクリーニング
      let cleanJsonText = jsonText.trim();
      
      // HTMLタグを除去
      cleanJsonText = cleanJsonText.replace(/<[^>]*>/g, '');
      
      // 不正な文字を除去
      cleanJsonText = cleanJsonText.replace(/[^\x20-\x7E\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '');
      
      // 最初の{から最後の}までを抽出
      const firstBrace = cleanJsonText.indexOf('{');
      const lastBrace = cleanJsonText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanJsonText = cleanJsonText.substring(firstBrace, lastBrace + 1);
      }
      
      console.log('🔧 クリーニング後のJSON:', cleanJsonText);
      
      const parsedData = JSON.parse(cleanJsonText);
      console.log('✅ パースされたデータ:', parsedData);
      
      // データの検証と修正
      if (!parsedData.title || parsedData.title === '不明なレシピ') {
        console.warn('⚠️ タイトルが不明です。デフォルト値を設定します。');
        parsedData.title = 'レシピ（URLから抽出）';
      }
      
      // ingredientsの形式を統一
      if (!parsedData.ingredients || !Array.isArray(parsedData.ingredients) || parsedData.ingredients.length === 0) {
        console.warn('⚠️ 材料が見つかりません。デフォルト値を設定します。');
        parsedData.ingredients = [{ item: '材料を手動で入力してください', quantity: '', unit: '' }];
      } else {
        // 各材料の形式を統一し、分量と単位を分離
        parsedData.ingredients = parsedData.ingredients.map(ing => {
          let quantity = ing.quantity || '';
          let unit = ing.unit || '';
          
          // 分量と単位が結合されている場合の分離処理
          if (quantity && !unit && typeof quantity === 'string') {
            // 数字と単位を分離（例：「200g」→ quantity: "200", unit: "g"）
            const match = quantity.match(/^(\d+(?:\.\d+)?(?:\/\d+)?)\s*([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)$/);
            if (match) {
              quantity = match[1];
              unit = match[2];
            }
          }
          
          return {
            item: ing.item || '',
            quantity: quantity,
            unit: unit
          };
        });
      }
      
      // stepsの形式を統一
      console.log('📝 手順データの詳細解析:', {
        hasSteps: !!parsedData.steps,
        isArray: Array.isArray(parsedData.steps),
        length: parsedData.steps ? parsedData.steps.length : 0,
        steps: parsedData.steps
      });
      
      if (!parsedData.steps || !Array.isArray(parsedData.steps) || parsedData.steps.length === 0) {
        console.warn('⚠️ 手順が見つかりません。デフォルト値を設定します。');
        console.warn('⚠️ 手順データの状態:', {
          steps: parsedData.steps,
          type: typeof parsedData.steps,
          isArray: Array.isArray(parsedData.steps)
        });
        parsedData.steps = [{ step: '手順を手動で入力してください' }];
      } else {
        console.log('✅ 手順データが見つかりました:', parsedData.steps.length, '件');
        // 各手順の形式を統一
        parsedData.steps = parsedData.steps.map((step, index) => {
          console.log(`📝 手順${index + 1}の処理:`, step, 'タイプ:', typeof step);
          if (typeof step === 'string') {
            return { step: step };
          } else if (step.step) {
            return { step: step.step };
          } else {
            return { step: `手順${index + 1}` };
          }
        });
        console.log('📝 統一後の手順データ:', parsedData.steps);
      }
      
      if (!parsedData.servings) {
        parsedData.servings = '4';
      }
      
      if (!parsedData.description) {
        parsedData.description = '';
      }
      
      if (!parsedData.notes) {
        parsedData.notes = '';
      }
      
      console.log('🎯 最終的なレシピデータ:', parsedData);
      return parsedData;
      
    } catch (parseError) {
      console.error('❌ JSON解析エラー:', parseError);
      console.error('❌ 解析対象テキスト:', jsonText);
      
      // フォールバック: デフォルトのレシピデータを返す
      console.warn('⚠️ JSON解析に失敗したため、デフォルトのレシピデータを返します');
      const fallbackData = {
        title: 'レシピ（URLから抽出）',
        description: 'レシピの詳細を手動で入力してください',
        servings: '4',
        ingredients: [
          { item: '材料を手動で入力してください', quantity: '', unit: '' }
        ],
        steps: [
          { step: '手順を手動で入力してください' }
        ],
        notes: 'URLから自動抽出できませんでした'
      };
      
      console.log('🔄 フォールバックデータ:', fallbackData);
      return fallbackData;
    }
  } catch (error) {
    console.error('❌ Groq API呼び出しエラー:', error);
    throw error;
  }
}

// ChatGPT API呼び出し関数
async function callChatGPTAPI(text, url) {
  await sleep(1000); // Rate limiting
  
  console.log('🤖 ChatGPT API呼び出し開始');
  console.log('📝 プロンプト:', text.substring(0, 200) + '...');
  
  try {
    const { data, error } = await sb.functions.invoke('call-openai-api', {
      body: {
        text,
        model: "gpt-3.5-turbo",
        maxTokens: 4000,
        temperature: 0.7
      }
    });

    if (error) {
      console.error('❌ OpenAI proxy error:', error);
      throw new Error('ChatGPT API呼び出しに失敗しました');
    }

    if (!data?.success) {
      console.error('❌ OpenAI proxy response:', data);
      throw new Error(data?.error || 'ChatGPT API呼び出しに失敗しました');
    }

    console.log('📝 ChatGPT API レスポンス内容:', data.content?.title || '');
    return data.content;
  } catch (error) {
    console.error('❌ ChatGPT API呼び出しエラー:', error);
    throw error;
  }
}

// Groq API直接呼び出し関数
async function callGroqAPIDirect(text, url) {
  console.log('🤖 Groq API直接呼び出し開始');
  
  // URLと内容から言語を判定
  const isJapaneseSite = url && (
    url.includes('.jp') ||
    url.includes('japanese') ||
    url.includes('japan') ||
    /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(url) ||
    /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text.substring(0, 1000))
  );
  
  // グローバル変数として設定
  window.isJapaneseSite = isJapaneseSite;
  console.log('🌍 サイト言語判定:', isJapaneseSite ? '日本語サイト' : '海外サイト');

  // プロンプトを生成
  let prompt = '';
  if (isJapaneseSite) {
    prompt = `レシピ情報を抽出。ナビ・広告・SNS埋め込み・関連記事を無視し、本文のみ処理。

★★★CRITICAL: titleフィールドには元ページの料理名を一字一句そのままコピーしてください。絶対に翻訳、変更、解釈しないでください★★★

URL: ${url || '不明'}
テキスト: ${text.substring(0, 4000)}

JSON形式で返す:
{
  "title": "【ここに元ページの料理名をそのままコピペ】",
  "description": "レシピ説明",
  "servings": "人数（数字のみ）",
  "ingredients": [
    {"item": "材料名", "quantity": "分量（数字のみ）", "unit": "単位（g、ml、個、枚、本、束、大さじ、小さじ、カップ等）"}
  ],
  "steps": [
    {"step": "手順"}
  ],
  "notes": "メモ",
  "image_url": "【レシピのメイン画像URL（wp-content/uploads等の実際の料理画像を優先、見つからない場合は空文字）】",
  "readable_text": "【Geminiスタイルの読みやすいテキスト形式でレシピ全体をまとめる。以下の形式で：\n\n料理名\n\n説明文\n\n人数: X人分\n\n材料:\n- 材料名: 分量単位\n\nステップ1:\n手順の内容\n\nステップ2:\n手順の内容\n\nメモ:\nメモの内容】"
}

重要: 日本語コンテンツは翻訳せずそのまま抽出してください。
変換ルール: 大さじ1=15ml/g、小さじ1=5ml/g。液体=ml、固体=g。

★★★日本語サイト専用抽出指示★★★
- 「材料」「【材料】」セクションから材料を抽出
- 「手順」「作り方」「調理」セクションから手順を抽出
- 番号付き手順（1. 2. 3. 4. 5.）を個別に抽出
- 料理王国サイトの場合：「鹿ロース」「フォワグラ」等の具体的な材料名を正確に抽出
- 手順は番号付きで個別に抽出（例：1. 2. 3. 4. 5. 6. 7.）
- 手順の抽出パターン：
  * 「_1_」「_2_」「_3_」などの番号付き見出しから手順を抽出
  * 「## _1_手順名」の形式で記載されている手順を個別に抽出
  * 各手順の詳細説明も含める
  * 手順名と説明文を組み合わせて完全な手順として抽出
  * 「鶏肉を焼く」「野菜を炒める」「白ワインを加える」などの手順タイトルと説明を組み合わせる
- 材料は表形式から正確に抽出
- 料理名は見出しから正確に抽出
- ミックススパイスの材料も個別に抽出
- 手順の詳細な説明も含める
- 手順が見つからない場合は空の配列ではなく、少なくとも1つの手順を含める

★★★手順抽出の重要指標★★★
- 手順は必ず番号で始まっている（1. 2. 3. 4. 5. 6. 7. 8. 9. 10. など）
- 番号の後に手順の内容が続く
- 番号のパターン：1. 2. 3. 4. 5. 6. 7. 8. 9. 10. 11. 12. 13. 14. 15. 16. 17. 18. 19. 20.
- 番号の前後には空白や改行がある
- 番号の後に手順のタイトルや説明が続く
- 番号を見つけたら、その番号から次の番号までを1つの手順として抽出
- 番号が連続している場合は、すべての番号付き手順を抽出
- 番号が飛んでいる場合（1. 3. 5. など）も抽出対象
- 番号の後に手順の内容がない場合は、その番号をスキップ
- 番号の後に手順の内容がある場合は、その番号と内容を1つの手順として抽出

★★★分量・単位抽出の重要指示★★★
- 分量は必ず数字で抽出（例：200、1.5、1/2、0.5）
- 単位は必ず具体的に抽出（例：g、ml、個、枚、本、束、大さじ、小さじ、カップ、杯、片、房）
- 「200g」→ quantity: "200", unit: "g"
- 「大さじ1」→ quantity: "1", unit: "大さじ"
- 「1/2カップ」→ quantity: "1/2", unit: "カップ"
- 「適量」→ quantity: "適量", unit: ""
- 「少々」→ quantity: "少々", unit: ""
- 分量と単位を必ず分離して抽出すること
- JSONのみ返す。`;
  } else {
    prompt = `レシピ情報を抽出。ナビ・広告・SNS埋め込み・関連記事を無視し、本文のみ処理。

★★★CRITICAL: titleフィールドには元ページの料理名を一字一句そのままコピーしてください。絶対に翻訳、変更、解釈しないでください★★★

URL: ${url || '不明'}
テキスト: ${text.substring(0, 4000)}

JSON形式で返す:
{
  "title": "【料理名を日本語に翻訳】",
  "description": "【レシピ説明を日本語に翻訳】",
  "servings": "人数（数字のみ）",
  "ingredients": [
    {"item": "【材料名を日本語に翻訳】", "quantity": "分量", "unit": "【単位を日本語に翻訳（g、ml等）】"}
  ],
  "steps": [
    {"step": "【手順1を日本語に翻訳】"},
    {"step": "【手順2を日本語に翻訳】"},
    {"step": "【手順3を日本語に翻訳】"}
  ],
  "notes": "【メモを日本語に翻訳】",
  "image_url": "【レシピのメイン画像URL（wp-content/uploads等の実際の料理画像を優先、見つからない場合は空文字）】",
  "readable_text": "【Geminiスタイルの読みやすいテキスト形式でレシピ全体をまとめる。以下の形式で：\n\n料理名\n\n説明文\n\n人数: X人分\n\n材料:\n- 材料名: 分量単位\n\nステップ1:\n手順の内容\n\nステップ2:\n手順の内容\n\nメモ:\nメモの内容】"
}

重要: 海外サイトのコンテンツは必ず日本語に翻訳してください。
変換ルール: 大さじ1=15ml/g、小さじ1=5ml/g。液体=ml、固体=g。

★★★海外サイト専用抽出指示★★★
- 「Ingredients」「Materials」セクションから材料を抽出
- 「Instructions」「Steps」「Preparation」セクションから手順を抽出
- 番号付き手順（1. 2. 3. 4. 5.）を個別に抽出
- 手順は番号付きで個別に抽出（例：1. 2. 3. 4. 5. 6. 7.）
- 手順の抽出パターン：
  * 「_1_」「_2_」「_3_」などの番号付き見出しから手順を抽出
  * 「## _1_手順名」の形式で記載されている手順を個別に抽出
  * 各手順の詳細説明も含める
  * 手順名と説明文を組み合わせて完全な手順として抽出
  * 「鶏肉を焼く」「野菜を炒める」「白ワインを加える」などの手順タイトルと説明を組み合わせる
- 材料は表形式から正確に抽出
- 料理名は見出しから正確に抽出
- ミックススパイスの材料も個別に抽出
- 手順の詳細な説明も含める
- 手順が見つからない場合は空の配列ではなく、少なくとも1つの手順を含める

★★★手順抽出の重要指標★★★
- 手順は必ず番号で始まっている（1. 2. 3. 4. 5. 6. 7. 8. 9. 10. など）
- 番号の後に手順の内容が続く
- 番号のパターン：1. 2. 3. 4. 5. 6. 7. 8. 9. 10. 11. 12. 13. 14. 15. 16. 17. 18. 19. 20.
- 番号の前後には空白や改行がある
- 番号の後に手順のタイトルや説明が続く
- 番号を見つけたら、その番号から次の番号までを1つの手順として抽出
- 番号が連続している場合は、すべての番号付き手順を抽出
- 番号が飛んでいる場合（1. 3. 5. など）も抽出対象
- 番号の後に手順の内容がない場合は、その番号をスキップ
- 番号の後に手順の内容がある場合は、その番号と内容を1つの手順として抽出

★★★分量・単位抽出の重要指示★★★
- 分量は必ず数字で抽出（例：200、1.5、1/2、0.5）
- 単位は必ず具体的に抽出（例：g、ml、個、枚、本、束、大さじ、小さじ、カップ、杯、片、房）
- 「200g」→ quantity: "200", unit: "g"
- 「大さじ1」→ quantity: "1", unit: "大さじ"
- 「1/2カップ」→ quantity: "1/2", unit: "カップ"
- 「適量」→ quantity: "適量", unit: ""
- 「少々」→ quantity: "少々", unit: ""
- 分量と単位を必ず分離して抽出すること
- JSONのみ返す。`;
  }

  console.log('📝 使用するプロンプト:', prompt);
  console.log('📄 入力テキストの先頭:', text.substring(0, 200));
  
  try {
    // Groq APIを直接呼び出し
    const apiFunction = 'call-groq-api';
    const model = getCurrentGroqModel();
    
    console.log('🔍 使用するAPI:', apiFunction, 'モデル:', model);
    
    const { data, error } = await sb.functions.invoke(apiFunction, {
      body: {
        text: prompt,
        model: model,
        maxTokens: 4096,
        temperature: 0.7
      }
    });

    if (error) {
      console.error('❌ API 呼び出しエラー:', error);
      throw new Error('API呼び出しに失敗しました');
    }

    if (!data?.success) {
      console.error('❌ API レスポンス異常:', data);
      throw new Error(data?.error || 'API呼び出しに失敗しました');
    }

    const content = data.content;
    console.log('📝 API レスポンス内容（抜粋）:', content?.title || '');

    // JSONを抽出（複数のパターンを試行）
    let jsonText = content;
    
    // パターン1: ```json と ``` の間
    let jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      // パターン2: 最初の { から最後の } まで
      const firstBrace = content.indexOf('{');
      const lastBrace = content.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = content.substring(firstBrace, lastBrace + 1);
      }
    }
    
    console.log('🔧 抽出されたJSON:', jsonText);
    console.log('🔧 JSON長:', jsonText.length);
    
    try {
      // JSON解析前にテキストをクリーニング
      let cleanJsonText = jsonText.trim();
      
      // HTMLタグを除去
      cleanJsonText = cleanJsonText.replace(/<[^>]*>/g, '');
      
      // 不正な文字を除去
      cleanJsonText = cleanJsonText.replace(/[^\x20-\x7E\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '');
      
      // 最初の{から最後の}までを抽出
      const firstBrace = cleanJsonText.indexOf('{');
      const lastBrace = cleanJsonText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanJsonText = cleanJsonText.substring(firstBrace, lastBrace + 1);
      }
      
      console.log('🔧 クリーニング後のJSON:', cleanJsonText);
      
      const parsedData = JSON.parse(cleanJsonText);
      console.log('✅ パースされたデータ:', parsedData);
      
      // データの検証と修正
      if (!parsedData.title || parsedData.title === '不明なレシピ') {
        console.warn('⚠️ タイトルが不明です。デフォルト値を設定します。');
        parsedData.title = 'レシピ（URLから抽出）';
      }
      
      // ingredientsの形式を統一
      if (!parsedData.ingredients || !Array.isArray(parsedData.ingredients) || parsedData.ingredients.length === 0) {
        console.warn('⚠️ 材料が見つかりません。デフォルト値を設定します。');
        parsedData.ingredients = [{ item: '材料を手動で入力してください', quantity: '', unit: '' }];
      } else {
        // 各材料の形式を統一し、分量と単位を分離
        parsedData.ingredients = parsedData.ingredients.map(ing => {
          let quantity = ing.quantity || '';
          let unit = ing.unit || '';
          
          // 分量と単位が結合されている場合の分離処理
          if (quantity && !unit && typeof quantity === 'string') {
            // 数字と単位を分離（例：「200g」→ quantity: "200", unit: "g"）
            const match = quantity.match(/^(\d+(?:\.\d+)?(?:\/\d+)?)\s*([a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]+)$/);
            if (match) {
              quantity = match[1];
              unit = match[2];
            }
          }
          
          return {
            item: ing.item || '',
            quantity: quantity,
            unit: unit
          };
        });
      }
      
      // stepsの形式を統一
      if (!parsedData.steps || !Array.isArray(parsedData.steps) || parsedData.steps.length === 0) {
        console.warn('⚠️ 手順が見つかりません。デフォルト値を設定します。');
        parsedData.steps = [{ step: '手順を手動で入力してください' }];
      } else {
        // 各手順の形式を統一
        parsedData.steps = parsedData.steps.map(step => ({
          step: step.step || step || ''
        }));
      }
      
      // その他のフィールドのデフォルト値設定
      parsedData.description = parsedData.description || '';
      parsedData.servings = parsedData.servings || '4';
      parsedData.notes = parsedData.notes || '';
      parsedData.image_url = parsedData.image_url || '';
      parsedData.readable_text = parsedData.readable_text || '';
      
      console.log('✅ 最終的なレシピデータ:', parsedData);
      return parsedData;
      
    } catch (parseError) {
      console.error('❌ JSON解析エラー:', parseError);
      console.log('🔧 解析対象テキスト:', jsonText);
      
      // フォールバック: デフォルトのレシピデータを返す
      console.warn('⚠️ JSON解析に失敗したため、デフォルトのレシピデータを返します');
      const fallbackData = {
        title: 'レシピ（URLから抽出）',
        description: 'レシピの詳細を手動で入力してください',
        servings: '4',
        ingredients: [
          { item: '材料を手動で入力してください', quantity: '', unit: '' }
        ],
        steps: [
          { step: '手順を手動で入力してください' }
        ],
        notes: 'URLから自動抽出できませんでした'
      };
      
      return fallbackData;
    }
    
  } catch (error) {
    console.error('❌ Groq API呼び出しエラー:', error);
    throw error;
  }
}

// 統一API呼び出し関数
async function callAIAPI(text, url) {
  // URL取り込み時は window.selectedApi を優先、それ以外は設定値を使用
  const currentApi = window.selectedApi || Settings.getCurrentAiApi();
  console.log(`使用するAPI: ${currentApi} (selectedApi: ${window.selectedApi}, settings: ${Settings.getCurrentAiApi()})`);
  
  if (currentApi === 'chatgpt') {
    return await callChatGPTAPI(text, url);
  } else if (currentApi === 'gemini') {
    // Gemini API専用の処理
    console.log('🔍 Gemini API専用処理を実行');
    return await callGroqAPI(text, url); // callGroqAPI関数内でGemini APIを呼び出し
  } else {
    // Groq APIを直接呼び出し
    console.log('🤖 Groq APIを直接呼び出し');
    return await callGroqAPIDirect(text, url);
  }
}

// HTMLからナビ・広告・SNS埋め込みを除去し、テキストを最適化する関数
function cleanHTML(html, url = '') {
  if (!html) return html;
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // サイト別のクリーニング処理
    if (url && url.includes('dancyu.jp')) {
      console.log('🍳 dancyu.jp専用の軽量クリーニングを実行');
      
      // 最小限の不要要素のみ除去
      const minimalSelectorsToRemove = [
        'script', 'style', 'noscript',
        '.ad', '.ads', '.advertisement', '.banner', '[class*="ad-"]',
        'nav', 'header', 'footer',
        '.social', '.share', '[class*="social"]', '[class*="share"]',
        '.related', '.recommend', '[class*="related"]', '[class*="recommend"]',
        '.sidebar', '.side', '.aside', '[class*="sidebar"]', '[class*="side"]',
        'iframe[src*="ads"]', 'iframe[src*="google"]'
      ];
      
      minimalSelectorsToRemove.forEach(selector => {
        try {
          const elements = doc.querySelectorAll(selector);
          elements.forEach(el => el.remove());
        } catch (e) {
          // セレクターが無効な場合はスキップ
        }
      });
    } else if (url && (url.includes('.fr') || url.includes('.com') || url.includes('.de') || url.includes('.es') || url.includes('.it'))) {
      // 海外サイト専用のクリーニング
      console.log('🌍 海外サイト専用のクリーニングを実行');
      
      const internationalSelectorsToRemove = [
        'script', 'style', 'noscript',
        // 広告関連
        '.ad', '.ads', '.advertisement', '.banner', '[class*="ad-"]', '[class*="banner"]',
        '[class*="promo"]', '[class*="sponsor"]', '[class*="affiliate"]',
        // ナビゲーション
        'nav', 'header', 'footer', '.navigation', '.menu', '.navbar',
        // ソーシャル・シェア
        '.social', '.share', '[class*="social"]', '[class*="share"]', '[class*="follow"]',
        // 関連記事・推奨
        '.related', '.recommend', '.suggested', '[class*="related"]', '[class*="recommend"]',
        '[class*="suggested"]', '[class*="similar"]', '[class*="more"]',
        // サイドバー・サイドコンテンツ
        '.sidebar', '.side', '.aside', '[class*="sidebar"]', '[class*="side"]',
        '[class*="widget"]', '[class*="sidebar"]',
        // コメント・レビュー
        '.comments', '.reviews', '[class*="comment"]', '[class*="review"]',
        // 外部埋め込み
        'iframe[src*="ads"]', 'iframe[src*="google"]', 'iframe[src*="facebook"]',
        'iframe[src*="twitter"]', 'iframe[src*="instagram"]',
        // クッキー・プライバシー
        '.cookie', '.privacy', '[class*="cookie"]', '[class*="privacy"]',
        // ニュースレター・登録
        '.newsletter', '.subscribe', '[class*="newsletter"]', '[class*="subscribe"]',
        // 検索・フィルター
        '.search', '.filter', '[class*="search"]', '[class*="filter"]',
        // パンくずリスト
        '.breadcrumb', '[class*="breadcrumb"]',
        // タグ・カテゴリ
        '.tags', '.categories', '[class*="tag"]', '[class*="category"]'
      ];
      
      internationalSelectorsToRemove.forEach(selector => {
        try {
          const elements = doc.querySelectorAll(selector);
          elements.forEach(el => el.remove());
        } catch (e) {
          // セレクターが無効な場合はスキップ
        }
      });
      
      // dancyu.jpの手順情報を保持するため、レシピ関連要素を優先的に抽出
      const dancyuRecipeSelectors = [
        'article', '.content', '.main', '.post', '.entry',
        '[class*="recipe"]', '[id*="recipe"]', '[class*="content"]', '[id*="content"]',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', // 見出しを保持
        'p', 'div', 'span', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th' // 基本要素を保持
      ];
      
      let mainContent = '';
      for (const selector of dancyuRecipeSelectors) {
        try {
          const element = doc.querySelector(selector);
          if (element && element.textContent.trim().length > 50) {
            mainContent = element.textContent.trim();
            break;
          }
        } catch (e) {
          // セレクターが無効な場合はスキップ
        }
      }
      
      // メインコンテンツが見つからない場合はbody全体を使用
      if (!mainContent) {
        mainContent = doc.body ? doc.body.textContent.trim() : html;
      }
      
      console.log('🧹 dancyu.jp軽量クリーニング完了:', {
        originalLength: html.length,
        cleanedLength: mainContent.length,
        reduction: Math.round((1 - mainContent.length / html.length) * 100) + '%'
      });
      
      return mainContent;
    }
    
    // 通常のクリーニング処理
    const selectorsToRemove = [
      // ナビゲーション
      'nav', 'header', 'footer', '.nav', '.navigation', '.menu', '.navbar',
      // 広告
      '.ad', '.ads', '.advertisement', '.banner', '.promo', '.sponsor',
      '[class*="ad-"]',
      // dancyu.jp特有の不要要素
      '.sidebar', '.related-articles', '.social-share', '.tags',
      '.author-info', '.publish-date', '.breadcrumb', '[id*="ad-"]', '[class*="banner"]', '[id*="banner"]',
      // SNS埋め込み
      '.social', '.share', '.facebook', '.twitter', '.instagram', '.youtube',
      '[class*="social"]', '[class*="share"]', '[class*="sns"]',
      // 関連記事・推奨記事
      '.related', '.recommend', '.suggest', '.popular', '.trending',
      '[class*="related"]', '[class*="recommend"]', '[class*="suggest"]',
      // コメント・レビュー
      '.comment', '.review', '.rating', '.feedback',
      '[class*="comment"]', '[class*="review"]', '[class*="rating"]',
      // サイドバー・サイドコンテンツ
      '.sidebar', '.side', '.aside', '.widget',
      '[class*="sidebar"]', '[class*="side"]', '[class*="widget"]',
      // その他の不要な要素
      'script', 'style', 'noscript', 'iframe[src*="ads"]', 'iframe[src*="google"]',
      '.cookie', '.privacy', '.terms', '.disclaimer'
    ];
    
    // 要素を除去
    selectorsToRemove.forEach(selector => {
      try {
        const elements = doc.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      } catch (e) {
        // セレクターが無効な場合はスキップ
      }
    });
    
    // レシピ関連の要素を優先的に抽出
    const recipeSelectors = [
      'article', '.recipe', '.content', '.main', '.post', '.entry',
      '[class*="recipe"]', '[id*="recipe"]', '[class*="content"]', '[id*="content"]',
      '.gz-content', '.procedimento', '.ingredienti', // giallozafferano特有
      '.recipe-instructions', '.recipe-method', '.preparation',
      '[class*="procedure"]', '[class*="method"]', '[class*="instruction"]'
    ];
    
    let mainContent = '';
    for (const selector of recipeSelectors) {
      try {
        const element = doc.querySelector(selector);
        if (element && element.textContent.trim().length > 100) {
          mainContent = element.textContent.trim();
          break;
        }
      } catch (e) {
        // セレクターが無効な場合はスキップ
      }
    }
    
    // メインコンテンツが見つからない場合はbody全体を使用
    if (!mainContent) {
      mainContent = doc.body ? doc.body.textContent.trim() : html;
    }
    
    // テキストの最適化
    mainContent = optimizeText(mainContent);
    
    console.log('🧹 HTMLクリーニング完了:', {
      originalLength: html.length,
      cleanedLength: mainContent.length,
      reduction: Math.round((1 - mainContent.length / html.length) * 100) + '%'
    });
    
    return mainContent;
    
  } catch (error) {
    console.warn('⚠️ HTMLクリーニングエラー:', error);
    return html; // エラーの場合は元のHTMLを返す
  }
}

// テキストを最適化してトークン数を削減する関数
function optimizeText(text) {
  if (!text) return text;
  
  try {
    // 不要な文字列を除去
    let optimized = text
      // 連続する空白・改行を整理
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      // 不要な文字列を除去
      .replace(/続きを読む|もっと見る|詳細を見る|クリック|タップ|こちら|ここを|この記事|関連記事|おすすめ|人気記事|最新記事|ランキング|トップ|ホーム|サイトマップ|プライバシーポリシー|利用規約|免責事項|著作権|©|All rights reserved|Powered by|©\s*\d{4}/gi, '')
      // 広告関連の文字列を除去
      .replace(/広告|スポンサー|PR|プロモーション|キャンペーン|セール|割引|無料|プレゼント|抽選|応募|申し込み|登録|会員|メルマガ|ニュースレター/gi, '')
      // SNS関連の文字列を除去
      .replace(/フォロー|いいね|シェア|ツイート|リツイート|いいね|コメント|返信|リプライ|DM|メッセージ|チャット|通話|ビデオ|ライブ|ストーリー|ハッシュタグ|#|@/gi, '')
      // ナビゲーション関連の文字列を除去
      .replace(/メニュー|カテゴリー|タグ|検索|フィルター|並び替え|ソート|ページ|前へ|次へ|戻る|進む|トップへ|ページトップ|スクロール/gi, '')
      // 不要な記号・文字を除去
      .replace(/[【】「」『』（）()\[\]{}]/g, '')
      .replace(/[！!？?。、,]/g, ' ')
      // 連続する空白を整理
      .replace(/\s+/g, ' ')
      .trim();
    
    // レシピ関連のキーワードを優先的に保持（多言語対応）
    const recipeKeywords = [
      // 日本語
      '材料', '分量', '作り方', '手順', '調理', '料理', 'レシピ', '作り方', '下準備', '準備',
      '大さじ', '小さじ', 'カップ', 'ml', 'g', 'kg', '個', '本', '枚', '束', 'パック',
      '塩', '胡椒', '砂糖', '醤油', '味噌', '酒', 'みりん', '酢', '油', 'バター',
      '切る', '刻む', '混ぜる', '炒める', '煮る', '焼く', '蒸す', '揚げる', '茹でる',
      '火', '熱', '温度', '時間', '分', '秒', '時間', '弱火', '中火', '強火',
      // 英語
      'ingredients', 'recipe', 'cooking', 'preparation', 'instructions', 'method',
      'cup', 'tablespoon', 'teaspoon', 'ounce', 'pound', 'gram', 'kilogram',
      'salt', 'pepper', 'sugar', 'oil', 'butter', 'onion', 'garlic',
      'cook', 'bake', 'fry', 'boil', 'simmer', 'mix', 'stir', 'chop', 'slice',
      'heat', 'temperature', 'minute', 'hour', 'medium', 'high', 'low',
      // イタリア語
      'ingredienti', 'ricetta', 'procedimento', 'preparazione', 'cottura',
      'cucchiaio', 'cucchiaino', 'grammi', 'chilogrammi', 'litro', 'millilitri',
      'sale', 'pepe', 'zucchero', 'olio', 'burro', 'cipolla', 'aglio',
      'cuocere', 'friggere', 'bollire', 'mescolare', 'tagliare', 'tritare',
      'calore', 'temperatura', 'minuto', 'ora', 'medio', 'alto', 'basso'
    ];
    
    // レシピ関連の内容を優先的に抽出
    const lines = optimized.split('\n').filter(line => {
      const trimmed = line.trim();
      if (trimmed.length < 10) return false;
      
      // レシピ関連のキーワードが含まれている行を優先
      const hasRecipeKeyword = recipeKeywords.some(keyword => 
        trimmed.includes(keyword)
      );
      
      return hasRecipeKeyword || trimmed.length > 20;
    });
    
    optimized = lines.join('\n').trim();
    
    console.log('📝 テキスト最適化完了:', {
      originalLength: text.length,
      optimizedLength: optimized.length,
      reduction: Math.round((1 - optimized.length / text.length) * 100) + '%'
    });
    
    return optimized;
    
  } catch (error) {
    console.warn('⚠️ テキスト最適化エラー:', error);
    return text;
  }
}

async function fetchHTMLViaProxy(url) {
  console.log('🌐 HTML取得開始:', url);

  // DelishKitchen専用処理
  if (url.includes('delishkitchen.tv')) {
    console.log('🍳 DelishKitchen専用処理を適用');
  }

  // proxy-manager.jsが利用可能な場合はそれを使用
  if (window.proxyManager) {
    console.log('📡 ProxyManagerを使用してHTMLを取得');
    try {
      const html = await window.proxyManager.fetchHtml(url, {
        minLength: 100,
        timeout: 20000, // DelishKitchenのために長めに設定
        maxRetries: 3
      });
      console.log('✅ ProxyManagerでHTML取得成功:', html.length, '文字');

      // DelishKitchenの場合、HTMLの内容をチェック
      if (url.includes('delishkitchen.tv')) {
        console.log('🔍 DelishKitchen HTML内容をチェック:', html.title);
      }

      // HTMLをクリーニング
      const cleanedHtml = cleanHTML(html, url);
      return cleanedHtml;
    } catch (error) {
      console.error('❌ ProxyManagerが失敗:', error.message);
      console.error('エラー詳細:', error);
    }
  } else {
    console.warn('⚠️ ProxyManagerが利用できません');
  }
  
  // フォールバック: 直接プロキシを使用
  console.log('🔄 フォールバック: 直接プロキシを使用');
  const proxies = [
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
    `https://proxy.cors.sh/${url}`,
    `https://cors-anywhere.herokuapp.com/${url}`,
    `https://thingproxy.freeboard.io/fetch/${url}`
  ];

  for (const proxy of proxies) {
    try {
      console.log('🔄 プロキシ試行:', proxy);
      const response = await fetch(proxy, {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3'
          // Cache-ControlとPragmaヘッダーを削除（CORSエラーの原因）
        }
      });
      
      if (response.ok) {
        let html = proxy.includes('allorigins.win') 
          ? (await response.json()).contents 
          : await response.text();
        
        console.log('✅ プロキシ成功:', proxy, 'HTML長:', html.length);
        if (html && html.length > 100) {
          console.log('📄 HTML内容の先頭:', html.substring(0, 200));
          
          // HTMLをクリーニング
          const cleanedHtml = cleanHTML(html, url);
          return cleanedHtml;
        }
      } else {
        console.warn('⚠️ プロキシ失敗:', proxy, 'ステータス:', response.status);
      }
    } catch (error) {
      console.warn('❌ プロキシエラー:', proxy, error.message);
      continue;
    }
  }
  throw new Error('すべてのプロキシサービスが失敗しました');
}

// URL取り込みをGroqで直接実行する関数
const showApiSelectionModal = (url) => {
  console.log('🔍 URL取り込みをGroqで直接実行:', url);
  
  // 直接GroqでURL取り込みを実行
  window.selectedApi = 'groq';
  runImportWithSelectedApi(url, 'groq');
};

// APIの状態をチェックする関数
const checkApiStatus = async () => {
  const groqStatus = document.getElementById('groq-status');
  const geminiStatus = document.getElementById('gemini-status');
  const chatgptStatus = document.getElementById('chatgpt-status');
  
  // Groq APIの状態をチェック
  if (groqStatus) {
    groqStatus.textContent = '確認中...';
    groqStatus.className = 'api-status checking';
    
    try {
      // Groq APIのテスト
      const { data, error } = await sb.functions.invoke('call-groq-api', {
        body: {
          prompt: 'test',
          model: 'llama-3.1-8b-instant',
          maxTokens: 10
        }
      });
      
      if (error || !data?.success) {
        groqStatus.textContent = '利用不可';
        groqStatus.className = 'api-status unavailable';
      } else {
        groqStatus.textContent = '利用可能';
        groqStatus.className = 'api-status available';
      }
    } catch (error) {
      console.error('Groq API チェックエラー:', error);
      groqStatus.textContent = '利用不可';
      groqStatus.className = 'api-status unavailable';
    }
  }
  
  // Gemini APIの状態をチェック（現状は未対応のため判定のみ）
  if (geminiStatus) {
    geminiStatus.textContent = '未対応';
    geminiStatus.className = 'api-status unavailable';
  }
  
  // ChatGPT APIの状態をチェック
  if (chatgptStatus) {
    chatgptStatus.textContent = '確認中...';
    chatgptStatus.className = 'api-status checking';
    
    try {
      // ChatGPT APIのテスト
      const { data, error } = await sb.functions.invoke('call-openai-api', {
        body: {
          prompt: 'test',
          model: 'gpt-3.5-turbo',
          maxTokens: 10
        }
      });
      
      if (error || !data?.success) {
        chatgptStatus.textContent = '利用不可';
        chatgptStatus.className = 'api-status unavailable';
      } else {
        chatgptStatus.textContent = '利用可能';
        chatgptStatus.className = 'api-status available';
      }
    } catch (error) {
      console.error('ChatGPT API チェックエラー:', error);
      chatgptStatus.textContent = '利用不可';
      chatgptStatus.className = 'api-status unavailable';
    }
  }
};

// API選択イベントリスナーを設定する関数
const setupApiSelectionEvents = (url) => {
  const modal = document.getElementById('apiSelectionModal');
  const closeBtn = document.getElementById('apiSelectionCloseBtn');
  const cancelBtn = document.getElementById('apiSelectionCancelBtn');
  const confirmBtn = document.getElementById('apiSelectionConfirmBtn');
  
  // 既存のイベントリスナーを削除（重複防止）
  const newCloseBtn = closeBtn?.cloneNode(true);
  const newCancelBtn = cancelBtn?.cloneNode(true);
  const newConfirmBtn = confirmBtn?.cloneNode(true);
  
  if (closeBtn && newCloseBtn) {
    closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);
  }
  if (cancelBtn && newCancelBtn) {
    cancelBtn.parentNode?.replaceChild(newCancelBtn, cancelBtn);
  }
  if (confirmBtn && newConfirmBtn) {
    confirmBtn.parentNode?.replaceChild(newConfirmBtn, confirmBtn);
  }
  
  // 閉じるボタン
  newCloseBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  
  // キャンセルボタン
  newCancelBtn?.addEventListener('click', () => {
    modal.style.display = 'none';
  });
  
  // 確認ボタン
  newConfirmBtn?.addEventListener('click', async () => {
    const selectedApi = document.querySelector('input[name="api-selection"]:checked')?.value;
    console.log('🔍 選択されたAPI:', selectedApi);
    
    if (!selectedApi) {
      alert('APIを選択してください');
      return;
    }
    
    // モーダルを閉じる
    modal.style.display = 'none';
    
    // 選択されたAPIでURL取り込みを実行
    await runImportWithSelectedApi(url, selectedApi);
  });
  
  // APIオプションのクリックイベント
  const apiOptions = document.querySelectorAll('.api-option');
  apiOptions.forEach(option => {
    // 既存のイベントリスナーを削除
    const newOption = option.cloneNode(true);
    option.parentNode?.replaceChild(newOption, option);
    
    newOption.addEventListener('click', () => {
      const radio = newOption.querySelector('input[type="radio"]');
      if (radio) {
        radio.checked = true;
        // 選択状態の視覚的フィードバック
        document.querySelectorAll('.api-option').forEach(opt => opt.classList.remove('selected'));
        newOption.classList.add('selected');
      }
    });
  });
};

// 選択されたAPIでURL取り込みを実行する関数
const runImportWithSelectedApi = async (url, selectedApi) => {
  console.log('🚀 URL取り込み開始:', { url, api: selectedApi });
  
  const loadingPopup = document.getElementById('urlLoadingPopup');
  if (loadingPopup) {
    loadingPopup.style.display = 'flex';
    const loadingTitle = loadingPopup.querySelector('.loading-title');
    const loadingMessage = loadingPopup.querySelector('.loading-message');
    const loadingStatus = loadingPopup.querySelector('.loading-status');
    
    if (loadingTitle) loadingTitle.textContent = 'レシピを読み込み中...';
    if (loadingMessage) {
      loadingMessage.textContent = 'Groq APIでレシピ情報を取得しています';
    }
    if (loadingStatus) loadingStatus.textContent = '1回目を試行中...';
  }
  
  try {
    // 選択されたAPIを設定
    window.selectedApi = selectedApi;
    console.log('🔍 window.selectedApiを設定:', window.selectedApi);
    
    await window.runImport(url);
    alert('レシピの読み込みが完了しました！');
  } catch (error) {
    console.error('URL取り込み最終エラー:', error);
    
    setTimeout(() => {
      if (loadingPopup) {
        loadingPopup.style.display = 'none';
      }
      alert(`レシピの読み込みに失敗しました: ${error.message}`);
    }, 3000);
    
    return;
  } finally {
    setTimeout(() => {
      if (loadingPopup) {
        loadingPopup.style.display = 'none';
      }
    }, 1000);
  }
};

// URL Import Function with retry
window.runImport = async function(url, retryCount = 0) {
  const maxRetries = 1; // 最大1回リトライ（合計2回実行）

  // URL取り込みはGroqのみ使用
  window.selectedApi = 'groq';
  
  console.log('🔍 選択されたAPI:', window.selectedApi);

  try {
    console.log(`=== URL取り込み開始 (試行 ${retryCount + 1}/${maxRetries + 1}) ===`);
    console.log('URL:', url);
    console.log('選択されたAPI:', window.selectedApi);

    // DelishKitchenの特定URLかチェック
    if (url.includes('delishkitchen.tv')) {
      console.log('🍳 DelishKitchen URLを検出:', url);
    }
    
    // 取り込み元URLを記録
    currentSourceUrl = url;
    
    // Groq API使用フラグはGroq選択時のみtrue
    window.isGroqGenerated = window.selectedApi === 'groq';
    
    // URLフィールドに表示
    const sourceUrlEl = document.getElementById('sourceUrl');
    if (sourceUrlEl) sourceUrlEl.value = url;
    
    console.log('📡 HTML取得を開始...');
    const html = await fetchHTMLViaProxy(url);
    console.log('✅ HTML取得完了:', html ? html.length + '文字' : 'なし');
    
    // フランス語サイトの場合、取得されたHTMLの詳細を確認
    if (url && url.includes('.fr')) {
      console.log('🇫🇷 フランス語サイト: 取得されたHTMLの詳細確認');
      console.log('🇫🇷 HTML長さ:', html ? html.length : 0);
      
      if (html) {
        // Préparationセクションの存在確認
        const hasPreparation = html.includes('Préparation');
        console.log('🇫🇷 HTMLにPréparationセクションが含まれているか:', hasPreparation);
        
        if (hasPreparation) {
          const preparationIndex = html.indexOf('Préparation');
          console.log('🇫🇷 Préparationセクションの位置:', preparationIndex);
          console.log('🇫🇷 Préparation周辺のHTML:', html.substring(preparationIndex, preparationIndex + 500));
        }
        
        // 番号付き手順の存在確認
        const hasNumberedSteps = /\d+\.\s+[^0-9]/.test(html);
        console.log('🇫🇷 HTMLに番号付き手順が含まれているか:', hasNumberedSteps);
        
        if (hasNumberedSteps) {
          const stepMatches = html.match(/\d+\.\s+[^0-9][^0-9]*?(?=\d+\.|$)/g);
          console.log('🇫🇷 HTML内の番号付き手順:', stepMatches ? stepMatches.slice(0, 3) : 'なし');
        }
      }
    }
    
    // 日本語サイトの場合、取得されたHTMLの詳細を確認
    if (url && (url.includes('.jp') || url.includes('cuisine-kingdom.com'))) {
      console.log('🇯🇵 日本語サイト: 取得されたHTMLの詳細確認');
      console.log('🇯🇵 HTML長さ:', html ? html.length : 0);
      
      if (html) {
        // 材料セクションの存在確認
        const hasMaterials = html.includes('材料') || html.includes('【材料】');
        console.log('🇯🇵 HTMLに材料セクションが含まれているか:', hasMaterials);
        
        if (hasMaterials) {
          const materialIndex = html.indexOf('材料');
          console.log('🇯🇵 材料セクションの位置:', materialIndex);
          console.log('🇯🇵 材料周辺のHTML:', html.substring(materialIndex, materialIndex + 500));
        }
        
        // 手順セクションの存在確認
        const hasSteps = html.includes('手順') || html.includes('作り方') || html.includes('調理');
        console.log('🇯🇵 HTMLに手順セクションが含まれているか:', hasSteps);
        
        if (hasSteps) {
          const stepIndex = html.indexOf('手順');
          console.log('🇯🇵 手順セクションの位置:', stepIndex);
          console.log('🇯🇵 手順周辺のHTML:', html.substring(stepIndex, stepIndex + 500));
        }
        
        // 番号付き手順の存在確認
        const hasNumberedSteps = /\d+\.\s+[^0-9]/.test(html);
        console.log('🇯🇵 HTMLに番号付き手順が含まれているか:', hasNumberedSteps);
        
        if (hasNumberedSteps) {
          const stepMatches = html.match(/\d+\.\s+[^0-9][^0-9]*?(?=\d+\.|$)/g);
          console.log('🇯🇵 HTML内の番号付き手順:', stepMatches ? stepMatches.slice(0, 3) : 'なし');
        }
        
        // 料理王国サイト専用の確認
        if (url.includes('cuisine-kingdom.com')) {
          console.log('🍳 料理王国サイト専用デバッグ');
          const hasRecipeContent = html.includes('レシピ') || html.includes('recipe');
          console.log('🍳 レシピコンテンツが含まれているか:', hasRecipeContent);
          
          const hasIngredients = html.includes('鹿ロース') || html.includes('フォワグラ');
          console.log('🍳 具体的な材料が含まれているか:', hasIngredients);
          
          // HTMLの<li>タグから手順を抽出
          const liMatches = html.match(/<li[^>]*>([^<]+)<\/li>/g);
          if (liMatches && liMatches.length > 0) {
            console.log('🍳 HTMLの<li>タグから手順を発見:', liMatches.slice(0, 5));
            
            // 手順の内容を抽出
            const stepContents = liMatches.map(li => {
              const match = li.match(/<li[^>]*>([^<]+)<\/li>/);
              return match ? match[1].trim() : '';
            }).filter(content => content.length > 0);
            
            console.log('🍳 抽出された手順内容:', stepContents.slice(0, 3));
          }
        }
      }
    }

    if (!html || html.length < 100) {
      throw new Error('HTMLの取得に失敗したか、内容が不十分です');
    }

    console.log('🤖 AI解析を開始...');
    
    // HTMLをテキストに変換してAI解析を実行
    const text = cleanHTML(html, url);
    const recipeData = await callAIAPI(text, url);
    console.log('✅ AI解析完了:', recipeData);
    
    // AI解析結果をグローバル変数に保存
    window.currentRecipeData = recipeData;
    console.log('📝 AI解析結果をグローバル変数に保存:', window.currentRecipeData);
    
    console.log('取得したレシピデータ:', recipeData);
    console.log('材料データ詳細:', recipeData.ingredients);
    
    // 海外サイトの場合、翻訳前のデータを保存
    if (!window.isJapaneseSite && originalRecipeData) {
      console.log('🌍 翻訳前データを保存中...');
      
      // AI解析結果から元の言語データを取得
      if (recipeData.original_title) {
        originalRecipeData.original_title = recipeData.original_title;
      }
      if (recipeData.original_description) {
        originalRecipeData.original_description = recipeData.original_description;
      }
      if (recipeData.original_ingredients && Array.isArray(recipeData.original_ingredients)) {
        originalRecipeData.original_ingredients = recipeData.original_ingredients;
      }
      if (recipeData.original_steps && Array.isArray(recipeData.original_steps)) {
        originalRecipeData.original_steps = recipeData.original_steps;
      }
      
      console.log('🌍 翻訳前データ保存完了:', originalRecipeData);
      console.log('🌍 翻訳後データ:', recipeData);
    }

    // Fill form fields
    if (recipeData.title) document.getElementById('title').value = recipeData.title;
    if (recipeData.description) document.getElementById('notes').value = recipeData.description;
    if (recipeData.servings) document.getElementById('servings').value = recipeData.servings;
    
    // Fill ingredients using the canonical editor row (.ingredient-row with .ingredient-item/.ingredient-quantity/.ingredient-unit)
    const ingredientsContainer = document.getElementById('ingredientsEditor');
    if (ingredientsContainer) {
      ingredientsContainer.innerHTML = '';
      const list = Array.isArray(recipeData.ingredients) ? recipeData.ingredients : [];
      if (list.length > 0) {
        list.forEach((ing, index) => {
          console.log(`🍳 材料${index + 1}の生データ:`, ing);
          let parsedIng = { item: '', quantity: '', unit: '' };
          
          // 材料データの形式を確認
          const priceInfo = extractPriceInfo(ing.quantity || '', ing.unit || '');
          console.log(`🍳 材料${index + 1}の価格情報:`, priceInfo);

          if (ing.item && ing.quantity && ing.unit) {
            // 既に分離されている場合
            console.log(`🍳 材料${index + 1}: 既に分離済みデータ`);
            parsedIng = {
              item: ing.item,
              quantity: priceInfo.quantity || ing.quantity,
              unit: priceInfo.unit || ing.unit,
              price: ing.price || priceInfo.price || ''
            };
            console.log(`🍳 材料${index + 1}: 分離済み結果:`, parsedIng);
          } else if (ing.item && !ing.quantity && !ing.unit) {
            // 材料名だけの場合、文字列解析を試行
            console.log(`🍳 材料${index + 1}: 文字列解析を実行`);
            parsedIng = parseIngredientString(ing.item);
            console.log(`🔍 材料解析: "${ing.item}" → ${JSON.stringify(parsedIng)}`);
          } else {
            // その他の場合
            console.log(`🍳 材料${index + 1}: その他の処理`);
            parsedIng = {
              item: ing.item || '',
              quantity: priceInfo.quantity || ing.quantity || '',
              unit: priceInfo.unit || ing.unit || '',
              price: ing.price || priceInfo.price || ''
            };
            console.log(`🍳 材料${index + 1}: その他結果:`, parsedIng);
          }

          // 単位変換を適用
          const converted = convertUnits(parsedIng.quantity, parsedIng.unit, parsedIng.item);

          // 変換が行われた場合はコンソールに記録
          if (converted.quantity !== parsedIng.quantity || converted.unit !== parsedIng.unit) {
            console.log(`🔄 単位変換: ${parsedIng.item} ${parsedIng.quantity}${parsedIng.unit} → ${converted.quantity}${converted.unit}`);
          }
          
          const finalData = { 
            item: parsedIng.item || '', 
            quantity: converted.quantity || '', 
            unit: converted.unit || '',
            price: parsedIng.price || ''
          };
          console.log(`🍳 最終データ挿入:`, finalData);
          
          addIngredientRow(finalData);
        });
      } else {
        addIngredientRow();
      }
    }

    // Fill steps using the canonical editor row (.step-row with .step-text)
    const stepsContainer = document.getElementById('stepsEditor');
    if (stepsContainer) {
      stepsContainer.innerHTML = '';
      const steps = Array.isArray(recipeData.steps) ? recipeData.steps : [];
      console.log('📝 手順データ:', steps);
      console.log('📝 手順データの詳細:', {
        length: steps.length,
        type: typeof steps,
        isArray: Array.isArray(steps),
        firstStep: steps[0],
        allSteps: steps
      });
      
      // 手順の分離状況を詳細にログ出力
      if (steps.length > 0) {
        console.log('📝 手順分離チェック:');
        steps.forEach((step, index) => {
          console.log(`📝 手順${index + 1}:`, {
            step: step,
            type: typeof step,
            isObject: typeof step === 'object',
            hasStep: !!(step && step.step),
            hasInstruction: !!(step && step.instruction),
            stepContent: step?.step || step?.instruction || step
          });
        });
      } else {
        console.log('⚠️ 手順が抽出されていません。番号付き手順の抽出を確認してください。');
        console.log('🔍 番号付き手順のパターンを検索中...');
        
        // 番号付き手順のパターンを検索
        const numberedPatterns = [
          /\d+\.\s+[^0-9]/g, // 「1. 手順内容」
          /\d+\)\s+[^0-9]/g, // 「1) 手順内容」
          /手順\d+:\s*[^0-9]/g, // 「手順1: 内容」
          /手順\d+\.\s*[^0-9]/g, // 「手順1. 内容」
          /Step\s*\d+:\s*[^0-9]/gi, // 「Step 1: 内容」
          /Étape\s*\d+:\s*[^0-9]/gi, // 「Étape 1: 内容」
          /[A-Z][a-z]+\s*\d+:\s*[^0-9]/g, // 「Preparation 1:」等
          /<li[^>]*>([^<]+)<\/li>/g, // HTMLの<li>タグ内の手順
          /<ol[^>]*>[\s\S]*?<\/ol>/g // HTMLの<ol>タグ全体
        ];
        
        numberedPatterns.forEach((pattern, index) => {
          const matches = text.match(pattern);
          if (matches && matches.length > 0) {
            console.log(`🔍 パターン${index + 1}で番号付き手順を発見:`, matches.slice(0, 3));
          }
        });
        
        if (url && url.includes('.fr')) {
          console.log('🇫🇷 フランス語サイト検出: 手順抽出の詳細デバッグを実行');
          console.log('🇫🇷 元のテキスト内容（最初の2000文字）:', text.substring(0, 2000));
          
          // フランス語サイトの手順セクションを検索
          const preparationMatch = text.match(/Préparation[\s\S]*?(?=\n\n|\n[A-Z]|$)/i);
          if (preparationMatch) {
            console.log('🇫🇷 Préparationセクションを発見:', preparationMatch[0].substring(0, 1000));
          } else {
            console.log('🇫🇷 Préparationセクションが見つかりません');
          }
          
          // 番号付き手順の具体的な検索
          const stepMatches = text.match(/\d+\.\s+[^0-9][^0-9]*?(?=\d+\.|$)/g);
          if (stepMatches && stepMatches.length > 0) {
            console.log('🇫🇷 番号付き手順を発見:', stepMatches.slice(0, 3));
          } else {
            console.log('🇫🇷 番号付き手順が見つかりません');
          }
        }
      }
      if (steps.length > 0) {
        console.log('📝 手順処理開始:', steps.length, '件の手順を処理');
        steps.forEach((step, index) => {
          console.log(`📝 手順${index + 1}の詳細:`, {
            step: step,
            type: typeof step,
            hasInstruction: !!(step && step.instruction),
            hasStep: !!(step && step.step),
            isString: typeof step === 'string'
          });
          
          try {
            // 手順データの形式を確認して適切に処理
            if (typeof step === 'string') {
              // 番号付き手順の包括的処理
              let processedStep = step;
              
              // 番号付き手順のパターンを包括的に処理
              processedStep = processedStep
                .replace(/^\d+\.\s*/, '') // 「1. 手順内容」→「手順内容」
                .replace(/^\d+\)\s*/, '') // 「1) 手順内容」→「手順内容」
                .replace(/^手順\d+:\s*/, '') // 「手順1: 内容」→「内容」
                .replace(/^手順\d+\.\s*/, '') // 「手順1. 内容」→「内容」
                .replace(/^Step\s*\d+:\s*/i, '') // 「Step 1: 内容」→「内容」
                .replace(/^Étape\s*\d+:\s*/i, '') // 「Étape 1: 内容」→「内容」
                .replace(/^[A-Z][a-z]+:\s*/, '') // 手順タイトルを除去
                .replace(/^[A-Z][a-z]+\s*\d+:\s*/, '') // 「Preparation 1:」等を除去
                .trim();
              
              console.log(`📝 番号付き手順処理: "${step}" → "${processedStep}"`);
              console.log(`📝 手順${index + 1}を追加中:`, processedStep);
              addStepRow({ instruction: processedStep });
            } else if (step && typeof step === 'object') {
              let instructionText = '';
              if (step.instruction) {
                instructionText = step.instruction;
                console.log(`📝 手順${index + 1} (instruction):`, instructionText);
              } else if (step.step) {
                instructionText = step.step;
                console.log(`📝 手順${index + 1} (step):`, instructionText);
              } else {
                console.warn('⚠️ 手順オブジェクトにinstructionもstepもありません:', step);
                instructionText = '';
              }
              
              // オブジェクト形式の手順にも番号付き手順の処理を適用
              if (instructionText) {
                instructionText = instructionText
                  .replace(/^\d+\.\s*/, '') // 「1. 手順内容」→「手順内容」
                  .replace(/^\d+\)\s*/, '') // 「1) 手順内容」→「手順内容」
                  .replace(/^手順\d+:\s*/, '') // 「手順1: 内容」→「内容」
                  .replace(/^手順\d+\.\s*/, '') // 「手順1. 内容」→「内容」
                  .replace(/^Step\s*\d+:\s*/i, '') // 「Step 1: 内容」→「内容」
                  .replace(/^Étape\s*\d+:\s*/i, '') // 「Étape 1: 内容」→「内容」
                  .replace(/^[A-Z][a-z]+:\s*/, '') // 手順タイトルを除去
                  .replace(/^[A-Z][a-z]+\s*\d+:\s*/, '') // 「Preparation 1:」等を除去
                  .trim();
                console.log(`📝 オブジェクト手順の番号付き処理: "${step.instruction || step.step}" → "${instructionText}"`);
              }
              
              console.log(`📝 手順${index + 1}を追加中:`, instructionText);
              addStepRow({ instruction: instructionText });
            } else {
              console.warn('⚠️ 手順データが予期しない形式です:', step);
              addStepRow({ instruction: '' });
            }
          } catch (error) {
            console.error(`❌ 手順${index + 1}処理エラー:`, error);
            console.error(`❌ 問題の手順データ:`, step);
            // エラーが発生した場合でも、空の手順行を追加
            addStepRow({ instruction: '' });
          }
        });
        console.log('📝 手順処理完了:', steps.length, '件の手順を処理しました');
      } else {
        console.warn('⚠️ 手順データが空です。URL:', url);
        addStepRow();
      }
    }

    // Try to extract primary image from HTML (og:image > first <img>) and display inline + preview block
    (function attachImageFromHTML(){
      try{
        console.log('🖼️ 画像抽出処理開始');

        // 1) prefer JSON from AI if provided
        let imgUrl = (recipeData && recipeData.image_url) ? String(recipeData.image_url).trim() : '';
        console.log('🖼️ AIから取得した画像URL:', imgUrl);

        // 2) parse HTML for og:image or first img
        if (!imgUrl && typeof DOMParser !== 'undefined'){
          console.log('🖼️ HTMLから画像を抽出中...');
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');

          // og:image メタタグを検索
          const meta = doc.querySelector('meta[property="og:image"], meta[name="og:image"]');
          console.log('🖼️ og:image メタタグ:', meta?.getAttribute('content'));

          // 包括的な海外サイト対応画像セレクター
          const imageSelectors = [
            'img',
            // イタリア語サイト
            '.gz-featured-image img', // giallozafferano
            // 一般的なレシピ画像
            '.recipe-image img',
            '.featured-image img',
            '.post-thumbnail img',
            '.entry-image img',
            'figure img',
            '.hero-image img',
            '.main-image img',
            // シェフごはんサイト対応
            '.recipe-detail img',
            '.recipe-content img',
            '.recipe-main img',
            '.recipe-photo img',
            '.recipe-image-container img',
            '.recipe-header img',
            '.recipe-body img',
            // dancyu.jpサイト対応
            '.recipe img',
            '.article img',
            '.content img',
            '.main-content img',
            '.article-content img',
            '.post-content img',
            // 雑誌系レシピサイト対応
            '.recipe-step img',
            '.step img',
            // 海外サイト用の追加セレクター
            '.cooking-image img',
            '.food-image img',
            '.dish-image img',
            '.meal-image img',
            '.cuisine-image img',
            '.preparation-image img',
            '.ingredients-image img',
            '.method-image img',
            '.procedure-image img',
            '.technique-image img',
            '.garnish-image img',
            '.presentation-image img',
            '.serving-image img',
            '.plating-image img',
            // 海外サイトの構造的セレクター
            'article img',
            '.article img',
            '.post img',
            '.entry img',
            '.content img',
            '.main img',
            '.primary img',
            '.secondary img',
            // 海外サイトの一般的なクラス名
            '.main-content img',
            '.content img',
            '.post-content img',
            '.entry-content img',
            '.article-content img',
            '.recipe-content img',
            '.cooking-content img',
            '.food-content img',
            // 海外サイトのalt属性ベース
            'img[alt*="recipe"]',
            'img[alt*="cooking"]',
            'img[alt*="food"]',
            'img[alt*="dish"]',
            'img[alt*="meal"]',
            'img[alt*="cuisine"]',
            'img[alt*="preparation"]',
            'img[alt*="ingredients"]',
            'img[alt*="step"]',
            'img[alt*="instruction"]',
            'img[alt*="method"]',
            'img[alt*="procedure"]',
            'img[alt*="process"]',
            'img[alt*="technique"]',
            'img[alt*="garnish"]',
            'img[alt*="presentation"]',
            'img[alt*="serving"]',
            'img[alt*="plating"]',
            // 海外サイトのクラス名ベース
            'img[class*="recipe"]',
            'img[class*="cooking"]',
            'img[class*="food"]',
            'img[class*="dish"]',
            'img[class*="meal"]',
            'img[class*="cuisine"]',
            'img[class*="preparation"]',
            'img[class*="ingredients"]',
            'img[class*="step"]',
            'img[class*="instruction"]',
            'img[class*="method"]',
            'img[class*="procedure"]',
            'img[class*="process"]',
            'img[class*="technique"]',
            'img[class*="garnish"]',
            'img[class*="presentation"]',
            'img[class*="serving"]',
            'img[class*="plating"]',
            // 海外サイトのID名ベース
            'img[id*="recipe"]',
            'img[id*="cooking"]',
            'img[id*="food"]',
            'img[id*="dish"]',
            'img[id*="meal"]',
            'img[id*="cuisine"]',
            'img[id*="preparation"]',
            'img[id*="ingredients"]',
            'img[id*="step"]',
            'img[id*="instruction"]',
            'img[id*="method"]',
            'img[id*="procedure"]',
            'img[id*="process"]',
            'img[id*="technique"]',
            'img[id*="garnish"]',
            'img[id*="presentation"]',
            'img[id*="serving"]',
            'img[id*="plating"]',
            // 海外サイトのsrc属性ベース
            'img[src*="recipe"]',
            'img[src*="cooking"]',
            'img[src*="food"]',
            'img[src*="dish"]',
            'img[src*="meal"]',
            'img[src*="cuisine"]',
            'img[src*="preparation"]',
            'img[src*="ingredients"]',
            'img[src*="step"]',
            'img[src*="instruction"]',
            'img[src*="method"]',
            'img[src*="procedure"]',
            'img[src*="process"]',
            'img[src*="technique"]',
            'img[src*="garnish"]',
            'img[src*="presentation"]',
            'img[src*="serving"]',
            'img[src*="plating"]',
            '.cooking-step img',
            '.how-to img',
            // dancyu.jp特有の構造
            'img[src*="dancyu"]',
            'img[src*="president"]',
            'img[alt*="レシピ"]',
            'img[alt*="料理"]',
            'img[alt*="スパイシー"]',
            'img[alt*="ラム"]',
            'img[alt*="仔羊"]',
            // 一般的な画像要素
            'figure img',
            '.image img',
            '.photo img',
            '.picture img',
            // dancyu.jp特有の詳細セレクター
            'img[src*=".jpg"]',
            'img[src*=".jpeg"]',
            'img[src*=".png"]',
            'img[src*=".webp"]',
            // より広範囲な画像検索
            'img[width]',
            'img[height]',
            'img[class*="image"]',
            'img[class*="photo"]',
            'img[class*="picture"]',
            'img[class*="recipe"]',
            'img[class*="cooking"]',
            'img[class*="food"]',
            'img[class*="dish"]'
          ];

          let allImages = [];
          imageSelectors.forEach(selector => {
            try {
              const images = doc.querySelectorAll(selector);
              allImages = allImages.concat(Array.from(images));
            } catch (e) {
              // セレクターエラーをスキップ
            }
          });

          // 365kitchen.net特有の構造: Aタグ内のhref属性から画像URLを抽出
          const linkElements = doc.querySelectorAll('a[href*=".jpg"], a[href*=".jpeg"], a[href*=".png"], a[href*=".webp"]');
          console.log('🖼️ 画像リンク数:', linkElements.length);

          // 365kitchen.net特化: より広範囲な画像検索
          if (url && url.includes('365kitchen.net')) {
            console.log('🖼️ 365kitchen.net専用画像検索を実行');

            // URLパターンから画像を推測（HTTPSとHTTPの両方）
            // よく使われる番号を優先（HTMLから見つからない場合の補完用）
            const possibleImageNumbers = ['41', '31', '21', '11', '1', '2', '3', '4', '5', '42', '32', '22', '12', '43', '33', '23', '13', '44', '34', '24', '14', '45', '35', '25', '15', '01', '02', '03', '04', '05'];
            const baseImageUrls = [
              'https://365kitchen.net/wp-content/uploads/2014/08/', // HTTPS優先
              'http://365kitchen.net/wp-content/uploads/2014/08/'   // HTTP代替
            ];

            baseImageUrls.forEach((baseUrl, urlIndex) => {
              possibleImageNumbers.forEach(num => {
                const testUrl = baseUrl + num + '.jpg';
                const virtualImg = {
                  getAttribute: (attr) => {
                    if (attr === 'src') return testUrl;
                    if (attr === 'alt') return `Recipe image ${num}`;
                    return '';
                  },
                  className: '',
                  parentElement: null,
                  width: 0,
                  height: 0,
                  isVirtual: true,
                  is365Kitchen: true,
                  isHttps: urlIndex === 0, // HTTPS版の場合
                  originalElement: null
                };
                allImages.push(virtualImg);
              });
            });

            console.log('🖼️ 365kitchen.net: 推測画像URLを追加');

            // HTMLテキストから画像番号を抽出してより精密な推測
            const htmlText = html.toLowerCase();
            const imageNumberMatches = htmlText.match(/\/uploads\/\d{4}\/\d{2}\/(\d+)\.jpg/g);
            if (imageNumberMatches) {
              console.log('🖼️ HTMLから画像番号を発見:', imageNumberMatches);
              imageNumberMatches.forEach(match => {
                // HTTPSとHTTP両方を追加
                const httpsUrl = 'https://365kitchen.net/wp-content' + match;
                const httpUrl = 'http://365kitchen.net/wp-content' + match;

                [httpsUrl, httpUrl].forEach((fullUrl, index) => {
                  const virtualImg = {
                    getAttribute: (attr) => {
                      if (attr === 'src') return fullUrl;
                      if (attr === 'alt') return 'Recipe image extracted from HTML';
                      return '';
                    },
                    className: '',
                    parentElement: null,
                    width: 0,
                    height: 0,
                    isVirtual: true,
                    is365Kitchen: true,
                    isFromHtml: true,
                    isHttps: index === 0,
                    originalElement: null
                  };
                  allImages.push(virtualImg);
                  console.log('🖼️ HTMLから抽出:', fullUrl);
                });
              });
            }
          }

          linkElements.forEach((link, index) => {
            const href = link.getAttribute('href');
            if (href && (href.includes('.jpg') || href.includes('.jpeg') || href.includes('.png') || href.includes('.webp'))) {
              // 仮想的なimg要素を作成
              const virtualImg = {
                getAttribute: (attr) => {
                  if (attr === 'src') return href;
                  if (attr === 'alt') return link.textContent || '';
                  return '';
                },
                className: link.className || '',
                parentElement: link.parentElement,
                width: 0,
                height: 0,
                isVirtual: true,
                originalElement: link
              };
              allImages.push(virtualImg);
              console.log(`🖼️ リンクから画像抽出[${index}]:`, href);
            }
          });

          // CSS背景画像も検索
          const elementsWithBgImage = doc.querySelectorAll('[style*="background-image"]');
          console.log('🖼️ 背景画像要素数:', elementsWithBgImage.length);

          elementsWithBgImage.forEach((element, index) => {
            const style = element.getAttribute('style') || '';
            const bgImageMatch = style.match(/background-image:\s*url\(['"]?([^'")]+)['"]?\)/);
            if (bgImageMatch && bgImageMatch[1]) {
              const bgUrl = bgImageMatch[1];
              if (bgUrl.includes('.jpg') || bgUrl.includes('.jpeg') || bgUrl.includes('.png') || bgUrl.includes('.webp')) {
                const virtualBgImg = {
                  getAttribute: (attr) => {
                    if (attr === 'src') return bgUrl;
                    if (attr === 'alt') return element.textContent?.substring(0, 50) || '';
                    return '';
                  },
                  className: element.className || '',
                  parentElement: element.parentElement,
                  width: 0,
                  height: 0,
                  isVirtual: true,
                  isBackground: true,
                  originalElement: element
                };
                allImages.push(virtualBgImg);
                console.log(`🖼️ 背景画像抽出[${index}]:`, bgUrl);
              }
            }
          });

          // 重複除去
          allImages = [...new Set(allImages)];
          console.log('🖼️ ページ内の画像数（リンク・背景含む）:', allImages.length);
          
          // dancyu.jp専用のデバッグログ
          if (url && url.includes('dancyu.jp')) {
            console.log('🖼️ dancyu.jp専用デバッグ:');
            console.log('  - 全画像要素:', allImages.length);
            allImages.forEach((img, index) => {
              const src = img.getAttribute('src') || img.getAttribute('data-src');
              const alt = img.getAttribute('alt') || '';
              console.log(`  - 画像${index + 1}:`, { src, alt, className: img.className });
            });
          }

          // 最初の画像を取得
          const firstImg = doc.querySelector('img');
          console.log('🖼️ 最初の画像src:', firstImg?.getAttribute('src'));
          
          // dancyu.jp専用の追加画像検索
          if (url && url.includes('dancyu.jp')) {
            console.log('🖼️ dancyu.jp専用画像検索を実行');
            
            // より広範囲な画像検索
            const additionalSelectors = [
              'img',
              'img[src]',
              'img[data-src]',
              'img[data-lazy]',
              'img[data-original]',
              'img[loading="lazy"]',
              'img[loading="eager"]'
            ];
            
            additionalSelectors.forEach(selector => {
              try {
                const images = doc.querySelectorAll(selector);
                images.forEach(img => {
                  const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy') || img.getAttribute('data-original');
                  if (src && src.length > 10) {
                    const virtualImg = {
                      getAttribute: (attr) => {
                        if (attr === 'src') return src;
                        if (attr === 'alt') return img.getAttribute('alt') || '';
                        return '';
                      },
                      className: img.className || '',
                      parentElement: img.parentElement,
                      width: img.width || 0,
                      height: img.height || 0,
                      isVirtual: true,
                      isDancyuSpecific: true,
                      originalElement: img
                    };
                    allImages.push(virtualImg);
                    console.log('🖼️ dancyu追加画像:', src);
                  }
                });
              } catch (e) {
                console.warn('🖼️ dancyu画像検索エラー:', e);
              }
            });
            
            // 重複除去（再実行）
            allImages = [...new Set(allImages)];
            console.log('🖼️ dancyu追加検索後の画像数:', allImages.length);
          }

          // 画像候補を優先順位で選択
          let candidates = [];

          // og:image を最優先
          if (meta?.getAttribute('content')) {
            candidates.push({
              url: meta.getAttribute('content'),
              source: 'og:image',
              priority: 1
            });
          }

          // レシピ関連の画像を検索
          allImages.forEach((img, index) => {
            const src = img.getAttribute('src') || img.getAttribute('data-src');
            const alt = img.getAttribute('alt') || '';
            const className = img.className || '';
            const parentElement = img.parentElement;
            const parentClass = parentElement?.className || '';

            if (src && src.length > 10) { // 短すぎるsrcを除外
              let priority = 5; // デフォルト優先度

              // 画像の品質チェック（サイズが推測できる場合）
              const width = img.width || img.getAttribute('width') || 0;
              const height = img.height || img.getAttribute('height') || 0;

              // 365kitchen.net等のAタグリンクから抽出された画像は高優先度
              if (img.isVirtual && src.includes('wp-content/uploads')) {
                priority = 1; // 最高優先度
                console.log('🖼️ Aタグリンク画像を最優先に設定:', src);
              }
              // 365kitchen.net専用推測画像も高優先度
              else if (img.is365Kitchen) {
                // HTMLから抽出された画像は特に優先、HTTPS版も優先
                if (img.isFromHtml && img.isHttps) {
                  priority = -1; // HTMLからのHTTPS抽出は最最優先
                } else if (img.isFromHtml) {
                  priority = 0; // HTMLからの抽出は最優先
                } else if (img.isHttps) {
                  priority = 3; // 推測HTTPS版
                } else {
                  priority = 4; // 推測HTTP版は低優先度
                }
                console.log('🖼️ 365kitchen推測画像を設定:', src, 'HTMLから:', img.isFromHtml, 'HTTPS:', img.isHttps, '優先度:', priority);
              }
              // 背景画像も高優先度
              else if (img.isBackground && src.includes('wp-content/uploads')) {
                priority = 1;
                console.log('🖼️ 背景画像を最優先に設定:', src);
              }

              // レシピ関連キーワードで優先度調整
              if (alt.includes('レシピ') || alt.includes('recipe') ||
                  className.includes('recipe') || className.includes('main') ||
                  parentClass.includes('recipe') || parentClass.includes('main')) {
                priority = 2;
              }
              // シェフごはんサイト特有の画像を優先
              else if (src.includes('chefgohan.gnavi.co.jp') || 
                       src.includes('gnavi.co.jp') ||
                       src.includes('gnst.jp')) {
                priority = 1; // 最高優先度
                console.log('🖼️ シェフごはん画像を最優先に設定:', src);
              }
              // dancyu.jpサイト特有の画像を優先
              else if (src.includes('dancyu.jp') || 
                       src.includes('president.co.jp')) {
                priority = 1; // 最高優先度
                console.log('🖼️ dancyu画像を最優先に設定:', src);
              }
              // dancyu.jp特有のalt属性キーワードで優先
              else if (alt.includes('レシピ') || alt.includes('料理') || 
                       alt.includes('スパイシー') || alt.includes('ラム') || 
                       alt.includes('仔羊') || alt.includes('ロスト')) {
                priority = 2; // 高優先度
                console.log('🖼️ dancyuキーワード画像を優先:', src, alt);
              }
              // dancyu.jp専用検索で見つかった画像を優先
              else if (img.isDancyuSpecific) {
                priority = 1; // 最高優先度
                console.log('🖼️ dancyu専用検索画像を最優先:', src);
              }
              // サイト特有の構造に対応
              else if (src.includes('wp-content/uploads') &&
                       (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png'))) {
                // WordPressのアップロード画像を優先
                priority = 2;
              }
              // イタリア・欧州レシピサイト対応
              else if ((src.includes('giallozafferano') || src.includes('cucchiaio') ||
                       src.includes('cookaround') || src.includes('fattoincasadabenedetta')) &&
                       (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png'))) {
                priority = 2;
              }
              // 一般的なレシピサイトの画像ディレクトリ
              else if ((src.includes('/images/') || src.includes('/img/') ||
                       src.includes('/photos/') || src.includes('/uploads/') ||
                       src.includes('/media/')) &&
                       (src.includes('.jpg') || src.includes('.jpeg') || src.includes('.png'))) {
                priority = 2;
              }
              // サイズが大きい画像を優先
              else if (width > 200 && height > 200) {
                priority = 3;
              }
              // 最初の画像
              else if (index === 0) {
                priority = 4;
              }

              // 小さすぎる画像、アイコン、広告画像を除外
              if (src.includes('icon') || src.includes('logo') ||
                  src.includes('avatar') || src.includes('ad') ||
                  width < 100 || height < 100) {
                priority = 10; // 低優先度
              }

              candidates.push({
                url: src,
                source: `img[${index}]`,
                alt: alt,
                className: className,
                parentClass: parentClass,
                width: width,
                height: height,
                priority: priority
              });
            }
          });

          // 優先度順にソート
          candidates.sort((a, b) => a.priority - b.priority);
          console.log('🖼️ 画像候補:', candidates);

          // 画像候補をグローバルに保存（エラー時の代替用）
          window.lastImageCandidates = candidates;

          // 最優先の画像を選択
          const bestCandidate = candidates.length > 0 ? candidates[0] : null;
          if (bestCandidate) {
            const raw = bestCandidate.url;
            console.log('🖼️ 選択された画像:', bestCandidate);

            try {
              // 365kitchen.net等のWordPressサイトの相対URLに対応
              if (raw.startsWith('//')) {
                imgUrl = 'https:' + raw;
              } else if (raw.startsWith('/')) {
                imgUrl = new URL(raw, url).href;
              } else if (raw.startsWith('http')) {
                imgUrl = raw;
              } else {
                imgUrl = new URL(raw, url).href;
              }
              console.log('🖼️ 絶対URL化:', imgUrl);
            } catch (error) {
              console.warn('🖼️ URL正規化エラー:', error, '元URL:', raw);
              imgUrl = raw;
              console.log('🖼️ 相対URL使用:', imgUrl);
            }
          }
        }

        if (imgUrl){
          console.log('🖼️ 最終的な画像URL:', imgUrl);
          window.currentImageData = imgUrl;

          // インライン（人数横）
          const inlineContainer = document.getElementById('inlineRecipeImageContainer');
          const inlineImg = document.getElementById('inlineRecipeImageImg');
          const noImagePlaceholder = document.getElementById('noImagePlaceholder');
          const deleteBtn = document.getElementById('deleteInlineImageBtn');

          console.log('🖼️ 画像要素:', {
            inlineContainer: !!inlineContainer,
            inlineImg: !!inlineImg,
            noImagePlaceholder: !!noImagePlaceholder,
            deleteBtn: !!deleteBtn
          });

          if (inlineImg){
            // 画像読み込みイベントを追加
            inlineImg.onload = function() {
              console.log('✅ 画像読み込み成功:', imgUrl);
              inlineImg.style.display = 'block';
              if (noImagePlaceholder) {
                noImagePlaceholder.style.display = 'none';
              }
              if (deleteBtn) {
                deleteBtn.style.display = 'flex';
              }
              if (inlineContainer) {
                inlineContainer.style.display = 'inline-block';
              }
            };

            let retryCount = 0;
            const maxRetries = 2;

            inlineImg.onerror = function() {
              console.error('❌ 画像読み込み失敗:', imgUrl, 'リトライ回数:', retryCount);
              retryCount++;

              if (retryCount <= maxRetries) {
                // 1回目: HTTPSに変更して再試行
                if (imgUrl.startsWith('http://') && retryCount === 1) {
                  const httpsUrl = imgUrl.replace('http://', 'https://');
                  console.log('🔄 HTTPS版で再試行:', httpsUrl);
                  inlineImg.src = httpsUrl;
                  window.currentImageData = httpsUrl;
                  return;
                }

                // 2回目: 次の候補画像を試行
                if (retryCount === 2) {
                  console.log('🔄 次の候補画像を検索中...');
                  // 画像候補から次のものを選択
                  const candidates = window.lastImageCandidates || [];
                  if (candidates.length > 1) {
                    const nextCandidate = candidates[1];
                    console.log('🔄 次の候補で再試行:', nextCandidate.url);
                    inlineImg.src = nextCandidate.url;
                    window.currentImageData = nextCandidate.url;
                    return;
                  }
                }
              }

              console.log('⚠️ 全ての画像候補で失敗、表示をスキップ');
            };

            inlineImg.src = imgUrl;
            console.log('🖼️ 画像src設定完了:', imgUrl);
          }

          // 初期表示設定（画像読み込み前）
          if (inlineContainer) {
            inlineContainer.style.display = 'inline-block';
          }

          console.log('✅ 画像抽出・表示完了');
        } else {
          console.log('⚠️ 画像が見つかりませんでした');

          // 画像が見つからない場合でもコンテナを確認
          const inlineContainer = document.getElementById('inlineRecipeImageContainer');
          const noImagePlaceholder = document.getElementById('noImagePlaceholder');

          if (noImagePlaceholder) {
            noImagePlaceholder.style.display = 'block';
            console.log('📝 画像プレースホルダーを表示');
          }
          if (inlineContainer) {
            inlineContainer.style.display = 'inline-block';
          }
        }
      }catch(error){
        console.error('❌ 画像抽出エラー:', error);
      }
    })();

    // URL取り込み時のカテゴリータグ自動追加
    try {
      // URLから言語を判定（isJapaneseSite変数の再計算）
      const isJapaneseSite = url && (
        url.includes('.jp') ||
        url.includes('japanese') ||
        url.includes('japan') ||
        /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(url) ||
        /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(html.substring(0, 1000))
      );
      await addUrlImportTags(url, window.isJapaneseSite);
    } catch (error) {
      console.warn('⚠️ カテゴリータグ追加でエラー:', error);
      // エラーがあってもレシピ取り込みは続行
    }

    alert('レシピの読み込みが完了しました！');
  } catch (error) {
    console.error(`URL取り込みエラー (試行 ${retryCount + 1}):`, error);
    
    // リトライ可能な場合
    if (retryCount < maxRetries) {
      console.log(`リトライします... (${retryCount + 1}/${maxRetries})`);
      
      // ローディングメッセージを更新
      const loadingPopup = document.getElementById('urlLoadingPopup');
      if (loadingPopup) {
        const loadingTitle = loadingPopup.querySelector('.loading-title');
        const loadingMessage = loadingPopup.querySelector('.loading-message');
        const loadingStatus = loadingPopup.querySelector('.loading-status');
        
        if (loadingTitle) loadingTitle.textContent = 'レシピを読み込み中...';
        if (loadingMessage) loadingMessage.textContent = '1回目が失敗しました。2回目を試行中...';
        if (loadingStatus) loadingStatus.textContent = `リトライ中... (${retryCount + 1}/${maxRetries})`;
      }
      
      await sleep(2000); // 2秒待機
      return window.runImport(url, retryCount + 1);
    }
    
    // 最大リトライ回数に達した場合
    // ローディングポップアップに失敗メッセージを表示
    const loadingPopup = document.getElementById('urlLoadingPopup');
    if (loadingPopup) {
      const loadingTitle = loadingPopup.querySelector('.loading-title');
      const loadingMessage = loadingPopup.querySelector('.loading-message');
      const loadingStatus = loadingPopup.querySelector('.loading-status');
      
      if (loadingTitle) loadingTitle.textContent = '読み込みに失敗しました';
      if (loadingMessage) loadingMessage.textContent = '2回トライしましたが、レシピの取得に失敗しました';
      if (loadingStatus) loadingStatus.textContent = `エラー: ${error.message}`;
      
      // スピナーを非表示
      const spinner = loadingPopup.querySelector('.loading-spinner');
      if (spinner) spinner.style.display = 'none';
    }
    
    throw new Error(`URL取り込みに失敗しました (${maxRetries + 1}回試行): ${error.message}`);
  }
};

// URL取り込み時のカテゴリータグ自動追加関数
async function addUrlImportTags(url, isJapaneseSite) {
  try {
    console.log('🏷️ カテゴリータグ自動追加開始');

    // カテゴリーセレクト要素を取得
    const categorySelect = document.getElementById('category');
    if (!categorySelect) {
      console.warn('カテゴリーセレクト要素が見つかりません');
      return;
    }

    // 必要なカテゴリーを定義
    const requiredCategories = ['URL取り込み'];

    // 海外サイトの場合は翻訳タグも追加
    if (!isJapaneseSite) {
      requiredCategories.push('翻訳');
    }

    console.log('🏷️ 追加するカテゴリータグ:', requiredCategories);

    // 現在のカテゴリー値を取得
    let currentCategories = [];
    if (categorySelect.value) {
      currentCategories = categorySelect.value.split(',').map(cat => cat.trim()).filter(cat => cat);
    }

    // 新しいカテゴリーを追加（重複を避ける）
    requiredCategories.forEach(newCategory => {
      if (!currentCategories.includes(newCategory)) {
        currentCategories.push(newCategory);
        console.log(`🏷️ カテゴリー追加: ${newCategory}`);
      } else {
        console.log(`🏷️ カテゴリー既存: ${newCategory}`);
      }
    });

    // カテゴリーセレクトの値を更新
    categorySelect.value = currentCategories.join(', ');

    console.log('🏷️ 最終カテゴリー値:', categorySelect.value);
    console.log('✅ カテゴリータグ自動追加完了');

  } catch (error) {
    console.error('❌ カテゴリータグ自動追加エラー:', error);
  }
}

// 手動翻訳時のカテゴリータグ自動追加関数
async function addTranslationTag() {
  try {
    console.log('🏷️ 翻訳カテゴリータグ自動追加開始');

    // カテゴリーセレクト要素を取得
    const categorySelect = document.getElementById('category');
    if (!categorySelect) {
      console.warn('カテゴリーセレクト要素が見つかりません');
      return;
    }

    // 現在のカテゴリー値を取得
    let currentCategories = [];
    if (categorySelect.value) {
      currentCategories = categorySelect.value.split(',').map(cat => cat.trim()).filter(cat => cat);
    }

    // 翻訳タグが既に存在するかチェック
    const translationTag = '翻訳';
    if (!currentCategories.includes(translationTag)) {
      currentCategories.push(translationTag);
      console.log(`🏷️ カテゴリー追加: ${translationTag}`);

      // カテゴリーセレクトの値を更新
      categorySelect.value = currentCategories.join(', ');
      console.log('🏷️ 最終カテゴリー値:', categorySelect.value);
    } else {
      console.log(`🏷️ カテゴリー既存: ${translationTag}`);
    }

    console.log('✅ 翻訳カテゴリータグ自動追加完了');

  } catch (error) {
    console.error('❌ 翻訳カテゴリータグ自動追加エラー:', error);
  }
}

// DOM Helper Functions
const addIngredientRow = (data = {}) => {
  console.log(`📝 addIngredientRow受信データ:`, data);
  
  const container = document.getElementById('ingredientsEditor');
  if (!container) return;
  
  const div = document.createElement('div');
  div.className = 'ingredient-row';
  div.innerHTML = `
    <div class="ingredient-top-row">
      <input type="text" placeholder="材料名" value="${escapeHtml(data.item || '')}" class="ingredient-item">
      <button type="button" class="btn primary small js-remove-row">削除</button>
    </div>
    <div class="ingredient-bottom-row">
      <input type="text" placeholder="分量" value="${escapeHtml(data.quantity || '')}" class="ingredient-quantity">
      <input type="text" placeholder="単位" value="${escapeHtml(data.unit || '')}" class="ingredient-unit">
      <input type="text" placeholder="単価" value="${data.price || ''}" class="ingredient-price">
    </div>
  `;
  container.appendChild(div);
  
  console.log('2行構成の材料入力欄を作成しました');
};

const addStepRow = (data = {}) => {
  console.log('📝 addStepRow呼び出し:', data);
  
  const container = document.getElementById('stepsEditor');
  if (!container) {
    console.error('❌ stepsEditorコンテナが見つかりません');
    return;
  }
  
  // 既存の番号を除去（例：「1. 手順内容」→「手順内容」）
  let instruction = '';
  
  // データの形式を確認して適切に処理
  if (data && typeof data === 'object') {
    if (data.instruction) {
      instruction = String(data.instruction);
      console.log('📝 instructionから取得:', instruction);
    } else if (data.step) {
      instruction = String(data.step);
      console.log('📝 stepから取得:', instruction);
    }
  } else if (typeof data === 'string') {
    instruction = data;
    console.log('📝 文字列から取得:', instruction);
  }
  
  // 数字とピリオドで始まる番号を除去
  if (instruction && typeof instruction === 'string') {
    const originalInstruction = instruction;
    instruction = instruction.replace(/^\d+\.\s*/, '');
    if (originalInstruction !== instruction) {
      console.log('📝 番号除去:', originalInstruction, '→', instruction);
    }
  }
  
  console.log('📝 最終手順テキスト:', instruction);
  
  const div = document.createElement('div');
  div.className = 'step-row';
  div.innerHTML = `
    <textarea placeholder="手順を入力してください" class="step-text">${escapeHtml(instruction)}</textarea>
    <button type="button" class="btn primary small js-remove-row">削除</button>
  `;
  container.appendChild(div);
  
  console.log('📝 手順行を追加しました:', instruction.substring(0, 50) + (instruction.length > 50 ? '...' : ''));
};

// Category and Tag Management
const updateCategorySelect = () => {
  const text = document.getElementById('selectedCategoryText');
  const selectedCategoriesContainer = document.getElementById('selectedCategories');
  
  console.log('updateCategorySelect呼び出し:');
  console.log('- selectedCategories:', selectedCategories);
  console.log('- selectedCategories.length:', selectedCategories.length);
  console.log('- selectedCategoriesContainer存在:', !!selectedCategoriesContainer);
  
  if (selectedCategories.length === 0) {
    if (text) text.textContent = 'カテゴリーを選択';
    if (selectedCategoriesContainer) selectedCategoriesContainer.innerHTML = '';
  } else {
    if (text) text.textContent = `${selectedCategories.length}個のカテゴリーを選択中`;
    if (selectedCategoriesContainer) {
      const categoryHTML = selectedCategories.map(category => 
        `<span class="selected-category-tag" style="display: inline-block; margin: 2px 4px; padding: 4px 8px; background: #1976d2; color: white; border-radius: 12px; font-size: 0.8em; font-weight: 500;">${category} <button type="button" class="remove-category-btn" data-category="${category}" style="margin-left: 4px; background: rgba(255,255,255,0.3); border: none; border-radius: 50%; width: 16px; height: 16px; color: white; cursor: pointer; font-size: 12px; line-height: 1;">&times;</button></span>`
      ).join('');
      
      console.log('- 生成されるHTML:', categoryHTML);
      selectedCategoriesContainer.innerHTML = categoryHTML;
    }
  }
  updateRecipeTypeByCategory();
};

// カテゴリモーダル内の選択状態プレビューを更新
const updateCategoryModalPreview = () => {
  const previewContainer = document.getElementById('selected-categories-list');
  if (!previewContainer) {
    console.log('プレビューコンテナが見つかりません');
    return;
  }
  
  console.log('プレビュー更新 - selectedCategories:', selectedCategories);
  
  if (selectedCategories.length === 0) {
    previewContainer.innerHTML = '<div style="color: #666; font-style: italic; text-align: center; padding: 0.5rem;">選択されたカテゴリーはありません</div>';
  } else {
    previewContainer.innerHTML = selectedCategories.map(category => 
      `<span class="selected-category-tag" style="display: inline-block; margin: 2px 4px; padding: 6px 12px; background: #1976d2; color: white; border-radius: 16px; font-size: 0.85em; font-weight: 500; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">${category}</span>`
    ).join('');
  }
};

const updateTagSelect = () => {
  const text = document.getElementById('selectedTagsText');
  const selectedTagsContainer = document.getElementById('selectedTags');
  
  if (selectedTags.length === 0) {
    if (text) text.textContent = 'タグを選択';
    if (selectedTagsContainer) selectedTagsContainer.innerHTML = '';
  } else {
    if (text) text.textContent = `${selectedTags.length}個のタグを選択中`;
    if (selectedTagsContainer) {
      selectedTagsContainer.innerHTML = selectedTags.map(tag => 
        `<span class="selected-tag-tag" style="display: inline-block; margin: 2px 4px; padding: 4px 8px; background: #1976d2; color: white; border-radius: 12px; font-size: 0.8em; font-weight: 500;">${tag} <button type="button" class="remove-tag-btn" data-tag="${tag}" style="margin-left: 4px; background: rgba(255,255,255,0.3); border: none; border-radius: 50%; width: 16px; height: 16px; color: white; cursor: pointer; font-size: 12px; line-height: 1;">&times;</button></span>`
      ).join('');
    }
  }
};

const updateRecipeTypeByCategory = () => {
  const elements = {
    label: document.querySelector('.servings-field label[for="servings"]'),
    input: document.querySelector('#servings'),
    unit: document.querySelector('.servings-unit'),
    button: document.querySelector('#adjustServingsBtn')
  };
  
  if (!Object.values(elements).every(el => el)) return;
  
  const category = selectedCategories.length > 0 ? selectedCategories[0].toLowerCase() : '';
  
  if (category.includes('パン') || category.includes('bread')) {
    currentRecipeType = 'bread';
    elements.label.textContent = '出来上がり総量';
    elements.input.placeholder = '例: 500';
    elements.unit.textContent = 'g';
    elements.button.textContent = '総量に応じて材料量を調整';
  } else if (category.includes('ケーキ') || category.includes('cake')) {
    currentRecipeType = 'cake';
    elements.label.textContent = '出来上がりサイズ';
    elements.input.placeholder = '例: 18cm';
    elements.unit.textContent = '型';
    elements.button.textContent = 'サイズに応じて材料量を調整';
  } else {
    currentRecipeType = 'normal';
    elements.label.textContent = '出来上がり人数';
    elements.input.placeholder = '例: 4';
    elements.unit.textContent = '人前';
    elements.button.textContent = '人数に応じて材料量を調整';
  }
};

// Modal Management
const toggleModal = (modalId, show) => {
  const modal = document.getElementById(modalId);
  if (modal) modal.style.display = show ? 'flex' : 'none';
};

const setupModalEvents = () => {
  // URL Import Modal (料理名の上のボタン - 既存のモーダルを開く)
  const urlImportBtn = document.getElementById('urlImportBtn');
  console.log('🔍 URL取り込みボタン要素:', urlImportBtn);
  
  if (urlImportBtn) {
    urlImportBtn.addEventListener('click', () => {
      console.log('🔍 URL取り込みボタンがクリックされました');
      toggleModal('url-import-modal', true);
      document.getElementById('urlInput')?.focus();
    });
    console.log('✅ URL取り込みボタンのイベントリスナーを設定しました');
  } else {
    console.error('❌ URL取り込みボタンが見つかりません');
  }
  
  document.getElementById('url-import-modal-close-btn')?.addEventListener('click', () => toggleModal('url-import-modal', false));
  document.getElementById('urlImportCancelBtn')?.addEventListener('click', () => toggleModal('url-import-modal', false));
  
  document.getElementById('urlImportConfirmBtn')?.addEventListener('click', async () => {
    const url = document.getElementById('urlInput')?.value?.trim();
    if (!url) return alert('URLを入力してください。');
    if (!url.startsWith('http')) return alert('有効なURLを入力してください。');
    
    // モーダルを閉じる
    toggleModal('url-import-modal', false);
    
    // API選択ポップアップを表示
    showApiSelectionModal(url);
  });
  
  // Category Modal
  document.getElementById('categorySelectBtn')?.addEventListener('click', async () => {
    toggleModal('category-modal', true);
    await loadCategories(); // モーダル表示時にカテゴリーを読み込み
    
    // 既存の選択状態をクリアして、現在のselectedCategoriesを反映
    document.querySelectorAll('.category-option').forEach(el => {
      el.classList.remove('selected');
    });
    
    // 現在のselectedCategoriesに基づいて選択状態を復元
    if (selectedCategories.length > 0) {
      selectedCategories.forEach(categoryName => {
        // 基本カテゴリから検索
        const basicOption = Array.from(document.querySelectorAll('#category-options .category-option')).find(el => 
          el.textContent.trim() === categoryName
        );
        if (basicOption) {
          basicOption.classList.add('selected');
        }
        
        // カスタムカテゴリから検索
        const customOption = Array.from(document.querySelectorAll('#custom-category-options .category-option')).find(el => {
          const span = el.querySelector('span');
          const text = span ? span.textContent.trim() : el.textContent.trim();
          return text === categoryName;
        });
        if (customOption) {
          customOption.classList.add('selected');
        }
      });
    }
    
    updateCategoryModalPreview(); // 選択状態プレビューを更新
  });
  
  // Tag Modal  
  document.getElementById('tagSelectBtn')?.addEventListener('click', async () => {
    toggleModal('tag-modal', true);
    await loadTags(); // モーダル表示時にタグを読み込み
  });
  
  // AI Modal
  document.getElementById('ai-wizard-btn')?.addEventListener('click', () => {
    toggleModal('ai-modal', true);
  });

  // Image Analysis Modal
  document.getElementById('imageImportBtn')?.addEventListener('click', () => {
    toggleModal('image-import-modal', true);
  });
  
  document.getElementById('image-import-modal-close-btn')?.addEventListener('click', () => toggleModal('image-import-modal', false));
  document.getElementById('imageImportCancelBtn')?.addEventListener('click', () => toggleModal('image-import-modal', false));
  
  // Image upload buttons
  document.getElementById('fileSelectBtn')?.addEventListener('click', () => {
    document.getElementById('imageInput')?.click();
  });
  
  document.getElementById('cameraBtn')?.addEventListener('click', () => {
    document.getElementById('cameraInput')?.click();
  });

  // --- Multi-image upload and Drag & Drop ---
  window.currentImageFiles = []; // Holds all uploaded files

  const handleImageFiles = (files) => {
      console.log('--- handleImageFiles called ---');
      const previewArea = document.getElementById('previewArea');
      const imageMessageArea = document.getElementById('imageMessageArea');
      const uploadArea = document.getElementById('uploadArea');
      const analyzeButton = document.getElementById('analyzeButton');

      if (!window.currentImageFiles) {
          console.log('Initializing window.currentImageFiles = []');
          window.currentImageFiles = [];
      }
      console.log(`Before adding: ${window.currentImageFiles.length} files stored.`);

      const newFiles = Array.from(files).filter(newFile => 
        !window.currentImageFiles.some(existingFile => 
            existingFile.name === newFile.name && existingFile.size === newFile.size
        )
      );
      console.log(`Received ${files.length} files, ${newFiles.length} are new and unique.`);

      if (newFiles.length === 0) {
          console.log('No new files to add. Exiting.');
          return;
      }

      window.currentImageFiles.push(...newFiles);
      window.__ocrCurrentFile = window.currentImageFiles[0] || null;
      console.log(`After adding: ${window.currentImageFiles.length} files stored.`);

      let multiPreviewContainer = document.getElementById('multiPreviewContainer');
      if (!multiPreviewContainer) {
          multiPreviewContainer = document.createElement('div');
          multiPreviewContainer.id = 'multiPreviewContainer';
          multiPreviewContainer.style.display = 'flex';
          multiPreviewContainer.style.flexWrap = 'wrap';
          multiPreviewContainer.style.gap = '10px';
          multiPreviewContainer.style.marginTop = '10px';
          previewArea.insertBefore(multiPreviewContainer, analyzeButton.parentElement);
      }
      
      multiPreviewContainer.innerHTML = ''; 
      console.log('Cleared multi-preview container.');

      console.log(`Rendering ${window.currentImageFiles.length} total previews.`);
      for (const file of window.currentImageFiles) {
          if (!file.type.startsWith('image/')){ continue; }

          const img = document.createElement('img');
          img.classList.add('image-preview');
          img.style.maxWidth = '150px';
          img.style.maxHeight = '150px';
          multiPreviewContainer.appendChild(img);

          const reader = new FileReader();
          reader.onload = (e) => { img.src = e.target.result; };
          reader.readAsDataURL(file);
      }

      const hasFiles = window.currentImageFiles.length > 0;
      uploadArea.style.display = 'block';
      previewArea.style.display = hasFiles ? 'block' : 'none';
      if (analyzeButton) analyzeButton.disabled = !hasFiles;
      
      const singlePreviewImg = document.getElementById('previewImage');
      if(singlePreviewImg) singlePreviewImg.style.display = 'none';
      console.log('--- handleImageFiles finished ---');
  };

  const imageInput = document.getElementById('imageInput');
  if (imageInput) {
      imageInput.addEventListener('change', (e) => handleImageFiles(e.target.files));
  }
  const cameraInput = document.getElementById('cameraInput');
  if (cameraInput) {
      cameraInput.addEventListener('change', (e) => handleImageFiles(e.target.files));
  }
  
  const uploadArea = document.getElementById('uploadArea');
  if (uploadArea) {
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
          uploadArea.addEventListener(eventName, (e) => {
              e.preventDefault();
              e.stopPropagation();
          }, false);
      });
      ['dragenter', 'dragover'].forEach(eventName => {
          uploadArea.addEventListener(eventName, () => uploadArea.classList.add('dragover'), false);
      });
      ['dragleave', 'drop'].forEach(eventName => {
          uploadArea.addEventListener(eventName, () => uploadArea.classList.remove('dragover'), false);
      });
      uploadArea.addEventListener('drop', (e) => {
          handleImageFiles(e.dataTransfer.files);
      }, false);
  }

  const clearImageButton = document.getElementById('clearImageButton');
  if (clearImageButton) {
    clearImageButton.addEventListener('click', () => {
        window.currentImageFiles = [];
        const multiPreviewContainer = document.getElementById('multiPreviewContainer');
        if (multiPreviewContainer) multiPreviewContainer.innerHTML = '';
        
        const previewArea = document.getElementById('previewArea');
        if(previewArea) previewArea.style.display = 'none';

        const uploadArea = document.getElementById('uploadArea');
        if(uploadArea) uploadArea.style.display = 'block';

        const analyzeButton = document.getElementById('analyzeButton');
        if (analyzeButton) analyzeButton.disabled = true;

        window.__ocrCurrentFile = null;

        const singlePreviewImg = document.getElementById('previewImage');
        if(singlePreviewImg) {
          singlePreviewImg.src = '';
          singlePreviewImg.style.display = 'block'; // Reset single previewer
        }
    });
  }

  // Simple image upload to Supabase Storage (robust: dynamic input to avoid stale state)
  const imageUploadBtn = document.getElementById('imageUploadBtn');
  const imageFileInput = document.getElementById('recipeImageFile');
  async function uploadSelectedImageFile(file){
    if (!file) return;
    try {
      const fileExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const fileName = `${crypto?.randomUUID?.() || Date.now()}.${fileExt}`;
      const filePath = `recipes/${fileName}`;
      const bucket = CONFIG.STORAGE_BUCKET || 'images';
      const { error: upErr } = await sb.storage.from(bucket).upload(filePath, file, { upsert: true, cacheControl: '3600', contentType: file.type || 'image/jpeg' });
      if (upErr) throw upErr;
      const { data } = sb.storage.from(bucket).getPublicUrl(filePath);
      const publicUrl = data?.publicUrl;
      if (!publicUrl) throw new Error('公開URLの取得に失敗しました');
      // Inline preview (人数横)
      const inlineContainer = document.getElementById('inlineRecipeImageContainer');
      const inlineImg = document.getElementById('inlineRecipeImageImg');
      const noImagePlaceholder = document.getElementById('noImagePlaceholder');
      const deleteBtn = document.getElementById('deleteInlineImageBtn');
      
      if (inlineImg) {
        inlineImg.src = publicUrl;
        inlineImg.style.display = 'block';
      }
      if (noImagePlaceholder) {
        noImagePlaceholder.style.display = 'none';
      }
      if (deleteBtn) {
        deleteBtn.style.display = 'flex';
      }
      if (inlineContainer) inlineContainer.style.display = 'inline-block';
      window.currentImageData = publicUrl;
    } catch (err) {
      console.error('Upload error:', err);
      alert('画像アップロードに失敗しました: ' + (err.message || err));
    }
  }
  if (imageUploadBtn) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    imageUploadBtn.addEventListener('click', () => {
      if (isIOS) {
        const temp = document.createElement('input');
        temp.type = 'file';
        temp.accept = 'image/*';
        temp.onchange = (ev) => {
          const file = (ev.target && ev.target.files) ? ev.target.files[0] : null;
          uploadSelectedImageFile(file);
        };
        document.body.appendChild(temp);
        temp.click();
        setTimeout(() => { try { document.body.removeChild(temp); } catch(_){} }, 1000);
      } else if (imageFileInput) {
        try { imageFileInput.value = ''; } catch(_){ }
        imageFileInput.click();
      } else {
        const temp = document.createElement('input');
        temp.type = 'file';
        temp.accept = 'image/*';
        temp.onchange = (ev) => {
          const file = (ev.target && ev.target.files) ? ev.target.files[0] : null;
          uploadSelectedImageFile(file);
        };
        temp.click();
      }
    });
  }
  if (imageFileInput) {
    imageFileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      uploadSelectedImageFile(file);
      try{ e.target.value=''; }catch(_){ }
    });
  }

  // 画像削除ボタンのイベントハンドラー
  const deleteInlineImageBtn = document.getElementById('deleteInlineImageBtn');
  
  function deleteRecipeImage() {
    // 画像データを削除
    window.currentImageData = null;
    
    
    // インライン画像を非表示
    const inlineContainer = document.getElementById('inlineRecipeImageContainer');
    const inlineImg = document.getElementById('inlineRecipeImageImg');
    const noImagePlaceholder = document.getElementById('noImagePlaceholder');
    const deleteBtn = document.getElementById('deleteInlineImageBtn');
    
    if (inlineImg) {
      inlineImg.src = '';
      inlineImg.style.display = 'none';
    }
    if (noImagePlaceholder) {
      noImagePlaceholder.style.display = 'flex';
    }
    if (deleteBtn) {
      deleteBtn.style.display = 'none';
    }
    if (inlineContainer) inlineContainer.style.display = 'inline-block';
    
    // ファイル入力をクリア
    if (imageFileInput) {
      try { imageFileInput.value = ''; } catch(_) {}
    }
    
    console.log('レシピ画像を削除しました');
  }
  
  
  if (deleteInlineImageBtn) {
    deleteInlineImageBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteRecipeImage();
    });
  }
  

  
  document.getElementById('clearImageButton')?.addEventListener('click', () => {
    // Call the clearImage function from recipe_edit.html  
    if (typeof clearImage === 'function') {
      clearImage();
    }
  });

  // Servings adjustment button
  document.getElementById('adjustServingsBtn')?.addEventListener('click', () => {
    const newServings = prompt('何人分に調整しますか？', baseServings || 2);
    if (newServings && !isNaN(newServings)) {
      adjustIngredientQuantities(parseInt(newServings));
    }
  });

  // Source URL field change tracking
  document.getElementById('sourceUrl')?.addEventListener('input', (e) => {
    currentSourceUrl = e.target.value.trim() || null;
  });

  // カテゴリー一覧を読み込む関数
  async function loadCategories() {
    try {
      console.log('カテゴリー一覧を読み込み中...');
      
      // 基本カテゴリーを設定（固定）
      const basicCategories = [
        'すべて', 'アミューズ', '前菜', 'ソース', 'スープ', 'パスタ',
        '魚料理', '肉料理', 'メイン', 'デザート', 'パン', '翻訳',
        'AI-Groq解析', 'AI-ChatGPT解析', 'その他'
      ];
      
      const categoryOptionsEl = document.getElementById('category-options');
      if (categoryOptionsEl) {
        categoryOptionsEl.innerHTML = '';
        
        basicCategories.forEach(category => {
          const categoryDiv = document.createElement('div');
          categoryDiv.className = 'category-option';
          categoryDiv.textContent = category;
          categoryDiv.addEventListener('click', () => {
            // 複数選択対応：選択状態をトグル
            console.log('カテゴリクリック:', categoryDiv.textContent, '現在の選択状態:', categoryDiv.classList.contains('selected'));
            categoryDiv.classList.toggle('selected');
            console.log('クリック後の選択状態:', categoryDiv.classList.contains('selected'));
            
            // 選択状態をselectedCategoriesに反映
            const categoryName = categoryDiv.textContent.trim();
            if (categoryDiv.classList.contains('selected')) {
              if (!selectedCategories.includes(categoryName)) {
                selectedCategories.push(categoryName);
              }
            } else {
              selectedCategories = selectedCategories.filter(cat => cat !== categoryName);
            }
            console.log('更新後のselectedCategories:', selectedCategories);
            
            updateCategoryModalPreview(); // プレビューを更新
          });
          categoryOptionsEl.appendChild(categoryDiv);
        });

        console.log('基本カテゴリーを読み込み完了:', basicCategories.length, '件');

        if (selectedCategories.length > 0) {
          Array.from(categoryOptionsEl.children).forEach(option => {
            if (selectedCategories.includes(option.textContent.trim())) {
              option.classList.add('selected');
            }
          });
        }
      }
      
      // データベースからカスタムカテゴリーを取得
      try {
        const { data: customCategories, error } = await sb.from('categories').select('name').order('name');
        if (error) {
          // テーブルが存在しない場合はスキップ
          if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
            console.log('categoriesテーブルがまだ作成されていません');
            return;
          }
          throw error;
        }
        
        if (customCategories && customCategories.length > 0) {
          const customCategoryOptionsEl = document.getElementById('custom-category-options');
          const customCategoryGroupEl = document.getElementById('custom-category-group');
          
          if (customCategoryOptionsEl && customCategoryGroupEl) {
            customCategoryOptionsEl.innerHTML = '';
            customCategoryGroupEl.style.display = 'block';
            
            customCategories.forEach(cat => {
              const categoryDiv = document.createElement('div');
              categoryDiv.className = 'category-option custom-category';
              categoryDiv.style.position = 'relative';
              categoryDiv.style.display = 'flex';
              categoryDiv.style.justifyContent = 'space-between';
              categoryDiv.style.alignItems = 'center';
              
              const categoryText = document.createElement('span');
              categoryText.textContent = cat.name;
              categoryText.style.flex = '1';
              
              const deleteBtn = document.createElement('button');
              deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
              deleteBtn.className = 'btn primary small category-delete-btn';
              deleteBtn.style.marginLeft = '8px';
              deleteBtn.style.padding = '2px 6px';
              deleteBtn.style.fontSize = '12px';
              deleteBtn.title = 'このカテゴリーを削除';
              
              categoryDiv.appendChild(categoryText);
              categoryDiv.appendChild(deleteBtn);
              
              // カテゴリー選択イベント（複数選択対応）
              categoryText.addEventListener('click', () => {
                console.log('カスタムカテゴリクリック:', categoryText.textContent, '現在の選択状態:', categoryDiv.classList.contains('selected'));
                categoryDiv.classList.toggle('selected');
                console.log('クリック後の選択状態:', categoryDiv.classList.contains('selected'));
                
                // 選択状態をselectedCategoriesに反映
                const categoryName = categoryText.textContent.trim();
                if (categoryDiv.classList.contains('selected')) {
                  if (!selectedCategories.includes(categoryName)) {
                    selectedCategories.push(categoryName);
                  }
                } else {
                  selectedCategories = selectedCategories.filter(cat => cat !== categoryName);
                }
                console.log('更新後のselectedCategories:', selectedCategories);
                
                updateCategoryModalPreview(); // プレビューを更新
              });
              
              // カテゴリー削除イベント
              deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await deleteCustomCategory(cat.name);
              });
              
              customCategoryOptionsEl.appendChild(categoryDiv);
            });

            console.log('カスタムカテゴリーを読み込み完了:', customCategories.length, '件');

            if (selectedCategories.length > 0) {
              Array.from(customCategoryOptionsEl.children).forEach(option => {
                const text = option.querySelector('span')?.textContent || option.textContent;
                if (selectedCategories.includes(text.trim())) {
                  option.classList.add('selected');
                }
              });
            }
          }
        }
      } catch (customError) {
        console.log('カスタムカテゴリーの取得をスキップ:', customError.message);
      }
      
    } catch (error) {
      console.error('カテゴリー読み込みエラー:', error);
    }
  }

  // Load Tags function
  async function loadTags() {
    try {
      console.log('タグ一覧を読み込み中...');
      
      const tagOptionsEl = document.getElementById('tag-options');
      if (tagOptionsEl) {
        tagOptionsEl.innerHTML = '';
      }
      
      // データベースからタグを取得
      try {
        const { data: allTags, error } = await sb.from('tags').select('*').order('name');
        if (error) {
          // テーブルが存在しない場合はスキップ
          if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
            console.log('tagsテーブルがまだ作成されていません');
            return;
          }
          throw error;
        }
        
        if (allTags && allTags.length > 0 && tagOptionsEl) {
          // 全てのタグに削除ボタンを表示（使用中かどうかは削除時にチェック）
          allTags.forEach(tag => {
            const tagDiv = document.createElement('div');
            tagDiv.className = 'tag-option custom-tag';
            tagDiv.innerHTML = `
              ${tag.name}
              <i class="fas fa-times tag-delete-btn" data-tag-id="${tag.id}" data-tag-name="${tag.name}"></i>
            `;
            
            tagDiv.setAttribute('data-tag-id', tag.id);
            tagDiv.setAttribute('data-tag-name', tag.name);
            tagOptionsEl.appendChild(tagDiv);
          });
          
          console.log('タグを読み込み完了:', allTags.length, '件');
        }
        
        // カスタムタグセクションの処理（将来的な拡張用）
        const customTagOptionsEl = document.getElementById('custom-tag-options');
        const customTagGroupEl = document.getElementById('custom-tag-group');
        
        if (customTagOptionsEl && customTagGroupEl) {
          // 現在は全てのタグを基本タグ扱いにするので非表示
          customTagGroupEl.style.display = 'none';
        }
        
      } catch (tagError) {
        console.log('タグの取得をスキップ:', tagError.message);
      }
      
    } catch (error) {
      console.error('タグ読み込みエラー:', error);
    }
  }

  // 新しいカテゴリーを追加する関数
  async function addNewCategory(categoryName) {
    try {
      console.log('新しいカテゴリーを追加中:', categoryName);
      
      // データベースにカテゴリーを追加
      const { data, error } = await sb.from('categories').insert([
        { name: categoryName, created_at: new Date().toISOString() }
      ]);
      
      if (error) {
        // カテゴリーテーブルが存在しない場合は作成
        if (error.code === '42P01') {
          console.log('カテゴリーテーブルが存在しないため作成します');
          alert('カテゴリーテーブルを作成する必要があります。管理者に連絡してください。');
          return;
        }
        throw error;
      }
      
      console.log('カテゴリー追加成功:', categoryName);
      alert(`カテゴリー「${categoryName}」を追加しました！`);
      
      // カテゴリー一覧を再読み込み
      await loadCategories();
      
      // index.htmlのカテゴリータブに追加するために、カテゴリー情報を保存
      localStorage.setItem('newCategoryAdded', JSON.stringify({
        name: categoryName,
        timestamp: Date.now()
      }));
      
    } catch (error) {
      console.error('カテゴリー追加エラー:', error);
      alert('カテゴリーの追加に失敗しました: ' + error.message);
    }
  }

  // 新しいタグを追加する関数
  async function addNewTag(tagName) {
    try {
      console.log('新しいタグを追加中:', tagName);
      
      // データベースにタグを追加
      const { data, error } = await sb.from('tags').insert([
        { name: tagName, created_at: new Date().toISOString() }
      ]);
      
      if (error) {
        // タグテーブルが存在しない場合は作成
        if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
          alert('tagsテーブルが作成されていません。まずSQLファイルを実行してください。');
          return;
        }
        
        // 重複エラーの場合
        if (error.code === '23505' || error.message.includes('duplicate')) {
          alert('このタグは既に存在します。');
          return;
        }
        
        throw error;
      }
      
      console.log('タグ追加成功:', data);
      
      // タグリストを再読み込み
      await loadTags();
      
      alert('新しいタグを追加しました: ' + tagName);
      
    } catch (error) {
      console.error('タグ追加エラー:', error);
      alert('タグの追加に失敗しました: ' + error.message);
    }
  }

  // タグ削除関数
  async function deleteCustomTag(tagId, tagName) {
    try {
      console.log('タグ削除を開始:', { tagId, tagName });
      
      // タグが使用中かどうかをチェック
      console.log('タグ使用状況をチェック中:', tagName);
      
      const { data: recipesWithTag, error: checkError } = await sb
        .from('recipes')
        .select('id, title, tags')
        .not('tags', 'is', null);
      
      if (checkError) {
        console.error('タグ使用状況チェックエラー:', checkError);
        alert('タグの使用状況確認中にエラーが発生しました。');
        return;
      }
      
      // tagsフィールドに指定されたタグが含まれているレシピを検索
      const recipesUsingTag = recipesWithTag.filter(recipe => {
        if (Array.isArray(recipe.tags)) {
          return recipe.tags.includes(tagName);
        }
        return false;
      });
      
      console.log('タグを使用しているレシピ:', recipesUsingTag.length, '件');
      
      if (recipesUsingTag.length > 0) {
        const recipeNames = recipesUsingTag.slice(0, 3).map(r => r.title).join('、');
        const moreText = recipesUsingTag.length > 3 ? ` 他${recipesUsingTag.length - 3}件` : '';
        alert(`タグ「${tagName}」は現在使用中のため削除できません。\n使用レシピ: ${recipeNames}${moreText}`);
        return;
      }
      
      // 削除前の存在確認
      const trimmedTagName = tagName.trim();
      console.log('削除前の検索:', trimmedTagName);
      
      const { data: preDeleteCheck, error: preError } = await sb.from('tags').select('*').eq('name', trimmedTagName);
      console.log('削除前の検索結果:', preDeleteCheck ? preDeleteCheck.length : 0, preDeleteCheck);
      
      if (preError) {
        console.error('削除前チェックエラー:', preError);
        alert('タグの確認中にエラーが発生しました。');
        return;
      }
      
      if (!preDeleteCheck || preDeleteCheck.length === 0) {
        console.log('削除対象のタグが見つかりません');
        alert('削除対象のタグが見つかりません。');
        return;
      }
      
      const targetTag = preDeleteCheck[0];
      console.log('削除対象を確認しました:', targetTag);
      
      // 確認ダイアログ
      if (!confirm(`タグ「${tagName}」を削除しますか？`)) {
        return;
      }
      
      // IDでの削除を試行
      let targetId = tagId || targetTag.id;
      console.log('IDでの削除を試行:', targetId);
      
      const { data: deleteResult, error: deleteError } = await sb
        .from('tags')
        .delete()
        .eq('id', targetId)
        .select();
      
      console.log('データベース削除結果:', deleteResult ? deleteResult.length : 0, deleteResult);
      
      if (deleteError) {
        console.error('削除エラー:', deleteError);
        alert('タグの削除に失敗しました: ' + deleteError.message);
        return;
      }
      
      if (!deleteResult || deleteResult.length === 0) {
        console.log('IDでの削除に失敗、全件検索で再試行');
        
        // 全件取得して名前で検索
        const { data: allTags, error: allError } = await sb.from('tags').select('*');
        if (allError) {
          console.error('全件取得エラー:', allError);
          alert('タグの削除に失敗しました。');
          return;
        }
        
        // 名前で検索（trim等も考慮）
        const foundTag = allTags.find(tag => 
          tag.name === tagName || 
          tag.name === trimmedTagName ||
          tag.name.trim() === trimmedTagName
        );
        
        if (foundTag) {
          console.log('名前検索で発見:', foundTag);
          const { data: retryResult, error: retryError } = await sb
            .from('tags')
            .delete()
            .eq('id', foundTag.id)
            .select();
          
          if (retryError || !retryResult || retryResult.length === 0) {
            console.error('再試行でも削除失敗:', retryError);
            alert('タグの削除に失敗しました。');
            return;
          }
          
          console.log('再試行で削除成功:', retryResult);
        } else {
          alert('削除対象のタグが見つかりませんでした。');
          return;
        }
      }
      
      // UI更新
      updateUIAfterTagDelete(tagName);
      
      // タグリストを再読み込み
      await loadTags();
      
      alert('タグを削除しました: ' + tagName);
      
    } catch (error) {
      console.error('タグ削除エラー:', error);
      alert('タグの削除中にエラーが発生しました: ' + error.message);
    }
  }

  // タグ削除後のUI更新
  function updateUIAfterTagDelete(tagName) {
    // 選択されていたタグを解除
    selectedTags = selectedTags.filter(tag => tag !== tagName);
    updateTagSelect();
    
    console.log('UI更新処理完了');
  }

  // 未使用タグの削除関数（レシピ削除時に呼び出される）
  async function cleanupUnusedTags(tagsToCheck) {
    if (!Array.isArray(tagsToCheck) || tagsToCheck.length === 0) {
      return;
    }
    
    try {
      console.log('未使用タグのクリーンアップを開始:', tagsToCheck);
      
      // 全レシピのタグを取得
      const { data: allRecipes, error: recipesError } = await sb
        .from('recipes')
        .select('tags')
        .not('tags', 'is', null);
      
      if (recipesError) {
        console.error('レシピ取得エラー:', recipesError);
        return;
      }
      
      // 使用されているタグを集計
      const usedTags = new Set();
      allRecipes.forEach(recipe => {
        if (Array.isArray(recipe.tags)) {
          recipe.tags.forEach(tag => usedTags.add(tag));
        }
      });
      
      // チェック対象のタグで使用されていないものを削除
      for (const tagName of tagsToCheck) {
        if (!usedTags.has(tagName)) {
          console.log('未使用タグを削除:', tagName);
          
          const { error: deleteError } = await sb
            .from('tags')
            .delete()
            .eq('name', tagName);
          
          if (deleteError) {
            console.error('タグ削除エラー:', tagName, deleteError);
          } else {
            console.log('未使用タグ削除成功:', tagName);
          }
        }
      }
      
    } catch (error) {
      console.error('未使用タグクリーンアップエラー:', error);
    }
  }

  // 読みやすいテキスト形式を生成する関数
  window.generateReadableText = function(recipeData, isOriginal = false) {
    let text = '';
    
    if (isOriginal && recipeData.original_title) {
      text += `${recipeData.original_title}\n\n`;
    } else {
      text += `${recipeData.title}\n\n`;
    }
    
    if (isOriginal && recipeData.original_description) {
      text += `${recipeData.original_description}\n\n`;
    } else if (recipeData.description) {
      text += `${recipeData.description}\n\n`;
    }
    
    if (recipeData.servings) {
      text += `人数: ${recipeData.servings}人分\n\n`;
    }
    
    if (isOriginal && recipeData.original_ingredients && recipeData.original_ingredients.length > 0) {
      text += `材料:\n`;
      recipeData.original_ingredients.forEach(ingredient => {
        text += `- ${ingredient.item}: ${ingredient.quantity}${ingredient.unit}\n`;
      });
      text += `\n`;
    } else if (recipeData.ingredients && recipeData.ingredients.length > 0) {
      text += `材料:\n`;
      recipeData.ingredients.forEach(ingredient => {
        text += `- ${ingredient.item}: ${ingredient.quantity}${ingredient.unit}\n`;
      });
      text += `\n`;
    }
    
    if (isOriginal && recipeData.original_steps && recipeData.original_steps.length > 0) {
      recipeData.original_steps.forEach((step, index) => {
        text += `ステップ${index + 1}:\n${step.step}\n\n`;
      });
    } else if (recipeData.steps && recipeData.steps.length > 0) {
      recipeData.steps.forEach((step, index) => {
        text += `ステップ${index + 1}:\n${step.step}\n\n`;
      });
    }
    
    if (recipeData.notes) {
      text += `メモ:\n${recipeData.notes}\n`;
    }
    
    return text;
  };

  // 未使用カテゴリーの削除関数（recipe_view.htmlと共通）
  window.cleanupUnusedCategory = async function(categoryName) {
    try {
      console.log('カテゴリー使用状況をチェック中:', categoryName);
      
      // 基本カテゴリーは削除しない
      const basicCategories = [
        'すべて', 'アミューズ', '前菜', 'ソース', 'スープ', 'パスタ', 
        '魚料理', '肉料理', 'メイン', 'デザート', 'パン', 'その他'
      ];
      
      if (basicCategories.includes(categoryName)) {
        console.log('基本カテゴリーなので削除をスキップ:', categoryName);
        return;
      }
      
      // 同じカテゴリーを使用している他のレシピがあるかチェック
      const { data: recipesWithCategory, error: checkError } = await sb
        .from('recipes')
        .select('id')
        .eq('category', categoryName);
      
      if (checkError) {
        console.error('カテゴリー使用状況チェックエラー:', checkError);
        return;
      }
      
      // 使用しているレシピが0件の場合、categoriesテーブルからも削除
      if (recipesWithCategory.length === 0) {
        console.log('未使用カテゴリーを削除中:', categoryName);
        
        const { error: deleteError } = await sb
          .from('categories')
          .delete()
          .eq('name', categoryName);
        
        if (deleteError) {
          console.error('カテゴリー削除エラー:', deleteError);
        } else {
          console.log('未使用カテゴリーを削除しました:', categoryName);
          
          // index.htmlに未使用カテゴリー削除の通知を送る
          localStorage.setItem('categoryDeleted', JSON.stringify({
            name: categoryName,
            timestamp: Date.now()
          }));
        }
      } else {
        console.log('カテゴリーは他のレシピで使用中:', categoryName, '使用数:', recipesWithCategory.length);
      }
      
    } catch (error) {
      console.error('カテゴリークリーンアップエラー:', error);
    }
  };

  // カスタムカテゴリーの手動削除関数
  async function deleteCustomCategory(categoryName) {
    try {
      console.log('カスタムカテゴリー削除を試行中:', categoryName);
      
      // 削除前にカテゴリーがデータベースに存在するかチェック
      const { data: existingCategory, error: existError } = await sb
        .from('categories')
        .select('*')
        .eq('name', categoryName)
        .single();
      
      if (existError && existError.code !== 'PGRST116') {
        console.error('カテゴリー存在確認エラー:', existError);
        alert('カテゴリーの存在確認に失敗しました: ' + existError.message);
        return;
      }
      
      if (!existingCategory) {
        console.warn('削除対象のカテゴリーがデータベースに存在しません:', categoryName);
        alert('このカテゴリーはすでに削除されています。');
        // 画面からは削除する
        const categoryElements = document.querySelectorAll('.custom-category');
        categoryElements.forEach(el => {
          const textSpan = el.querySelector('span');
          if (textSpan && textSpan.textContent === categoryName) {
            el.remove();
          }
        });
        return;
      }
      
      console.log('削除対象カテゴリーを確認:', existingCategory);

      // 削除確認
      if (!confirm(`カテゴリー「${categoryName}」を削除しますか？\n\n※このカテゴリーを使用しているレシピがある場合は削除できません。`)) {
        return;
      }
      
      // 使用状況をチェック
      const { data: recipesWithCategory, error: checkError } = await sb
        .from('recipes')
        .select('id, title')
        .eq('category', categoryName);
      
      if (checkError) {
        console.error('カテゴリー使用状況チェックエラー:', checkError);
        alert('カテゴリーの使用状況確認に失敗しました: ' + checkError.message);
        return;
      }
      
      // 使用中のレシピがある場合は削除を拒否
      if (recipesWithCategory && recipesWithCategory.length > 0) {
        const recipeList = recipesWithCategory.map(r => `・${r.title}`).join('\n');
        alert(`使用中のカテゴリーなので削除できません。\n\n【使用中のレシピ】\n${recipeList}\n\n先にこれらのレシピのカテゴリーを変更してから削除してください。`);
        return;
      }
      
      // カテゴリーをデータベースから削除
      console.log('データベースからカテゴリーを削除中:', categoryName);
      
      // より詳細な削除処理
      console.log('削除前のカテゴリー検索:', categoryName);
      
      // 削除前に再度存在確認（トリム処理を含む）
      const trimmedCategoryName = categoryName.trim();
      console.log('トリム後のカテゴリー名:', `"${trimmedCategoryName}"`);
      
      const { data: preDeleteCheck, error: preDeleteError } = await sb
        .from('categories')
        .select('*')
        .eq('name', trimmedCategoryName);
      
      console.log('削除前の検索結果:', preDeleteCheck);
      
      if (preDeleteError) {
        console.error('削除前検索エラー:', preDeleteError);
        throw preDeleteError;
      }
      
      if (!preDeleteCheck || preDeleteCheck.length === 0) {
        console.warn('名前での検索で削除対象が見つかりません。全カテゴリーをチェックします...');
        
        // 全カテゴリーを取得して比較
        const { data: allCategories, error: allError } = await sb
          .from('categories')
          .select('*');
          
        console.log('全カテゴリー一覧:', allCategories);
        
        if (allCategories) {
          const matchingCategory = allCategories.find(cat => 
            cat.name === categoryName || 
            cat.name === trimmedCategoryName ||
            cat.name.trim() === trimmedCategoryName
          );
          
          if (matchingCategory) {
            console.log('一致するカテゴリーを発見:', matchingCategory);
            // 見つかったカテゴリーを削除
            const { data: deleteData2, error: deleteError2 } = await sb
              .from('categories')
              .delete()
              .eq('id', matchingCategory.id)
              .select();
              
            if (deleteError2) {
              console.error('ID指定削除エラー:', deleteError2);
              alert('カテゴリーの削除に失敗しました: ' + deleteError2.message);
              return;
            }
            
            console.log('代替方法での削除成功:', deleteData2);
            alert(`カテゴリー「${categoryName}」を削除しました！`);
            
            // 画面更新処理をここに移動
            await updateUIAfterDelete(categoryName);
            return;
          }
        }
        
        console.warn('削除対象が見つかりません。すでに削除済みの可能性があります。');
        alert('カテゴリーが見つかりません。すでに削除済みかもしれません。');
        
        // 画面からは削除する
        await updateUIAfterDelete(categoryName);
        return;
      }
      
      console.log('削除対象を確認しました:', preDeleteCheck[0]);
      
      // 正確なIDでの削除を試行
      const targetId = preDeleteCheck[0].id;
      console.log('IDでの削除を試行:', targetId);
      
      const { data: deleteData, error: deleteError } = await sb
        .from('categories')
        .delete()
        .eq('id', targetId)
        .select();
      
      if (deleteError) {
        console.error('カテゴリー削除エラー:', deleteError);
        alert('カテゴリーの削除に失敗しました: ' + deleteError.message);
        return;
      }
      
      console.log('データベース削除結果:', deleteData);
      
      // 削除されたレコードがあるかチェック
      if (!deleteData || deleteData.length === 0) {
        console.warn('削除対象のカテゴリーがデータベースに見つかりませんでした:', categoryName);
        alert('カテゴリーが見つからないため削除できませんでした。すでに削除済みの可能性があります。');
        // 画面からは削除する
      } else {
        console.log('データベースから正常に削除されました:', deleteData);
      }
      
      console.log('カスタムカテゴリーを削除しました:', categoryName);
      alert(`カテゴリー「${categoryName}」を削除しました！`);
      
      // UI更新処理
      await updateUIAfterDelete(categoryName);
      
    } catch (error) {
      console.error('カスタムカテゴリー削除エラー:', error);
      alert('カテゴリーの削除中にエラーが発生しました: ' + error.message);
    }
  }

  // UI更新処理を共通関数として分離
  async function updateUIAfterDelete(categoryName) {
    console.log('UI更新処理を開始:', categoryName);
    
    // 即座に画面からカテゴリーを削除
    const categoryElements = document.querySelectorAll('.custom-category');
    categoryElements.forEach(el => {
      const textSpan = el.querySelector('span');
      if (textSpan && textSpan.textContent === categoryName) {
        el.remove();
        console.log('画面からカテゴリー要素を削除:', categoryName);
      }
    });
    
    // 選択されていたカテゴリーが削除された場合は選択をクリア
    const selectedEl = document.querySelector('.category-option.selected span');
    if (selectedEl && selectedEl.textContent === categoryName) {
      selectedCategories = [];
      document.getElementById('selectedCategoryText').textContent = 'カテゴリーを選択';
    }
    
    // カスタムカテゴリーグループが空になった場合は非表示
    const customCategoryOptionsEl = document.getElementById('custom-category-options');
    if (customCategoryOptionsEl && customCategoryOptionsEl.children.length === 0) {
      const customCategoryGroupEl = document.getElementById('custom-category-group');
      if (customCategoryGroupEl) {
        customCategoryGroupEl.style.display = 'none';
      }
    }
    
    // index.htmlにカテゴリー削除の通知を送る
    localStorage.setItem('categoryDeleted', JSON.stringify({
      name: categoryName,
      timestamp: Date.now()
    }));
    
    // 少し遅延してからカテゴリー一覧を再読み込み（確実な同期のため）
    setTimeout(async () => {
      await loadCategories();
    }, 100);
    
    console.log('UI更新処理完了:', categoryName);
  }

  // Category Modal buttons
  document.getElementById('category-ok-btn')?.addEventListener('click', () => {
    // selectedCategoriesは既にクリック時に更新されているので、そのまま使用
    console.log('OKボタン - 最終的な選択されたカテゴリ:', selectedCategories);
    updateCategorySelect();
    toggleModal('category-modal', false);
  });

  // カテゴリ削除ボタンのイベントハンドラー
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-category-btn')) {
      const categoryToRemove = e.target.getAttribute('data-category');
      selectedCategories = selectedCategories.filter(cat => cat !== categoryToRemove);
      updateCategorySelect();
    }
    
    // タグ削除ボタンのイベントハンドラー
    if (e.target.classList.contains('remove-tag-btn')) {
      const tagToRemove = e.target.getAttribute('data-tag');
      selectedTags = selectedTags.filter(tag => tag !== tagToRemove);
      updateTagSelect();
    }
  });

  document.getElementById('category-cancel-btn')?.addEventListener('click', () => {
    toggleModal('category-modal', false);
  });

  // 新しいカテゴリー追加ボタン
  document.getElementById('add-new-category-btn')?.addEventListener('click', async () => {
    const categoryName = prompt('新しいカテゴリー名を入力してください:');
    if (categoryName && categoryName.trim()) {
      await addNewCategory(categoryName.trim());
    }
  });

  // Tag Modal buttons  
  document.getElementById('tag-ok-btn')?.addEventListener('click', () => {
    // Handle tag selection
    const selectedTagElements = Array.from(document.querySelectorAll('#tag-options .selected'));
    selectedTags = selectedTagElements.map(el => el.textContent.trim());
    updateTagSelect(); // 統一された関数を使用
    console.log('選択されたタグ:', selectedTags);
    toggleModal('tag-modal', false);
  });

  document.getElementById('tag-cancel-btn')?.addEventListener('click', () => {
    toggleModal('tag-modal', false);
  });

  // 新規タグ追加ボタン
  document.getElementById('add-new-tag-btn')?.addEventListener('click', async () => {
    const tagName = prompt('新しいタグ名を入力してください:');
    if (tagName && tagName.trim()) {
      await addNewTag(tagName.trim());
    }
  });

  // AI Modal buttons
  document.getElementById('get-suggestions-btn')?.addEventListener('click', async () => {
    await generateMenuSuggestions();
  });

  // Example buttons for custom request - 複数選択対応
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('example-btn')) {
      const exampleText = e.target.dataset.example;
      const textarea = document.getElementById('ai-custom-request');
      if (textarea) {
        // 複数選択対応
        if (e.target.classList.contains('selected')) {
          // 既に選択されている場合は削除
          e.target.classList.remove('selected');
          const currentValue = textarea.value;
          const newValue = currentValue
            .split(', ')
            .filter(item => item.trim() !== exampleText.trim())
            .join(', ')
            .replace(/^,\s*|,\s*$/g, ''); // 先頭と末尾のカンマを削除
          textarea.value = newValue;
        } else {
          // 新しく選択する場合は追加
          e.target.classList.add('selected');
          const currentValue = textarea.value.trim();
          if (currentValue === '') {
            textarea.value = exampleText;
          } else {
            textarea.value = currentValue + ', ' + exampleText;
          }
        }
        
        // 視覚的フィードバック
        if (e.target.classList.contains('selected')) {
          e.target.style.background = '#3498db';
          e.target.style.borderColor = '#3498db';
        } else {
          e.target.style.background = '';
          e.target.style.borderColor = '';
        }
      }
    }
  });

  document.getElementById('generate-full-recipe-btn')?.addEventListener('click', async () => {
    await generateFullRecipe();
  });

  document.getElementById('apply-recipe-btn')?.addEventListener('click', async () => {
    await applyAIRecipeToForm();
    toggleModal('ai-modal', false);
  });

  // Modal close buttons
  document.getElementById('category-modal-close-btn')?.addEventListener('click', () => toggleModal('category-modal', false));
  document.getElementById('tag-modal-close-btn')?.addEventListener('click', () => toggleModal('tag-modal', false));
  document.getElementById('modal-close-btn')?.addEventListener('click', () => toggleModal('ai-modal', false));

  // Category and Tag selection clicks
  document.addEventListener('click', (e) => {
    // Category selection
    if (e.target.classList.contains('category-option')) {
      document.querySelectorAll('.category-option').forEach(el => el.classList.remove('selected'));
      e.target.classList.add('selected');
    }
    
    // Tag selection (multiple selection)
    if (e.target.classList.contains('tag-option')) {
      console.log('タグクリック検出:', e.target.textContent);
      e.target.classList.toggle('selected');
      console.log('選択状態:', e.target.classList.contains('selected'));
    }

    // Tag delete button
    if (e.target.classList.contains('tag-delete-btn')) {
      e.stopPropagation(); // タグ選択を防ぐ
      const tagId = e.target.getAttribute('data-tag-id');
      const tagName = e.target.getAttribute('data-tag-name');
      console.log('タグ削除ボタンクリック:', { tagId, tagName });
      deleteCustomTag(tagId, tagName);
    }
    
    // Genre selection in AI modal
    if (e.target.classList.contains('genre-btn')) {
      document.querySelectorAll('.genre-btn').forEach(btn => btn.classList.remove('selected'));
      e.target.classList.add('selected');
      document.getElementById('get-suggestions-btn').disabled = false;
    }
  });
};

// Recipe Save Function
const saveRecipeToDatabase = async () => {
  try {
    console.log('=== レシピ保存開始 ===');
    console.log('保存前のselectedCategories:', selectedCategories);
    
    const params = new URLSearchParams(window.location.search);
    const recipeId = params.get('id');
    
    const title = document.getElementById('title')?.value?.trim();
    if (!title) return alert('料理名を入力してください。');
    
    // Debug: Log ingredient rows found
    const ingredientRows = document.querySelectorAll('.ingredient-row');
    console.log('Found ingredient rows:', ingredientRows.length);
    
    const ingredients = Array.from(ingredientRows).map((row, index) => {
      const item = row.querySelector('.ingredient-item')?.value?.trim();
      const quantityRaw = row.querySelector('.ingredient-quantity')?.value?.trim();
      const unit = row.querySelector('.ingredient-unit')?.value?.trim();
      const price = row.querySelector('.ingredient-price')?.value?.trim();
      const quantity = quantityRaw !== '' ? quantityRaw : null; // quantity は text 型

      console.log(`🥕 Ingredient ${index + 1}:`, {
        item,
        quantity,
        unit,
        price,
        hasItem: !!item,
        itemLength: item ? item.length : 0,
        row: row
      });

      const ingredientData = item ? {
        position: index + 1,
        item,
        quantity,
        unit: unit || null,
        price: price ? parseFloat(price) : null
      } : null;

      console.log(`📝 Ingredient data ${index + 1}:`, ingredientData);
      return ingredientData;
    }).filter(ingredient => {
      const isValid = ingredient !== null;
      console.log(`✅ Ingredient filter result:`, isValid, ingredient);
      return isValid;
    });

    console.log('🥕 Final ingredients array:', ingredients.length, ingredients);
    
    // Debug: Log step rows found
    const stepRows = document.querySelectorAll('.step-row');
    console.log('Found step rows:', stepRows.length);

    const steps = [];
    stepRows.forEach((row, index) => {
      const textArea = row.querySelector('.step-text');
      const instruction = textArea?.value?.trim();
      console.log(`🍳 Processing step ${index + 1}:`, {
        instruction,
        element: row,
        textArea: textArea,
        hasValue: !!instruction,
        valueLength: instruction ? instruction.length : 0,
        textAreaExists: !!textArea
      });

      // 空でない手順のみ追加
      if (instruction && instruction.length > 0) {
        const stepData = {
          step_number: index + 1,
          position: index + 1,
          instruction: instruction
        };
        console.log(`✅ Adding step ${index + 1}:`, stepData);
        steps.push(stepData);
      } else {
        console.log(`❌ Skipping empty step ${index + 1}:`, {
          hasInstruction: !!instruction,
          instructionLength: instruction ? instruction.length : 0,
          textAreaValue: textArea ? textArea.value : 'no textarea'
        });
      }
    });

    console.log('🍳 Final steps array:', steps.length, steps);

    console.log('Collected steps:', steps);

    // 手順が空の場合の緊急チェック
    if (steps.length === 0) {
      console.warn('⚠️ 手順データが空です。手順フィールドを再チェックします...');

      // 異なるセレクターで再試行
      const alternativeStepElements = [
        '#stepsEditor .step-text',
        '#stepsEditor textarea',
        '.step-row textarea',
        '[class*="step"] textarea'
      ];

      for (const selector of alternativeStepElements) {
        const elements = document.querySelectorAll(selector);
        console.log(`Checking selector "${selector}": found ${elements.length} elements`);

        elements.forEach((element, index) => {
          const value = element.value?.trim();
          if (value) {
            console.log(`Found step content in ${selector}[${index}]:`, value);
            steps.push({
              step_number: index + 1,
              position: index + 1,
              instruction: value
            });
          }
        });

        if (steps.length > 0) {
          console.log(`✅ 手順データを発見: ${steps.length}個`);
          break;
        }
      }
    }

    console.log('Final ingredients:', ingredients);
    console.log('Final steps:', steps);

    // 翻訳レシピかどうかをチェック
    const hasTranslations = document.querySelectorAll('.translation-row').length > 0;
    console.log('Is translation recipe:', hasTranslations);
    let translationData = [];
    if (hasTranslations) {
      console.log('このレシピは翻訳データを含んでいます');
      translationData = await getTranslationData();
      console.log('Translation data with steps:', translationData);

      // 翻訳レシピの場合、既存のカテゴリに「翻訳」を追加
      console.log('翻訳処理前のselectedCategories:', selectedCategories);
      if (!selectedCategories.includes('翻訳')) {
        selectedCategories.push('翻訳');
        console.log('✅ 翻訳レシピのカテゴリーに「翻訳」を追加しました');
        console.log('現在の選択されたカテゴリ:', selectedCategories);
      } else {
        console.log('✅ 「翻訳」カテゴリは既に選択されています');
      }

      // UIにも反映
      updateCategorySelect();
    }
    
    // 編集時の元のカテゴリーとタグを記録（未使用削除用）
    let originalCategory = null;
    let originalTags = [];
    if (recipeId) {
      try {
        const { data: existingRecipe } = await sb.from('recipes').select('category, tags').eq('id', recipeId).single();
        originalCategory = existingRecipe?.category;
        originalTags = Array.isArray(existingRecipe?.tags) ? existingRecipe.tags : [];
      } catch (e) {
        console.log('元のデータ取得をスキップ:', e.message);
      }
    }
    
    console.log('=== 保存前の状態確認 ===');
    console.log('selectedCategories:', selectedCategories);
    console.log('selectedCategories.length:', selectedCategories.length);
    console.log('selectedCategories.join結果:', selectedCategories.join(', '));
    
    // selectedCategoriesの配列の整合性をチェック
    if (!Array.isArray(selectedCategories)) {
      console.warn('⚠️ selectedCategoriesが配列ではありません。初期化します。');
      selectedCategories = [];
    }
    
    // 配列の長さが異常な場合は修正
    if (selectedCategories.length < 0) {
      console.warn('⚠️ selectedCategoriesの長さが異常です。修正します。');
      console.warn('⚠️ 異常な配列の内容:', selectedCategories);
      selectedCategories = [];
    }
    
    // 配列の内容を検証
    selectedCategories = selectedCategories.filter(item => 
      item !== null && item !== undefined && typeof item === 'string' && item.trim() !== ''
    );
    
    // 読みやすいテキスト形式を生成（AI解析結果から取得または動的生成）
    let readableText = null;
    
    // AI解析結果にreadable_textが含まれている場合はそれを使用
    if (window.currentRecipeData && window.currentRecipeData.readable_text) {
      readableText = window.currentRecipeData.readable_text;
      console.log('📝 AI解析結果から読みやすいテキストを取得:', readableText);
    } else {
      // 動的に生成
      const readableTextData = {
        title,
        description: document.getElementById('description')?.value?.trim() || null,
        servings: document.getElementById('servings')?.value?.trim() || null,
        ingredients: ingredients,
        steps: steps,
        notes: document.getElementById('notes')?.value?.trim() || null
      };
      
      readableText = window.generateReadableText(readableTextData);
      console.log('📝 動的に生成された読みやすいテキスト:', readableText);
    }
    
    const recipeData = {
      title,
      category: selectedCategories.length > 0 ? selectedCategories.join(', ') : null,
      tags: selectedTags.length > 0 ? selectedTags : null,
      notes: document.getElementById('notes')?.value?.trim() || null,
      image_url: window.currentImageData || null,
      source_url: currentSourceUrl || null,
      is_ai_generated: false, // 通常のレシピはfalse
      is_groq_generated: window.isGroqGenerated || false, // URL取り込み時はtrue
      original_recipe_data: originalRecipeData ? JSON.stringify(originalRecipeData) : null, // 海外サイト取り込み時の翻訳前データ（JSON文字列として保存）
      readable_text: readableText // 読みやすいテキスト形式
    };
    
    console.log('=== レシピ保存データ ===');
    console.log('Recipe data:', recipeData);
    console.log('Current source URL:', currentSourceUrl);
    console.log('Ingredients count:', ingredients.length);
    console.log('Steps count:', steps.length);
    console.log('Original recipe data:', originalRecipeData);
    console.log('Original recipe data (JSON):', originalRecipeData ? JSON.stringify(originalRecipeData) : null);
    
    if (document.getElementById('servings')?.value) {
      recipeData.servings = parseInt(document.getElementById('servings').value);
    }
    
    let result;
    if (recipeId) {
      result = await sb.from('recipes').update(recipeData).eq('id', recipeId).select('id').single();
    } else {
      result = await sb.from('recipes').insert(recipeData).select('id').single();
    }
    
    if (result.error) {
      console.error('レシピ保存エラー:', result.error);
      throw new Error(`レシピ保存に失敗しました: ${result.error.message}`);
    }
    
    const savedId = result.data.id;
    console.log('レシピ保存成功. ID:', savedId);

    // まず材料・手順を保存（翻訳処理の前に確実に保存）
    console.log('🔄 材料・手順の保存を開始...');
    await saveIngredientsAndSteps(savedId, ingredients, steps);
    console.log('✅ 材料・手順の保存完了');

    // 翻訳情報を保存（テーブルが存在しない場合はスキップ）
    // 翻訳データは既に取得済みなので、hasTranslationsで判定
    const translations = hasTranslations ? translationData : [];
    console.log('保存用翻訳データ:', translations);
    
    // 翻訳データの検証
    if (translations.length > 0) {
      const validTranslations = translations.filter(translation => 
        translation.language_code && translation.translated_title
      );
      
      if (validTranslations.length !== translations.length) {
        console.warn('⚠️ 無効な翻訳データを除外しました:', {
          original: translations.length,
          valid: validTranslations.length
        });
      }
      
      // 有効な翻訳データのみを使用
      translations.length = 0;
      translations.push(...validTranslations);
    }
    
    // 翻訳が削除された場合、既存の翻訳をクリア
    if (window.translationDeleted || translations.length === 0) {
      try {
        console.log('翻訳データをクリア中...');
        await sb.from('recipe_translations').delete().eq('recipe_id', savedId);
        console.log('翻訳データをクリアしました');
        window.translationDeleted = false; // フラグをリセット
      } catch (clearError) {
        console.error('翻訳クリアエラー:', clearError);
      }
    }
    
    if (translations.length > 0) {
      try {
        console.log('翻訳データを保存開始...');
        // 既存の翻訳を削除
        const deleteResult = await sb.from('recipe_translations').delete().eq('recipe_id', savedId);
        console.log('既存翻訳削除結果:', deleteResult);
        
        // 新しい翻訳を挿入
        const translationData = translations.map(translation => ({
          recipe_id: savedId,
          language_code: translation.language_code,
          translated_title: translation.translated_title,
          html_content: translation.html_content
        }));

        // 翻訳の材料・手順データも保存
        for (const translation of translations) {
          if (translation.translated_ingredients && translation.translated_ingredients.length > 0) {
            console.log(`Saving translated ingredients for ${translation.language_code}:`, translation.translated_ingredients);
            // 将来的に翻訳材料テーブルに保存する場合はここに実装
          }

          if (translation.translated_steps && translation.translated_steps.length > 0) {
            console.log(`Saving translated steps for ${translation.language_code}:`, translation.translated_steps);
            // 将来的に翻訳手順テーブルに保存する場合はここに実装
          }
        }
        
        console.log('挿入する翻訳データ:', translationData);
        
        // 重複チェックとUPSERT処理
        for (const translation of translationData) {
          try {
            // 既存の翻訳データをチェック
            const { data: existingData, error: checkError } = await sb
              .from('recipe_translations')
              .select('id')
              .eq('recipe_id', translation.recipe_id)
              .eq('language_code', translation.language_code)
              .single();
            
            if (checkError && checkError.code !== 'PGRST116') {
              console.error('翻訳データチェックエラー:', checkError);
              continue;
            }
            
            if (existingData) {
              // 既存データを更新
              console.log(`翻訳データを更新: recipe_id=${translation.recipe_id}, language_code=${translation.language_code}`);
              const { data: updateData, error: updateError } = await sb
                .from('recipe_translations')
                .update(translation)
                .eq('recipe_id', translation.recipe_id)
                .eq('language_code', translation.language_code);
              
              if (updateError) {
                console.error('翻訳更新エラー:', updateError);
          } else {
                console.log('翻訳更新成功:', updateData);
          }
        } else {
              // 新規挿入
              console.log(`翻訳データを新規挿入: recipe_id=${translation.recipe_id}, language_code=${translation.language_code}`);
              const { data: insertData, error: insertError } = await sb
                .from('recipe_translations')
                .insert(translation);
              
              if (insertError) {
                console.error('翻訳挿入エラー:', insertError);
              } else {
                console.log('翻訳挿入成功:', insertData);
              }
            }
          } catch (error) {
            console.error('翻訳処理エラー:', error);
          }
        }
      } catch (translationError) {
        console.error('翻訳保存処理エラー:', translationError);
        // 翻訳保存エラーは警告として表示し、メインの保存処理は継続
        console.warn('⚠️ 翻訳保存に失敗しましたが、レシピの保存は継続します');
        alert(`翻訳保存に失敗しました: ${translationError.message}\nレシピの保存は継続されます。`);
      }
    } else if (currentTranslatedName && currentLanguageCode) {
      // AI生成時の翻訳情報を保存（後方互換性）
      try {
        const translationData = {
          recipe_id: savedId,
          language_code: currentLanguageCode,
          translated_title: currentTranslatedName
        };
        
        await sb.from('recipe_translations').delete().eq('recipe_id', savedId).eq('language_code', currentLanguageCode);
        const { error: translationError } = await sb.from('recipe_translations').insert(translationData);
        
        if (translationError) {
          console.error('翻訳保存エラー:', translationError);
        } else {
          console.log('翻訳保存成功:', translationData);
        }
      } catch (translationError) {
        console.error('翻訳保存処理エラー:', translationError);
      }
    }
    
    // この部分は既に saveIngredientsAndSteps 関数で処理済み
    
    // カテゴリーが変更された場合、元のカテゴリーの使用状況をチェック
    if (originalCategory && originalCategory !== selectedCategories.join(', ')) {
      try {
        await window.cleanupUnusedCategory(originalCategory);
      } catch (cleanupError) {
        console.error('カテゴリークリーンアップエラー:', cleanupError);
      }
    }
    
    // タグが変更された場合、元のタグの使用状況をチェック
    if (originalTags.length > 0) {
      const removedTags = originalTags.filter(tag => !selectedTags.includes(tag));
      if (removedTags.length > 0) {
        try {
          await cleanupUnusedTags(removedTags);
        } catch (cleanupError) {
          console.error('タグクリーンアップエラー:', cleanupError);
        }
      }
    }

    alert('レシピを保存しました！');
    window.location.href = `recipe_view.html?id=${encodeURIComponent(savedId)}`;
    
  } catch (error) {
    alert('保存に失敗しました: ' + (error.message || error));
  }
};

// AI Recipe Generation
const generateRecipeSuggestions = async (genre, customRequest = '') => {
  const ingredients = Array.from(document.querySelectorAll('.ingredient-item'))
    .map(input => input.value.trim())
    .filter(Boolean);
  
  let prompt = `${genre}料理のメニューを5つ提案してください。`;
  if (ingredients.length > 0) {
    prompt += `\n主材料: ${ingredients.join('、')}`;
  }
  if (customRequest) {
    prompt += `\n追加要望: ${customRequest}`;
  }
  
  prompt += `\n必ず以下のJSON形式で返してください：
{"suggestions": [{"name": "メニュー名1", "intent": "メニューの意図1"}, {"name": "メニュー名2", "intent": "メニューの意図2"}]}`;
  
  const result = await callAIAPI(text, '');
  return result;
};


// Initialize App
const initializeApp = () => {
  console.log('Starting initializeApp...');
  if (typeof supabase === 'undefined') {
    console.error('Supabase not loaded');
    return;
  }
  console.log('Supabase loaded successfully');
  
  // Initialize Supabase (avoid multiple GoTrueClient by reusing global and unique storageKey)
  if (!window.sb) {
    window.sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
      auth: {
        storageKey: 'app-main-11-edit',
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    });
  }
  sb = window.sb;

  if (typeof window.setupApiUsageHooks === 'function') {
    try {
      window.setupApiUsageHooks();
    } catch (hookError) {
      console.warn('⚠️ API使用状況フックの設定に失敗しました:', hookError);
    }
  }

  // Setup event listeners
  console.log('🔍 setupModalEventsを呼び出します');
  setupModalEvents();
  console.log('✅ setupModalEventsの呼び出し完了');
  
  document.getElementById('addIng')?.addEventListener('click', () => addIngredientRow());
  document.getElementById('addStep')?.addEventListener('click', () => addStepRow());
  document.getElementById('addTranslationBtn')?.addEventListener('click', () => addTranslationRow());
  
  // 翻訳行を初期化時に自動追加
  setTimeout(() => {
    console.log('🔍 初期化時に翻訳行を追加します');
    addTranslationRow();
    addTranslationPreviewButton();
  }, 100);

  // 参考URLフィールドの横のURL取り込みボタンのイベントリスナーを追加
  const urlImportFromFieldBtn = document.getElementById('urlImportFromFieldBtn');
  console.log('🔍 参考URLフィールドのURL取り込みボタンを検索:', urlImportFromFieldBtn);
  
  if (urlImportFromFieldBtn) {
    console.log('✅ 参考URLフィールドのURL取り込みボタンが見つかりました');
    urlImportFromFieldBtn.addEventListener('click', async () => {
      const url = document.getElementById('sourceUrl')?.value?.trim();
      if (!url) {
        alert('URLを入力してください');
        return;
      }
      
      console.log('🔍 参考URLフィールドのURL取り込みボタンがクリックされました:', url);
      
      // API選択ポップアップを表示
      showApiSelectionModal(url);
    });
    console.log('✅ 参考URLフィールドのURL取り込みボタンのイベントリスナーを設定しました');
  } else {
    console.error('❌ 参考URLフィールドのURL取り込みボタンが見つかりません');
    console.error('❌ 利用可能なボタン:', document.querySelectorAll('button[id*="url"]'));
  }

  
  document.querySelector('.js-save')?.addEventListener('click', saveRecipeToDatabase);
  
  // AI創作完了ボタンのイベントリスナー
  document.querySelector('.js-ai-save-options')?.addEventListener('click', () => {
    showAISaveOptions();
  });

  // AI保存選択モーダルのイベントリスナー
  document.getElementById('ai-save-overwrite')?.addEventListener('click', () => {
    const modal = document.getElementById('ai-save-options-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    saveAndReturnToIndex('overwrite');
  });

  document.getElementById('ai-save-new')?.addEventListener('click', () => {
    const modal = document.getElementById('ai-save-options-modal');
    if (modal) {
      modal.style.display = 'none';
    }
    saveAndReturnToIndex('new');
  });

  // モーダル外クリックで閉じる
  document.getElementById('ai-save-options-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'ai-save-options-modal') {
      const modal = document.getElementById('ai-save-options-modal');
      if (modal) {
        modal.style.display = 'none';
      }
    }
  });

  
  
  // Form delegation for remove buttons
  document.querySelector('form')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('js-remove-row')) {
      const row = e.target.closest('.ingredient-row, .step-row');
      if (row) {
        row.remove();
      }
    }
  });
  
  // Load existing recipe or add empty rows
  const params = new URLSearchParams(window.location.search);
  const recipeId = params.get('id');
  
  if (recipeId) {
    loadExistingRecipeData(recipeId);
  } else {
    // If opened with AI-generated new recipe, apply it
    try {
      const params = new URLSearchParams(window.location.search);
      const newRecipeParam = params.get('newRecipe');
      let incoming = null;
      if (newRecipeParam) {
        // URLSearchParams.get は既にデコード済み文字列を返す
        incoming = JSON.parse(newRecipeParam);
      } else if (localStorage.getItem('ai_generated_recipe')) {
        incoming = JSON.parse(localStorage.getItem('ai_generated_recipe'));
        // keep for later sessions? remove to avoid confusion
        localStorage.removeItem('ai_generated_recipe');
      }

      if (incoming) {
        const recipeObj = incoming.recipe || incoming; // support {recipe: {...}}
        window.aiGeneratedRecipe = recipeObj;
        aiGeneratedRecipe = recipeObj;
        // 非同期だが待たずに適用開始（initializeApp は async ではないため）
        applyAIRecipeToForm();
      } else {
        addIngredientRow();
        addStepRow();
      }
    } catch (e) {
      console.error('Failed to apply incoming AI recipe:', e);
      addIngredientRow();
      addStepRow();
    }
    // show inline image preview if already selected via upload
    try {
      const inlineContainer = document.getElementById('inlineRecipeImageContainer');
      const imgEl = document.getElementById('inlineRecipeImageImg');
      const noImagePlaceholder = document.getElementById('noImagePlaceholder');
      const deleteBtn = document.getElementById('deleteInlineImageBtn');
      
      if (imgEl && window.currentImageData) {
        imgEl.src = window.currentImageData;
        imgEl.style.display = 'block';
        if (noImagePlaceholder) noImagePlaceholder.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'flex';
      } else {
        if (imgEl) imgEl.style.display = 'none';
        if (noImagePlaceholder) noImagePlaceholder.style.display = 'flex';
        if (deleteBtn) deleteBtn.style.display = 'none';
      }
      if (inlineContainer) {
        inlineContainer.style.display = 'inline-block';
      }
    } catch (e) {}
  }
};

// Load existing recipe
const loadExistingRecipeData = async (id) => {
  try {
    const { data: recipe, error } = await sb.from('recipes').select('*').eq('id', id).single();
    if (error) throw error;
    
    document.getElementById('title').value = recipe.title || '';
    
    // 既存の選択されたカテゴリを保持しつつ、レシピのカテゴリを読み込み
    const existingSelectedCategories = [...selectedCategories];
    
    // レシピのカテゴリを分割（タグと同じ処理）
    let recipeCategories = [];
    if (recipe.category) {
      if (typeof recipe.category === 'string') {
        // カンマ区切りで分割
        recipeCategories = recipe.category.split(',').map(cat => cat.trim()).filter(cat => cat.length > 0);
      } else if (Array.isArray(recipe.category)) {
        // 既に配列の場合はそのまま使用
        recipeCategories = recipe.category;
      }
    }
    
    // 既存の選択とレシピのカテゴリをマージ（重複を避ける）
    const mergedCategories = [...new Set([...existingSelectedCategories, ...recipeCategories])];
    selectedCategories = mergedCategories;
    
    console.log('レシピ読み込み時のカテゴリ処理:');
    console.log('- 元のレシピカテゴリ:', recipe.category);
    console.log('- 元のレシピカテゴリの型:', typeof recipe.category);
    console.log('- 既存の選択:', existingSelectedCategories);
    console.log('- レシピのカテゴリ（分割後）:', recipeCategories);
    console.log('- レシピのカテゴリ（分割後）の長さ:', recipeCategories.length);
    console.log('- マージ後:', selectedCategories);
    console.log('- マージ後の長さ:', selectedCategories.length);
    
    selectedTags = Array.isArray(recipe.tags) ? recipe.tags : [];
    currentSourceUrl = recipe.source_url || null; // 既存レシピのsource_urlを読み込み
    
    // 翻訳前データを復元（海外サイトから取り込んだ場合）
    if (recipe.original_recipe_data) {
      try {
        // JSON文字列として保存されている場合はパース
        if (typeof recipe.original_recipe_data === 'string') {
          originalRecipeData = JSON.parse(recipe.original_recipe_data);
        } else {
          // 既にオブジェクトの場合はそのまま使用
          originalRecipeData = recipe.original_recipe_data;
        }
        console.log('🌍 翻訳前データを復元:', originalRecipeData);
      } catch (error) {
        console.error('❌ 翻訳前データの復元に失敗:', error);
        originalRecipeData = null;
      }
    }

    // カテゴリとタグのUIを更新
    updateCategorySelect();
    updateTagSelect();
    
    // Groq API使用フラグをリセット
    window.isGroqGenerated = false;
    
    if (recipe.servings !== undefined) {
      document.getElementById('servings').value = recipe.servings || '';
    }
    document.getElementById('notes').value = recipe.notes || '';
    
    // source_urlフィールドに表示
    const sourceUrlEl = document.getElementById('sourceUrl');
    if (sourceUrlEl) {
      sourceUrlEl.value = recipe.source_url || '';
    }
    
    // 翻訳データを読み込み
    try {
      const { data: translations, error: translationError } = await sb
        .from('recipe_translations')
        .select('language_code, translated_title')
        .eq('recipe_id', id);
      
      if (!translationError && translations && translations.length > 0) {
        // 翻訳テーブルをクリア
        const tbody = document.getElementById('translationTableBody');
        if (tbody) {
          tbody.innerHTML = '';
        }
        
        // 翻訳行を追加
        translations.forEach(translation => {
          addTranslationRow(translation.language_code, translation.translated_title);
        });
      }
    } catch (translationError) {
      console.log('翻訳読み込みをスキップ:', translationError.message);
    }
    // Inline image preview if available
    if (recipe.image_url) {
      window.currentImageData = recipe.image_url;
      const inlineContainer = document.getElementById('inlineRecipeImageContainer');
      const imgEl = document.getElementById('inlineRecipeImageImg');
      const noImagePlaceholder = document.getElementById('noImagePlaceholder');
      const deleteBtn = document.getElementById('deleteInlineImageBtn');
      
      if (imgEl) {
        imgEl.src = recipe.image_url;
        imgEl.style.display = 'block';
      }
      if (noImagePlaceholder) {
        noImagePlaceholder.style.display = 'none';
      }
      if (deleteBtn) {
        deleteBtn.style.display = 'flex';
      }
      if (inlineContainer) {
        inlineContainer.style.display = 'inline-block';
      }
    } else {
      // No image case
      const inlineContainer = document.getElementById('inlineRecipeImageContainer');
      const imgEl = document.getElementById('inlineRecipeImageImg');
      const noImagePlaceholder = document.getElementById('noImagePlaceholder');
      const deleteBtn = document.getElementById('deleteInlineImageBtn');
      
      if (imgEl) imgEl.style.display = 'none';
      if (noImagePlaceholder) noImagePlaceholder.style.display = 'flex';
      if (deleteBtn) deleteBtn.style.display = 'none';
      if (inlineContainer) inlineContainer.style.display = 'inline-block';
    }
    
    // Load ingredients
    const { data: ingredients } = await sb.from('recipe_ingredients').select('*').eq('recipe_id', id).order('position');
    document.getElementById('ingredientsEditor').innerHTML = '';
    if (ingredients?.length > 0) {
      ingredients.forEach(ing => addIngredientRow(ing));
    } else {
      addIngredientRow();
    }
    
    // Load steps
    const { data: steps } = await sb.from('recipe_steps').select('*').eq('recipe_id', id).order('position');
    document.getElementById('stepsEditor').innerHTML = '';
    if (steps?.length > 0) {
      steps.forEach(step => addStepRow({ instruction: step.instruction || '' }));
    } else {
      addStepRow();
    }
  } catch (error) {
    addIngredientRow();
    addStepRow();
  }
};

// Adjust ingredient quantities based on servings
const adjustIngredientQuantities = (newServings) => {
  const currentServings = document.getElementById('servings')?.value || baseServings || 2;
  const ratio = newServings / currentServings;
  
  document.querySelectorAll('.ingredient-row .ingredient-quantity').forEach(qtyInput => {
    const currentQty = parseFloat(qtyInput.value);
    if (!isNaN(currentQty)) {
      qtyInput.value = (currentQty * ratio).toFixed(2).replace(/\.?0+$/, '');
    }
  });
  
  document.getElementById('servings').value = newServings;
  baseServings = newServings;
};

// AI Recipe Generation Functions
let selectedGenre = '';
let currentTranslatedName = '';
let currentLanguageCode = '';
let aiGeneratedRecipe = null;
window.aiGeneratedRecipe = null;

// Translation Management
function buildCurrentRecipeData() {
  const title = document.getElementById('title')?.value?.trim() || '';
  const description = document.getElementById('notes')?.value?.trim() || '';
  const servings = document.getElementById('servings')?.value?.trim() || '';

  const ingredients = Array.from(document.querySelectorAll('.ingredient-row')).map((row, index) => {
    const item = row.querySelector('.ingredient-item')?.value?.trim() || '';
    const quantity = row.querySelector('.ingredient-quantity')?.value?.trim() || '';
    const unit = row.querySelector('.ingredient-unit')?.value?.trim() || '';
    const price = row.querySelector('.ingredient-price')?.value?.trim() || '';
    return { item, quantity, unit, price, position: index + 1 };
  }).filter(ing => ing.item || ing.quantity || ing.unit || ing.price);

  const steps = Array.from(document.querySelectorAll('.step-row .step-text'))
    .map((textarea, index) => {
      const instruction = textarea.value?.trim();
      return instruction ? { step_number: index + 1, position: index + 1, instruction } : null;
    })
    .filter(Boolean);

  return {
    title,
    description,
    servings,
    ingredients,
    steps
  };
}

const languageOptions = [
  { code: 'fr', name: 'フランス語' },
  { code: 'it', name: 'イタリア語' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中国語' },
  { code: 'es', name: 'スペイン語' },
  { code: 'de', name: 'ドイツ語' },
  { code: 'en', name: '英語' }
];

// 翻訳行を追加する関数
const addTranslationRow = (languageCode = '', translatedTitle = '') => {
  console.log('🔍 翻訳行追加開始:', { languageCode, translatedTitle });
  
  const tbody = document.getElementById('translationTableBody');
  if (!tbody) {
    console.error('❌ 翻訳テーブルボディが見つかりません');
    return;
  }
  
  console.log('✅ 翻訳テーブルボディを発見:', tbody);
  
  // 最大1つまで制限（初期状態では1つ追加される）
  const existingRows = document.querySelectorAll('.translation-row');
  console.log('📊 既存の翻訳行数:', existingRows.length);
  
  if (existingRows.length >= 1) {
    console.log('⚠️ 翻訳行は既に1つ存在するため、追加をスキップします');
    return; // アラートを表示せずにスキップ
  }
  
  const row = document.createElement('tr');
  row.className = 'translation-row';
  
  // 1つの翻訳のみなので、すべての言語選択肢を表示
  const availableLanguages = languageOptions;
  
  row.innerHTML = `
    <td style="padding: 0.5rem; border-bottom: 1px solid var(--border-medium);">
      <select class="translation-language" style="width: 100%; padding: 0.25rem; border: 1px solid var(--border-medium); border-radius: 3px; font-size: 0.85em; background: var(--bg-secondary); color: var(--text-primary);">
        <option value="">言語を選択</option>
        ${availableLanguages.map(lang => 
          `<option value="${lang.code}" ${lang.code === languageCode ? 'selected' : ''}>${lang.name}</option>`
        ).join('')}
      </select>
    </td>
    <td style="padding: 0.5rem; border-bottom: 1px solid var(--border-medium);">
      <input type="text" class="translation-title" placeholder="翻訳名を入力" 
             value="${translatedTitle}" 
             style="width: 100%; padding: 0.25rem; border: 1px solid var(--border-medium); border-radius: 3px; font-size: 0.85em; background: var(--bg-secondary); color: var(--text-primary);">
    </td>
    <td style="padding: 0.5rem; border-bottom: 1px solid var(--border-medium); text-align: center;">
      <button type="button" class="remove-translation-btn" style="background: #dc3545; color: white; border: none; border-radius: 3px; padding: 0.25rem 0.5rem; font-size: 0.75em; cursor: pointer;">
        <i class="fas fa-times"></i>
      </button>
    </td>
  `;
  
  // 言語選択時の自動翻訳機能
  const languageSelect = row.querySelector('.translation-language');
  const titleInput = row.querySelector('.translation-title');
  
  languageSelect.addEventListener('change', async (e) => {
    const selectedLanguage = e.target.value;
    if (selectedLanguage && selectedLanguage !== '') {
      const recipeTitle = document.getElementById('title').value;
      if (recipeTitle.trim()) {
        try {
          // 翻訳中表示
          titleInput.value = '翻訳中...';
          titleInput.disabled = true;
          
          // 直接Groq APIを呼び出し
          const languageNames = {
            'fr': 'フランス語',
            'it': 'イタリア語', 
            'ja': '日本語',
            'zh': '中国語',
            'es': 'スペイン語',
            'de': 'ドイツ語',
            'en': '英語'
          };
          const languageNamesEn = {
            'fr': 'French',
            'it': 'Italian',
            'ja': 'Japanese',
            'zh': 'Chinese',
            'es': 'Spanish',
            'de': 'German',
            'en': 'English'
          };
          
          const languageName = languageNames[selectedLanguage] || selectedLanguage;
          const languageNameEn = languageNamesEn[selectedLanguage] || selectedLanguage;
          const prompt = `以下の料理名を${languageName}に翻訳してください。料理名として自然で適切な翻訳を提供してください。

料理名: ${recipeTitle}

翻訳のみを返してください。説明や追加のテキストは不要です。`;

          // Supabaseクライアントの状態確認
          if (!sb) {
            console.error('❌ Supabaseクライアントが初期化されていません');
            titleInput.value = '';
            alert('Supabaseクライアントが初期化されていません。ページを再読み込みしてください。');
            return;
          }
          
          // 認証状態の確認（オプション - Edge Functionsが認証を必要とする場合）
          try {
            const { data: session } = await sb.auth.getSession();
            console.log('🔍 認証状態:', session?.session ? 'ログイン済み' : '未ログイン');
          } catch (authError) {
            console.warn('⚠️ 認証状態確認エラー:', authError);
          }

          console.log('🔄 翻訳API呼び出し開始:', {
            mode: 'recipe_translation',
            targetLanguage: selectedLanguage,
            targetLanguageName: languageNameEn,
            recipeTitle: recipeTitle
          });

          const { data, error } = await sb.functions.invoke('call-groq-api', {
            body: {
              mode: 'recipe_translation',
              recipeData: buildCurrentRecipeData(),
              targetLanguage: selectedLanguage,
              targetLanguageName: languageNameEn,
              model: getCurrentGroqModel(),
              temperature: 0.3
            }
          });

          if (error) {
            console.error('翻訳APIエラー詳細:', error);
            titleInput.value = '';
            
            // 詳細なエラー情報を表示
            let errorMessage = '翻訳APIエラー: ';
            if (error.message) {
              errorMessage += error.message;
            } else if (typeof error === 'string') {
              errorMessage += error;
            } else {
              errorMessage += JSON.stringify(error);
            }
            
            // 認証エラーの特別な処理
            if (error.message && error.message.includes('JWT')) {
              errorMessage += '\n\n認証の問題である可能性があります。ログインしてからもう一度お試しください。';
            }
            
            alert(errorMessage);
            return;
          }

          console.log('📡 翻訳API呼び出し完了');
          
          if (data?.success) {
            console.log('✅ 翻訳成功 - レスポンス:', data);
            const translationResult = data.data || {};
            const translatedText = translationResult.title?.trim() || data.content?.trim() || '';
            
            console.log('🔍 抽出されたタイトル:', translatedText);

            if (translatedText) {
              titleInput.value = translatedText;
              row.dataset.translatedRecipe = JSON.stringify(translationResult);
              console.log('✅ 翻訳結果をUIに反映しました');
              await addTranslationTag();
              console.log('✅ 翻訳タグを追加しました');
            } else {
              titleInput.value = '';
              delete row.dataset.translatedRecipe;
              console.error('❌ 翻訳結果が空です:', data);
              alert('翻訳結果が取得できませんでした。もう一度お試しください。');
            }
          } else {
            console.error('❌ 翻訳API失敗:', data);
            titleInput.value = '';
            delete row.dataset.translatedRecipe;
            
            let errorDetails = '';
            if (data?.error) {
              errorDetails = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
            } else {
              errorDetails = JSON.stringify(data);
            }
            
            alert('翻訳に失敗しました: ' + errorDetails);
          }
        } catch (error) {
          console.error('翻訳エラー詳細:', error);
          titleInput.value = '';
          delete row.dataset.translatedRecipe;
          
          let errorMessage = '翻訳処理中にエラーが発生しました: ';
          if (error.message) {
            errorMessage += error.message;
          } else {
            errorMessage += String(error);
          }
          
          // ネットワークエラーの特別な処理
          if (error.message && error.message.includes('fetch')) {
            errorMessage += '\n\nネットワーク接続を確認してください。';
          }
          
          // Supabaseクライアントエラーの特別な処理
          if (error.message && error.message.includes('supabase')) {
            errorMessage += '\n\nSupabaseクライアントの初期化に問題がある可能性があります。';
          }
          
          alert(errorMessage);
          console.error('翻訳エラースタック:', error.stack);
        } finally {
          titleInput.disabled = false;
        }
      }
    }
  });
  
  tbody.appendChild(row);
  console.log('✅ 翻訳行を追加しました:', row);
  
  // 削除ボタンのイベントリスナー
  row.querySelector('.remove-translation-btn').addEventListener('click', () => {
    console.log('🗑️ 翻訳行を削除します');
    row.remove();
    updateLanguageOptions();
    updateAddButtonVisibility();
    
    // 翻訳が削除された場合、自動的に保存を実行
    if (document.querySelectorAll('.translation-row').length === 0) {
      // 翻訳データが空になったことを示すフラグを設定
      window.translationDeleted = true;
    }
  });
  
  // 言語選択変更時のイベントリスナー
  row.querySelector('.translation-language').addEventListener('change', () => {
    // 他の行の言語選択肢を更新
    updateLanguageOptions();
  });
};

// 翻訳追加ボタンの表示/非表示を制御する関数
const updateAddButtonVisibility = () => {
  const addBtn = document.getElementById('addTranslationBtn');
  const existingRows = document.querySelectorAll('.translation-row');
  
  if (addBtn) {
    if (existingRows.length >= 1) {
      addBtn.style.display = 'none';
    } else {
      addBtn.style.display = 'inline-block';
    }
  }
};

// 言語選択肢を更新する関数（1つの翻訳のみなので簡素化）
const updateLanguageOptions = () => {
  // 1つの翻訳のみなので、言語選択肢の更新は不要
  // 必要に応じて将来の拡張用に残す
};

// 翻訳データを取得する関数（手順データも含む）
const getTranslationData = async () => {
  console.log('🔍 翻訳データ取得開始');
  
  const translations = [];
  const rows = document.querySelectorAll('.translation-row');
  console.log('📊 翻訳行の数:', rows.length);
  console.log('📊 翻訳行の要素:', rows);
  
  // 翻訳行のデータを検証
  rows.forEach((row, index) => {
    const languageCode = row.querySelector('.translation-language')?.value?.trim();
    const translatedTitle = row.querySelector('.translation-title')?.value?.trim();
    
    console.log(`行${index + 1}のデータ:`, { languageCode, translatedTitle });
    
    // 空の翻訳行をスキップ
    if (!languageCode || !translatedTitle) {
      console.warn(`⚠️ 行${index + 1}: 言語コードまたはタイトルが空です`);
      return;
    }
    
    console.log(`✅ 行${index + 1}: 有効な翻訳データ`);
  });

  // 海外サイトから取り込んだ場合、翻訳前データも追加
  let originalEntry = null;
  if (originalRecipeData && originalRecipeData.original_title) {
    console.log('🌍 翻訳前データを翻訳データに追加:', originalRecipeData);
    
    // 言語コードを取得（検出された言語またはデフォルト）
    const originalLanguage = originalRecipeData.original_language || 'fr';
    const languageNames = {
      'fr': 'フランス語',
      'en': '英語',
      'de': 'ドイツ語',
      'es': 'スペイン語',
      'it': 'イタリア語',
      'unknown': '元の言語'
    };
    
    originalEntry = {
      language_code: originalLanguage,
      translated_title: originalRecipeData.original_title,
      translated_description: originalRecipeData.original_description,
      translated_ingredients: originalRecipeData.original_ingredients,
      translated_steps: originalRecipeData.original_steps,
      is_original: true, // 翻訳前データのフラグ
      html_content: generateTranslationDisplayHTML(originalRecipeData.original_title, originalLanguage)
    };
  } else {
    // 翻訳前データが存在しない場合は、現在の入力内容から元のデータを生成
    const currentRecipe = buildCurrentRecipeData();
    const hasOriginalContent = !!(
      currentRecipe.title ||
      currentRecipe.description ||
      (currentRecipe.ingredients && currentRecipe.ingredients.length > 0) ||
      (currentRecipe.steps && currentRecipe.steps.length > 0)
    );

    if (hasOriginalContent) {
      const normalizedIngredients = (currentRecipe.ingredients || []).map((ing, index) => ({
        position: ing.position || index + 1,
        item: ing.item || '',
        quantity: ing.quantity || '',
        unit: ing.unit || '',
        price: ing.price || ''
      }));

      const normalizedSteps = (currentRecipe.steps || []).map((step, index) => {
        const instruction = step.instruction || step.step || '';
        return {
          step_number: step.step_number || index + 1,
          position: step.position || index + 1,
          instruction,
          step: instruction
        };
      });

      originalEntry = {
        language_code: 'ja',
        translated_title: currentRecipe.title || 'レシピタイトル',
        translated_description: currentRecipe.description || '',
        translated_ingredients: normalizedIngredients,
        translated_steps: normalizedSteps,
        is_original: true,
        html_content: generateTranslationDisplayHTML(currentRecipe.title || 'レシピタイトル', 'ja')
      };
    }
  }

  if (rows.length === 0) {
    console.warn('⚠️ 翻訳行が見つかりません。翻訳を追加してください。');
    if (originalEntry) {
      translations.push(originalEntry);
    }
    return translations;
  }

  // 順次処理して翻訳APIの呼び出しを直列化
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    console.log(`🔍 行${index + 1}の処理開始:`, row);
    
    const languageSelect = row.querySelector('.translation-language');
    const titleInput = row.querySelector('.translation-title');
    
    console.log('🔍 言語選択要素:', languageSelect);
    console.log('🔍 タイトル入力要素:', titleInput);
    
    if (!languageSelect || !titleInput) {
      console.warn(`⚠️ 行${index + 1}: 必要な要素が見つかりません`);
      continue;
    }
    
    const languageCode = languageSelect.value;
    const translatedTitle = titleInput.value.trim();
    let storedTranslation = null;
    if (row.dataset.translatedRecipe) {
      try {
        storedTranslation = JSON.parse(row.dataset.translatedRecipe);
      } catch (parseError) {
        console.warn('⚠️ 保存された翻訳データの解析に失敗:', parseError);
      }
    }

    console.log(`📝 行${index + 1}のデータ:`, { languageCode, translatedTitle, storedTranslation });
    
    if (!languageCode || !translatedTitle) {
      console.warn(`⚠️ 行${index + 1}: 言語コードまたはタイトルが空です。スキップします。`);
      continue;
    }

    try {
      const translatedIngredients = storedTranslation?.ingredients
        ? storedTranslation.ingredients.map((ing, ingIndex) => ({
            position: ingIndex + 1,
            item: ing?.item || '',
            quantity: ing?.quantity || '',
            unit: ing?.unit || '',
            price: ing?.price || ''
          }))
        : getTranslatedIngredients(languageCode);
      console.log(`📦 ${languageCode}の材料データ:`, translatedIngredients);

      let translatedSteps = [];
      if (storedTranslation?.steps) {
        translatedSteps = storedTranslation.steps
          .map((step, stepIndex) => {
            const instruction = typeof step === 'string' ? step : (step?.instruction || step?.text || '');
            return instruction ? {
              step_number: stepIndex + 1,
              position: stepIndex + 1,
              instruction
            } : null;
          })
          .filter(Boolean);
      }

      if (!translatedSteps.length) {
        console.log(`🔍 ${languageCode}の手順データを取得中...`);
        translatedSteps = await getTranslatedSteps(languageCode);
      }
      console.log(`📝 ${languageCode}の手順データ:`, translatedSteps);

      const translationData = {
        language_code: languageCode,
        translated_title: translatedTitle,
        translated_description: storedTranslation?.description || '',
        translated_servings: storedTranslation?.servings || '',
        translated_ingredients: translatedIngredients,
        translated_steps: translatedSteps,
        html_content: generateTranslationDisplayHTML(translatedTitle, languageCode)
      };
      
      translations.push(translationData);
      console.log(`✅ ${languageCode}の翻訳データを収集完了:`, {
        ingredients: translatedIngredients.length,
        steps: translatedSteps.length,
        data: translationData
      });

    } catch (error) {
      console.error(`❌ ${languageCode}の翻訳データ収集エラー:`, error);
    }
  }

  if (originalEntry) {
    translations.unshift(originalEntry);
  }

  console.log('📊 最終的な翻訳データ:', translations);
  console.log('📊 翻訳データの数:', translations.length);
  return translations;
};

// 翻訳された材料データを取得する関数
const getTranslatedIngredients = (languageCode) => {
  const ingredientRows = document.querySelectorAll('.ingredient-row');
  const ingredients = [];

  ingredientRows.forEach((row, index) => {
    const item = row.querySelector('.ingredient-item')?.value?.trim();
    const quantity = row.querySelector('.ingredient-quantity')?.value?.trim();
    const unit = row.querySelector('.ingredient-unit')?.value?.trim();

    if (item) {
      ingredients.push({
        position: index + 1,
        item: item,
        quantity: quantity || null,
        unit: unit || null,
        original_item: item // 将来的な翻訳機能用
      });
    }
  });

  return ingredients;
};

// 翻訳された手順データを取得する関数
const getTranslatedSteps = async (languageCode) => {
  console.log(`🔍 Collecting translated steps for language: ${languageCode}`);

  // まず、既存の翻訳手順を探す
  const steps = [];

  // 翻訳表示エリアから翻訳された手順を探す
  const translationDisplay = document.querySelector(`[data-language="${languageCode}"]`);
  if (translationDisplay) {
    const translatedStepElements = translationDisplay.querySelectorAll('.translated-step, .step-instruction');
    if (translatedStepElements.length > 0) {
      console.log(`✅ Found ${translatedStepElements.length} translated steps in display area`);
      translatedStepElements.forEach((element, index) => {
        const instruction = element.textContent?.trim() || element.value?.trim();
        if (instruction) {
          steps.push({
            step_number: index + 1,
            position: index + 1,
            instruction: instruction
          });
        }
      });
      return steps;
    }
  }

  // 翻訳テーブル内の手順を探す
  const translationTable = document.querySelector('.translated-steps-table, .steps-table');
  if (translationTable) {
    const stepCells = translationTable.querySelectorAll('td.step-instruction, .step-text');
    if (stepCells.length > 0) {
      console.log(`✅ Found ${stepCells.length} translated steps in table`);
      stepCells.forEach((cell, index) => {
        const instruction = cell.textContent?.trim() || cell.value?.trim();
        if (instruction) {
          steps.push({
            step_number: index + 1,
            position: index + 1,
            instruction: instruction
          });
        }
      });
      return steps;
    }
  }

  // 既存の翻訳がない場合、オリジナルの手順をGroq APIで翻訳
  console.log(`🌐 No existing translated steps found, translating original steps to ${languageCode}`);

  const originalSteps = [];
  const stepRows = document.querySelectorAll('.step-row');
  stepRows.forEach((row, index) => {
    const instruction = row.querySelector('.step-text')?.value?.trim();
    if (instruction) {
      originalSteps.push(instruction);
    }
  });

  if (originalSteps.length === 0) {
    console.log(`❌ No original steps to translate`);
    return [];
  }

  // Groq APIで手順を翻訳
  try {
    const languageNames = {
      'fr': 'フランス語',
      'it': 'イタリア語',
      'zh': '中国語',
      'es': 'スペイン語',
      'de': 'ドイツ語',
      'en': '英語'
    };

    const targetLanguage = languageNames[languageCode] || languageCode;

    const stepsText = originalSteps.map((step, index) => `${index + 1}. ${step}`).join('\n');

    const prompt = `以下の料理の手順を${targetLanguage}に翻訳してください。調理用語や料理の専門用語を正確に翻訳し、自然な${targetLanguage}になるようにしてください。

手順:
${stepsText}

翻訳された手順のみを、番号付きで出力してください。`;

    const { data, error } = await sb.functions.invoke('call-groq-api', {
      body: {
        text: prompt,
        model: getCurrentGroqModel(),
        maxTokens: 2000,
        temperature: 0.3
      }
    });

    if (error || !data?.success) {
      throw new Error(`Translation API error: ${data?.error || error?.message || 'unknown'}`);
    }

    const translatedText = data.content?.trim();

    if (translatedText) {
      console.log(`✅ Successfully translated ${originalSteps.length} steps to ${languageCode}`);

      // 翻訳結果を解析して手順配列に変換
      const translatedLines = translatedText.split('\n').filter(line => line.trim());
      const translatedSteps = [];

      translatedLines.forEach((line, index) => {
        // 番号を除去して手順のテキストのみ抽出
        const cleanedStep = line.replace(/^\d+\.\s*/, '').trim();
        if (cleanedStep) {
          translatedSteps.push({
            step_number: index + 1,
            position: index + 1,
            instruction: cleanedStep
          });
        }
      });

      console.log(`📝 Translated steps:`, translatedSteps);
      return translatedSteps;
    }

  } catch (error) {
    console.error('Translation error:', error);
  }

  // 翻訳に失敗した場合、オリジナルの手順を返す
  console.log(`⚠️ Translation failed, using original steps`);
  const fallbackSteps = [];
  stepRows.forEach((row, index) => {
    const instruction = row.querySelector('.step-text')?.value?.trim();
    if (instruction) {
      fallbackSteps.push({
        step_number: index + 1,
        position: index + 1,
        instruction: instruction,
        original_instruction: instruction
      });
    }
  });

  console.log(`📝 Collected ${fallbackSteps.length} fallback steps:`, fallbackSteps);
  return fallbackSteps;
};

// 翻訳表示用のHTMLを生成する関数 - 2言語同時表示対応
const generateTranslationDisplayHTML = (translatedTitle, languageCode) => {
  const languageNames = {
    'fr': 'Français',
    'it': 'Italiano',
    'ja': '日本語',
    'zh': '中文',
    'es': 'Español',
    'de': 'Deutsch',
    'en': 'English'
  };

  const languageName = languageNames[languageCode] || languageCode;

  return `
    <div class="translation-display bilingual-layout" data-language="${languageCode}">
      <div class="translation-header">
        <span class="language-label">${languageName}</span>
        <span class="language-code">[${languageCode.toUpperCase()}]</span>
      </div>
      <h2 class="translated-title">${translatedTitle}</h2>
    </div>
  `;
};

// スクリーンショット通りの完全な2言語レイアウトHTMLを生成する関数
const generateBilingualDisplayHTML = (originalTitle, translations) => {
  if (!translations || translations.length === 0) return '';

  // 翻訳前データと翻訳後データを分離
  const originalData = translations.find(t => t.is_original);
  const translatedData = translations.find(t => !t.is_original);

  return `
    <div class="bilingual-recipe-layout">
      <!-- メインタイトルセクション -->
      <div class="main-title-section">
        ${translatedData ? `
          <h1 class="translated-main-title">${translatedData.translated_title}</h1>
          <div class="original-subtitle">（${originalTitle}）</div>
        ` : `
          <h1 class="translated-main-title">${originalTitle}</h1>
        `}
      </div>

      <!-- 材料セクション -->
      <div class="ingredients-section">
        <div class="section-header-with-line">
          <h2 class="section-title">材料 (Ingredients)</h2>
        </div>

        ${translatedData ? `
          <!-- 翻訳された材料テーブル -->
          <div class="ingredients-table-container">
            <table class="ingredients-table translated-ingredients">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>材料名</th>
                  <th>分量</th>
                  <th>単位</th>
                </tr>
              </thead>
              <tbody>
                ${translatedData.translated_ingredients.map((ing, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${ing.item || ''}</td>
                    <td>${ing.quantity || ''}</td>
                    <td>${ing.unit || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        ${originalData ? `
          <!-- 翻訳前材料セクション -->
          <div class="original-section-header">
            <h3 class="original-section-title">元の材料 (${originalData.language_code === 'fr' ? 'Français' : originalData.language_code === 'en' ? 'English' : originalData.language_code === 'de' ? 'Deutsch' : originalData.language_code === 'es' ? 'Español' : originalData.language_code === 'it' ? 'Italiano' : 'Original'})</h3>
          </div>

          <!-- 翻訳前材料テーブル -->
          <div class="ingredients-table-container">
            <table class="ingredients-table original-ingredients">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>材料名</th>
                  <th>分量</th>
                  <th>単位</th>
                </tr>
              </thead>
              <tbody>
                ${originalData.translated_ingredients.map((ing, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>${ing.item || ''}</td>
                    <td>${ing.quantity || ''}</td>
                    <td>${ing.unit || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      </div>

      <!-- 手順セクション -->
      <div class="steps-section">
        <div class="section-header-with-line">
          <h2 class="section-title">手順 (Instructions)</h2>
        </div>

        ${translatedData ? `
          <!-- 翻訳された手順 -->
          <div class="steps-container">
            <h3 class="steps-subtitle">翻訳版</h3>
            <ol class="steps-list">
              ${translatedData.translated_steps.map((step, index) => `
                <li class="step-item">
                  <span class="step-number">${index + 1}</span>
                  <span class="step-text">${step.step || step.instruction || ''}</span>
                </li>
              `).join('')}
            </ol>
          </div>
        ` : ''}

        ${originalData ? `
          <!-- 翻訳前手順 -->
          <div class="steps-container original-steps">
            <h3 class="steps-subtitle">元の手順 (${originalData.language_code === 'fr' ? 'Français' : originalData.language_code === 'en' ? 'English' : originalData.language_code === 'de' ? 'Deutsch' : originalData.language_code === 'es' ? 'Español' : originalData.language_code === 'it' ? 'Italiano' : 'Original'})</h3>
            <ol class="steps-list">
              ${originalData.translated_steps.map((step, index) => `
                <li class="step-item">
                  <span class="step-number">${index + 1}</span>
                  <span class="step-text">${step.step || step.instruction || ''}</span>
                </li>
              `).join('')}
            </ol>
          </div>
        ` : ''}
      </div>
    </div>
  `;
};

// 翻訳表示モードと編集モードを切り替える関数 - 2言語同時表示対応
const toggleTranslationDisplayMode = async (isDisplayMode = true) => {
  console.log('🔄 翻訳表示モード切り替え開始:', isDisplayMode);
  
  const translationSection = document.querySelector('.translation-section');
  if (!translationSection) {
    console.error('❌ 翻訳セクションが見つかりません');
    return;
  }
  
  console.log('✅ 翻訳セクションを発見:', translationSection);

  if (isDisplayMode) {
    // 表示モードに切り替え - 2言語同時表示
    console.log('📖 2言語表示モードに切り替え中...');
    
    const translations = await getTranslationData();
    console.log('📚 取得した翻訳データ:', translations);
    console.log('📚 翻訳データの数:', translations.length);
    
    const originalTitle = document.getElementById('title')?.value?.trim() || 'レシピタイトル';
    console.log('📝 元のタイトル:', originalTitle);

    const hasTranslatedData = translations.some(t => !t.is_original);

    if (hasTranslatedData) {
      console.log('✅ 翻訳データが存在します。2言語表示を生成中...');
      const bilingualHTML = generateBilingualDisplayHTML(originalTitle, translations);
      console.log('🎨 生成されたHTML:', bilingualHTML);
      
      translationSection.innerHTML = `
        <div class="translation-display-container bilingual-mode">
          <div class="translation-mode-header">
            <span class="mode-label">2言語表示モード</span>
            <button type="button" class="edit-mode-btn" onclick="toggleTranslationDisplayMode(false)">
              編集モードに戻る
            </button>
          </div>
          ${bilingualHTML}
        </div>
      `;
      console.log('✅ 2言語表示モードに切り替え完了');
    } else {
      console.warn('⚠️ 翻訳データがありません。翻訳を追加してください。');
      translationSection.innerHTML = `
        <div class="translation-display-container">
          <div class="translation-mode-header">
            <span class="mode-label">2言語表示モード</span>
            <button type="button" class="edit-mode-btn" onclick="toggleTranslationDisplayMode(false)">
              編集モードに戻る
            </button>
          </div>
          <div class="no-translation-message">
            <p>翻訳データがありません。</p>
            <p>翻訳を追加してから2言語表示プレビューを使用してください。</p>
          </div>
        </div>
      `;
    }
  } else {
    // 編集モードに戻る
    console.log('✏️ 編集モードに戻ります');
    location.reload(); // 簡単な実装として、ページをリロードして編集モードに戻る
  }
};

// 翻訳プレビューボタンを追加する関数
const addTranslationPreviewButton = () => {
  console.log('🔍 翻訳プレビューボタン追加開始');
  
  const translationSection = document.querySelector('.translation-section');
  if (!translationSection) {
    console.error('❌ 翻訳セクションが見つかりません');
    return;
  }
  
  console.log('✅ 翻訳セクションを発見:', translationSection);

  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.className = 'btn secondary small';
  previewBtn.innerHTML = '👁️ 2言語表示プレビュー';
  previewBtn.style.marginTop = '0.5rem';
  previewBtn.onclick = () => {
    console.log('🖱️ 2言語表示プレビューボタンがクリックされました');
    toggleTranslationDisplayMode(true);
  };

  translationSection.appendChild(previewBtn);
  console.log('✅ 翻訳プレビューボタンを追加しました:', previewBtn);
};

// Unit normalization helpers (convert Japanese cooking units to ml/g)
const parseNumericLike = (value) => {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  // handle formats like '1 1/2'
  const mixed = s.match(/^(\d+)\s+(\d+)[\/](\d+)$/);
  if (mixed) {
    const whole = parseFloat(mixed[1]);
    const num = parseFloat(mixed[2]);
    const den = parseFloat(mixed[3]);
    if (!isNaN(whole) && !isNaN(num) && !isNaN(den) && den !== 0) return whole + num / den;
  }
  // simple fraction like '1/2'
  const frac = s.match(/^(\d+)[\/](\d+)$/);
  if (frac) {
    const num = parseFloat(frac[1]);
    const den = parseFloat(frac[2]);
    if (!isNaN(num) && !isNaN(den) && den !== 0) return num / den;
  }
  // extract leading number e.g., '1.5個'
  const numMatch = s.match(/[-+]?\d*\.?\d+/);
  if (numMatch) {
    const n = parseFloat(numMatch[0]);
    if (!isNaN(n)) return n;
  }
  return null;
};

const normalizeQuantityUnit = (quantityRaw, unitRaw) => {
  let quantityText = quantityRaw == null ? '' : String(quantityRaw).trim();
  let unitText = unitRaw == null ? '' : String(unitRaw).trim();

  // Detect unit embedded in quantity
  if (!unitText) {
    const m = quantityText.match(/(小さじ|大さじ|カップ|tsp|tbsp|cup)\s*([\d\.\/]*)/i);
    if (m) {
      unitText = m[1];
      if (m[2]) quantityText = m[2];
    }
  }

  // Skip non-numeric/uncertain amounts
  if (/(少々|適量|ひとつまみ|お好み|少量)/.test(quantityText)) {
    return { quantity: quantityRaw, unit: unitRaw };
  }

  // Standardize ml-related units
  const unitLower = unitText.toLowerCase();
  const n = parseNumericLike(quantityText);
  if (n != null) {
    // Spoon and cup conversions to ml
    if (/^小さじ|tsp$/.test(unitText) || unitLower === 'tsp') {
      return { quantity: String(n * 5), unit: 'ml' };
    }
    if (/^大さじ|tbsp$/.test(unitText) || unitLower === 'tbsp') {
      return { quantity: String(n * 15), unit: 'ml' };
    }
    if (/カップ|cup/.test(unitText) || unitLower === 'cup') {
      return { quantity: String(n * 200), unit: 'ml' }; // Japanese cup ≈ 200ml
    }
    if (/(ml|ミリリットル|cc)/i.test(unitText)) {
      return { quantity: String(n), unit: 'ml' };
    }
    if (/^(l|Ｌ|l\.|リットル)$/i.test(unitText)) {
      return { quantity: String(n * 1000), unit: 'ml' };
    }

    // Weight to g
    if (/(g|グラム)$/i.test(unitText)) {
      return { quantity: String(n), unit: 'g' };
    }
    if (/(kg|キログラム)$/i.test(unitText)) {
      return { quantity: String(n * 1000), unit: 'g' };
    }
  }

  // If unit keywords appear but numeric couldn't be parsed, try to keep unit normalized
  if (/小さじ/.test(unitText)) return { quantity: quantityText, unit: 'ml' };
  if (/大さじ/.test(unitText)) return { quantity: quantityText, unit: 'ml' };
  if (/カップ/.test(unitText)) return { quantity: quantityText, unit: 'ml' };
  if (/(ml|ミリリットル|cc)/i.test(unitText)) return { quantity: quantityText, unit: 'ml' };
  if (/(g|グラム)$/i.test(unitText)) return { quantity: quantityText, unit: 'g' };
  if (/(kg|キログラム)$/i.test(unitText)) return { quantity: quantityText, unit: 'g' };

  return { quantity: quantityText, unit: unitText };
};

// 入力されている材料を取得する関数
const getExistingIngredients = () => {
  const ingredientRows = document.querySelectorAll('.ingredient-row');
  const ingredients = [];
  
  ingredientRows.forEach(row => {
    const itemInput = row.querySelector('.ingredient-item');
    if (itemInput && itemInput.value.trim() !== '') {
      ingredients.push(itemInput.value.trim());
    }
  });
  
  // DOMに材料がない場合は、保存された材料を返す
  if (ingredients.length === 0 && originalIngredients.length > 0) {
    return originalIngredients;
  }
  
  return ingredients;
};

// 料理ジャンルから言語コードを取得する関数
const getLanguageCode = (genre) => {
  const languageMap = {
    'フレンチ': 'fr',
    'イタリアン': 'it', 
    '和食': 'ja',
    '中華': 'zh',
    'スパニッシュ': 'es',
    'ドイツ': 'de',
    '創作料理': 'en',
    'デザート': 'fr',
    'パン': 'fr'
  };
  return languageMap[genre] || 'en';
};

// 料理ジャンルから言語名を取得する関数
const getLanguageName = (genre) => {
  const languageNameMap = {
    'フレンチ': 'フランス',
    'イタリアン': 'イタリア',
    '和食': '日本',
    '中華': '中国',
    'スパニッシュ': 'スペイン',
    'ドイツ': 'ドイツ',
    '創作料理': '英語',
    'デザート': 'フランス',
    'パン': 'フランス'
  };
  return languageNameMap[genre] || '英語';
};

const generateMenuSuggestions = async () => {
  const selectedGenreBtn = document.querySelector('.genre-btn.selected');
  if (!selectedGenreBtn) {
    alert('ジャンルを選択してください');
    return;
  }
  
  selectedGenre = selectedGenreBtn.dataset.genre;
  const customRequest = document.getElementById('ai-custom-request')?.value || '';
  
  // 入力されている材料を取得
  const existingIngredients = getExistingIngredients();
  let baseIngredient = '';
  
  // 材料が複数入力されている場合はそれを使用
  if (existingIngredients.length >= 2) {
    // 最初に指定した材料を保存
    originalIngredients = [...existingIngredients];
    console.log('DOMから取得した材料を保存:', originalIngredients);
    
    baseIngredient = `**必須材料**: 以下の材料を必ずすべて使用して創作してください: ${existingIngredients.join(', ')}。これらの材料を効果的に組み合わせた料理を提案してください。`;
  } 
  // 材料が1つも入力されていない場合は材料入力モーダルを表示
  else if (existingIngredients.length === 0) {
    const materialInput = prompt('創作のベースにしたい材料を入力してください（例: 鶏肉、トマト、じゃがいも）\n複数の材料を入力する場合は、カンマで区切ってください');
    if (!materialInput || materialInput.trim() === '') {
      alert('材料を入力してください');
      return;
    }
    const ingredients = materialInput.trim().split(',').map(ing => ing.trim()).filter(ing => ing);
    
    // 最初に指定した材料を保存
    originalIngredients = [...ingredients];
    console.log('最初に指定した材料を保存:', originalIngredients);
    
    if (ingredients.length >= 2) {
      baseIngredient = `**必須材料**: 以下の材料を必ずすべて使用して創作してください: ${ingredients.join(', ')}。これらの材料を効果的に組み合わせた料理を提案してください。`;
    } else {
      baseIngredient = `**必須材料**: ${ingredients[0]}を必ず主材料として使用してください。この材料を中心とした料理を提案してください。`;
    }
  }
  // 材料が1つだけの場合はそれを使用
  else {
    // 最初に指定した材料を保存
    originalIngredients = [...existingIngredients];
    console.log('単一材料を保存:', originalIngredients);
    
    baseIngredient = `**必須材料**: ${existingIngredients[0]}を必ず主材料として使用してください。この材料を中心とした料理を提案してください。`;
  }
  
  showAIStep('loading');
  
  try {
    const languageName = getLanguageName(selectedGenre);
    // ランダムな要素を追加して多様性を向上
    const randomElements = [
      '季節感を意識した',
      '異なる調理法（炒める、煮る、焼く、蒸す、揚げる）を組み合わせた',
      '様々な食感（サクサク、とろとろ、シャキシャキ、ふわふわ）を楽しめる',
      '色彩豊かな',
      'ヘルシーで栄養バランスの良い',
      '簡単で時短できる',
      '見た目が美しい',
      'スパイスやハーブを効果的に使った',
      '異なる文化圏の調理法を取り入れた',
      'クリエイティブで独創的な'
    ];
    
    const selectedRandom = randomElements[Math.floor(Math.random() * randomElements.length)];
    
    const prompt = `あなたは経験豊富なシェフ兼料理研究家です。${selectedGenre}料理の専門知識を持ち、創造的で実用的なレシピを提案する能力があります。

## 基本要件
${selectedGenre}料理のメニューを5つ提案してください。
${baseIngredient}
${customRequest ? `追加条件: ${customRequest}` : ''}

## 創作方針
**多様性と創造性**: 同じ材料でも毎回異なるアプローチで創作してください。以下の要素を意識して、バリエーション豊かな提案をお願いします：

### 調理技術の多様性
- 伝統的調理法（炒める、煮る、焼く、蒸す、揚げる、生食など）
- 現代的手法（低温調理、燻製、真空調理、分子ガストロノミーなど）
- 特殊技法（発酵、熟成、マリネ、ピクルスなど）

### 味覚のバランス
- 基本味の調和（甘味、酸味、塩味、苦味、うま味）
- 香りとスパイスの効果的な使用
- 地域性を活かした味付け（和風、洋風、中華風、エスニック風など）

### 食感の演出
- テクスチャーの対比（サクサク、とろとろ、シャキシャキ、ふわふわなど）
- 温度の変化（温冷の組み合わせ）
- 口当たりの工夫

### 視覚的アピール
- 色彩の調和とコントラスト
- 盛り付けの美しさ
- プレゼンテーションの独創性

### 栄養学的配慮
- 栄養バランスの最適化
- ヘルシーな食材の活用
- 季節性と旬の食材

${existingIngredients.length >= 2 ? `
## 材料使用の必須条件
指定された材料（${existingIngredients.join('、')}）を必ずすべて使用してください。以下の条件を厳守してください：

### 材料活用の原則
- 指定された材料のいずれかが欠けている提案は絶対に作成しないでください
- 各提案で指定材料を効果的に組み合わせて使用してください
- 材料の相性や調理法のバリエーションを考慮して、それぞれ異なるアプローチで創作してください
- 指定材料以外の材料は最小限に留め、指定材料を主役にしてください
- 指定材料の特性（味、食感、栄養価）を活かした料理を提案してください

### 材料の特性を活かす
- 各材料の最適な調理法を選択
- 材料同士の相性を考慮した組み合わせ
- 材料の持つ風味や食感を最大限に引き出す工夫` : ''}

## 分量表記の統一
**重要**: 材料の分量は必ずgまたはmlで表記してください。大さじ、小さじ、カップなどの単位は使用せず、以下の換算で数値化してください：
- 大さじ1 = 15ml/15g
- 小さじ1 = 5ml/5g  
- カップ1 = 200ml

## 料理名の命名規則
**重要**: 料理名は以下の基準で説明的で洗練されたものにしてください：

### 命名の基本原則
- **説明的な料理名**: フレンチレストランのように、調理法や食材を明確に表現
- **日本語と現地語の融合**: 日本語の説明と現地語の専門用語を組み合わせ
- **技法を表現**: 調理法や技法を料理名に反映（例：コンフィ、ブレゼ、グラタン）
- **食材の特徴**: 主食材や特徴的な食材を料理名に含める
- **地域性の表現**: その地域の料理文化を反映した名前
- **専門用語の活用**: 料理の専門用語を適切に使用

### 避けるべき命名
- カタカナのみの名前（例：「コンフィドカナール」）
- 一般的すぎる名前（例：「美味しい○○」「簡単○○」）
- 曖昧な表現（例：「特別な○○」「素晴らしい○○」）
- 現地語のみの名前（日本語の説明がない）

### 推奨する命名パターン
- **日本語 + 現地語**: 「ローストチキンのコンフィ風」「サーモンのブレゼ仕立て」
- **現地語 + 日本語**: 「コンフィ・ド・カナール（鴨のコンフィ）」「ブレゼ・ド・ボー（牛肉のブレゼ）」
- **説明的な日本語**: 「低温調理したサーモンのクリームソース仕立て」「燻製した鴨胸肉の赤ワインソース」

### 専門的な命名例
- **フレンチ**: 「コンフィ・ド・カナール（鴨のコンフィ）」「ブレゼ・ド・ボー（牛肉のブレゼ）」「グラタン・ドフィノワ（じゃがいものグラタン）」「ラタトゥイユ（南仏風野菜の煮込み）」
- **イタリアン**: 「オッソ・ブコ（骨付き牛肉の煮込み）」「カルボナーラ（クリームパスタ）」「リゾット・アッラ・ミラネーゼ（ミラノ風リゾット）」
- **和食**: 「茶碗蒸し（卵とじ蒸し）」「天ぷら（揚げ物）」「すき焼き（牛肉の甘辛煮）」
- **中華**: 「麻婆豆腐（四川風豆腐料理）」「小籠包（上海風蒸し餃子）」「北京ダック（北京風鴨料理）」

## 説明文の構成
各メニューの説明は以下の要素を含む簡潔な文章（50文字以内）で作成してください：

### 必須要素
- **調理法の特徴**: 低温調理、燻製、分子ガストロノミーなど
- **味の特徴**: 酸味、甘み、スパイシーなど
- **食感の特徴**: クリーミー、サクサク、とろけるなど
- **プレゼンテーションの特徴**: 色彩豊か、ミニマル、アート的など

## 多言語対応
各メニュー名を${languageName}語で翻訳してください。翻訳は以下の点に注意してください：
- **現地の伝統的な料理名**: その地域で実際に使われている料理名を使用
- **専門用語の正確性**: 料理の専門用語を正確に翻訳
- **文化的配慮**: 現地の料理文化に配慮した表現
- **発音の正確性**: 現地の発音に近い表記

## 出力形式
以下のJSON形式で回答してください：
{
  "suggestions": [
    {"name": "料理名1（日本語）", "translated_name": "料理名1（${languageName}語）", "description": "特徴的な調理法と味の特徴を簡潔に"},
    {"name": "料理名2（日本語）", "translated_name": "料理名2（${languageName}語）", "description": "特徴的な調理法と味の特徴を簡潔に"},
    {"name": "料理名3（日本語）", "translated_name": "料理名3（${languageName}語）", "description": "特徴的な調理法と味の特徴を簡潔に"},
    {"name": "料理名4（日本語）", "translated_name": "料理名4（${languageName}語）", "description": "特徴的な調理法と味の特徴を簡潔に"},
    {"name": "料理名5（日本語）", "translated_name": "料理名5（${languageName}語）", "description": "特徴的な調理法と味の特徴を簡潔に"}
  ]
}

## 品質基準
- **実現可能性**: 家庭で再現可能なレシピ
- **独創性**: 既存のレシピとは異なる新しいアプローチ
- **美味しさ**: 味覚的に優れた組み合わせ
- **美しさ**: 視覚的に魅力的な仕上がり
- **栄養価**: 健康的な食材の活用
- **専門性**: 料理の専門用語と伝統的な命名法の使用
- **洗練度**: 高級レストランで提供されるような洗練された料理名

## 最終確認事項
- 料理名はその地域の伝統的な命名法に従っているか
- 専門用語が適切に使用されているか
- 一般的すぎる表現を避けているか
- 料理の本質を表現しているか
- 発音しやすく覚えやすい名前か`;

    // ChatGPT APIを呼び出し
    const content = await callChatGPTAPI(prompt);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0]);
      displayMenuSuggestions(suggestions.suggestions);
      showAIStep(2);
    } else {
      throw new Error('提案の生成に失敗しました');
    }
  } catch (error) {
    alert('メニュー提案の生成に失敗しました: ' + error.message);
    showAIStep(1);
  }
};

const displayMenuSuggestions = (suggestions) => {
  const container = document.getElementById('menu-suggestions');
  container.innerHTML = suggestions.map((suggestion, index) => `
    <div class="menu-item" data-index="${index}">
      <h4>${escapeHtml(suggestion.name)}</h4>
      ${suggestion.translated_name ? `<div class="translated-menu-name">${escapeHtml(suggestion.translated_name)}</div>` : ''}
      <p>${escapeHtml(suggestion.description)}</p>
    </div>
  `).join('');
  
  // Add click handlers for menu selection
  container.querySelectorAll('.menu-item').forEach(el => {
    el.addEventListener('click', () => {
      container.querySelectorAll('.menu-item').forEach(item => item.classList.remove('selected'));
      el.classList.add('selected');
      document.getElementById('generate-full-recipe-btn').disabled = false;
    });
  });
  
  // 「さらに提案」ボタンを追加
  const moreSuggestionsBtn = document.createElement('button');
  moreSuggestionsBtn.id = 'more-suggestions-btn';
  moreSuggestionsBtn.className = 'btn secondary';
  moreSuggestionsBtn.innerHTML = '🔄 さらに5つ提案してもらう';
  moreSuggestionsBtn.style.marginTop = '15px';
  moreSuggestionsBtn.style.width = '100%';
  
  moreSuggestionsBtn.addEventListener('click', async () => {
    console.log('「さらに提案」ボタンがクリックされました');
    // 追加要望入力モーダルを表示
    showAdditionalRequestModal(moreSuggestionsBtn);
  });
  
  // 既存の「さらに提案」ボタンを削除
  const existingBtn = document.getElementById('more-suggestions-btn');
  if (existingBtn) {
    existingBtn.remove();
  }
  
  // ボタンを追加
  container.appendChild(moreSuggestionsBtn);
  
  console.log('「さらに提案」ボタンを追加しました');
};

// 追加のメニュー提案を生成する関数
const generateMoreMenuSuggestions = async (additionalRequest = '') => {
  console.log('=== 追加提案生成開始 ===');
  console.log('追加リクエスト:', additionalRequest);
  
  const selectedGenreBtn = document.querySelector('.genre-btn.selected');
  if (!selectedGenreBtn) {
    alert('ジャンルを選択してください');
    return;
  }

  const selectedGenre = selectedGenreBtn.dataset.genre;
  const existingIngredients = getExistingIngredients();
  const originalCustomRequest = document.getElementById('custom-request')?.value?.trim() || '';
  
  console.log('選択されたジャンル:', selectedGenre);
  console.log('既存材料:', existingIngredients);
  console.log('保存された材料:', originalIngredients);
  
  // 前の要望と追加の要望を結合
  let combinedRequest = '';
  if (originalCustomRequest && additionalRequest) {
    combinedRequest = `\n追加条件: ${originalCustomRequest}\nさらに追加の要望: ${additionalRequest}`;
  } else if (originalCustomRequest) {
    combinedRequest = `\n追加条件: ${originalCustomRequest}`;
  } else if (additionalRequest) {
    combinedRequest = `\n追加条件: ${additionalRequest}`;
  }
  
  // 既存の提案を取得して、重複を避ける
  const existingSuggestions = Array.from(document.querySelectorAll('.menu-item h4'))
    .map(el => el.textContent.trim())
    .filter(name => name && name.length > 0);
  
  console.log('既存の提案:', existingSuggestions);
  
  let baseIngredient = '';
  // 保存された材料を優先的に使用
  const ingredientsToUse = originalIngredients.length > 0 ? originalIngredients : existingIngredients;
  if (ingredientsToUse.length > 0) {
    baseIngredient = `\n**必須材料**: 以下の材料を必ずすべて使用して創作してください: ${ingredientsToUse.join('、')}。これらの材料を効果的に組み合わせた料理を提案してください。`;
  }
  
  try {
    // ChatGPT APIを呼び出し
    
    const languageName = getLanguageName(selectedGenre);
    // 追加提案用のランダム要素（より多様性を重視）
    const additionalRandomElements = [
      '伝統的な調理法を現代的にアレンジした',
      '異なる食文化の融合を図った',
      '季節の食材を活かした',
      'スパイスやハーブを大胆に使った',
      '食感のコントラストを重視した',
      '見た目の美しさを追求した',
      'ヘルシーで栄養価の高い',
      '簡単で時短できる',
      'クリエイティブで独創的な',
      'エレガントで上品な',
      'スモーキーで香り豊かな',
      '酸味と甘みのバランスを重視した',
      'テクスチャーを活かした',
      '色彩のコントラストを意識した',
      '温かさと冷たさの組み合わせ',
      '異なる食感の層を作った',
      '香辛料を効果的に使った',
      '野菜の甘みを引き出した',
      '肉のうまみを最大限に活かした',
      '魚介類の風味を重視した',
      '豆類の栄養価を活かした',
      '穀物の食感を楽しめる',
      '発酵食品のうまみを活用した',
      'ナッツや種子の香ばしさを活かした',
      'ハーブの香りを際立たせた'
    ];
    
    const selectedAdditionalRandom = additionalRandomElements[Math.floor(Math.random() * additionalRandomElements.length)];
    
    const prompt = `あなたは経験豊富なシェフ兼料理研究家です。${selectedGenre}料理の新しいメニューを5つ提案してください。
${baseIngredient}${combinedRequest}

## 既存提案の分析
既存の提案: ${existingSuggestions.join(', ')}

## 創作方針
**多様性と独創性**: 上記の既存提案とは完全に異なる、新しいアプローチや調理法のメニューを提案してください。以下の要素を意識して、バリエーション豊かな提案をお願いします：

### 調理技術の革新
- **伝統技法の現代的解釈**: 古典的な調理法を現代風にアレンジ
- **新しい調理法**: 燻製、低温調理、真空調理、分子ガストロノミーなど
- **異文化の技法融合**: 異なる食文化の調理技術を組み合わせ
- **季節性の活用**: 旬の食材を活かした調理法

### 味覚の探求
- **味のバランス**: 基本味（甘味、酸味、塩味、苦味、うま味）の新しい組み合わせ
- **香りの演出**: スモーキー、ハーブ、スパイス、柑橘系の効果的な使用
- **地域性の表現**: 和風、洋風、中華風、エスニック風、フュージョン風の新しい解釈
- **温度のコントラスト**: 温かい料理、冷たい料理、温冷の組み合わせ

### 食感の創造
- **テクスチャーの対比**: サクサク、とろとろ、シャキシャキ、ふわふわ、クリーミー、もちもち、パリパリ
- **層の演出**: 異なる食感の層を作る工夫
- **口当たりの工夫**: 滑らかさ、ざらつき、弾力性のバランス

### 視覚的アピール
- **色彩の調和**: 美しい色の組み合わせとコントラスト
- **盛り付けの芸術性**: ミニマル、アート的、伝統的など様々なスタイル
- **プレゼンテーション**: 器との調和、空間の使い方

### 栄養学的配慮
- **栄養バランス**: タンパク質、炭水化物、脂質、ビタミン、ミネラルの最適化
- **ヘルシーな食材**: 野菜、果物、全粒穀物、豆類の効果的な活用
- **機能性食材**: 抗酸化物質、食物繊維、良質な脂質の含有

## 独創性の要求
**重要**: 既存提案と似たような料理名、調理法、味付けは絶対に避けてください。毎回新鮮で驚きのある、独創的な提案をお願いします。既存提案の要素を参考にせず、全く新しいアプローチで創作してください。

### 避けるべき要素
- 既存提案と類似した料理名
- 同じ調理法や技法
- 似たような味付けやスパイス
- 同じ食感の組み合わせ
- 類似した盛り付けスタイル

${existingIngredients.length >= 2 ? `
**材料使用の必須条件**: 指定された材料（${existingIngredients.join('、')}）を必ずすべて使用してください。以下の条件を厳守してください：
- 指定された材料のいずれかが欠けている提案は絶対に作成しないでください
- 各提案で指定材料を効果的に組み合わせて使用してください
- 材料の相性や調理法のバリエーションを考慮して、それぞれ異なるアプローチで創作してください
- 指定材料以外の材料は最小限に留め、指定材料を主役にしてください
- 指定材料の特性（味、食感、栄養価）を活かした料理を提案してください` : ''}

## 料理名の命名規則
**重要**: 料理名は以下の基準で説明的で洗練されたものにしてください：

### 命名の基本原則
- **説明的な料理名**: フレンチレストランのように、調理法や食材を明確に表現
- **日本語と現地語の融合**: 日本語の説明と現地語の専門用語を組み合わせ
- **技法を表現**: 調理法や技法を料理名に反映（例：コンフィ、ブレゼ、グラタン）
- **食材の特徴**: 主食材や特徴的な食材を料理名に含める
- **地域性の表現**: その地域の料理文化を反映した名前
- **専門用語の活用**: 料理の専門用語を適切に使用

### 避けるべき命名
- カタカナのみの名前（例：「コンフィドカナール」）
- 一般的すぎる名前（例：「美味しい○○」「簡単○○」）
- 曖昧な表現（例：「特別な○○」「素晴らしい○○」）
- 現地語のみの名前（日本語の説明がない）

### 推奨する命名パターン
- **日本語 + 現地語**: 「ローストチキンのコンフィ風」「サーモンのブレゼ仕立て」
- **現地語 + 日本語**: 「コンフィ・ド・カナール（鴨のコンフィ）」「ブレゼ・ド・ボー（牛肉のブレゼ）」
- **説明的な日本語**: 「低温調理したサーモンのクリームソース仕立て」「燻製した鴨胸肉の赤ワインソース」

### 専門的な命名例
- **フレンチ**: 「コンフィ・ド・カナール（鴨のコンフィ）」「ブレゼ・ド・ボー（牛肉のブレゼ）」「グラタン・ドフィノワ（じゃがいものグラタン）」「ラタトゥイユ（南仏風野菜の煮込み）」
- **イタリアン**: 「オッソ・ブコ（骨付き牛肉の煮込み）」「カルボナーラ（クリームパスタ）」「リゾット・アッラ・ミラネーゼ（ミラノ風リゾット）」
- **和食**: 「茶碗蒸し（卵とじ蒸し）」「天ぷら（揚げ物）」「すき焼き（牛肉の甘辛煮）」
- **中華**: 「麻婆豆腐（四川風豆腐料理）」「小籠包（上海風蒸し餃子）」「北京ダック（北京風鴨料理）」

**重要**: 材料の分量は必ずgまたはmlで表記してください。大さじ、小さじ、カップなどの単位は使用せず、以下の換算で数値化してください：
- 大さじ1 = 15ml/15g
- 小さじ1 = 5ml/5g  
- カップ1 = 200ml

## 説明文の構成
各メニューの説明は以下の要素を含む簡潔な文章（50文字以内）で作成してください：
- 調理法の特徴（例：低温調理、燻製、分子ガストロノミー）
- 味の特徴（例：酸味、甘み、スパイシー）
- 食感の特徴（例：クリーミー、サクサク、とろける）
- プレゼンテーションの特徴（例：色彩豊か、ミニマル、アート的）

## 多言語対応
各メニュー名を${languageName}語で翻訳してください。翻訳は以下の点に注意してください：
- **現地の伝統的な料理名**: その地域で実際に使われている料理名を使用
- **専門用語の正確性**: 料理の専門用語を正確に翻訳
- **文化的配慮**: 現地の料理文化に配慮した表現
- **発音の正確性**: 現地の発音に近い表記
    
以下のJSON形式で回答してください:
[
  {
    "name": "料理名（日本語）",
    "translated_name": "翻訳された料理名（${languageName}）",
    "description": "料理の説明（日本語）"
  }
]`;

    const generatedText = await callChatGPTAPI(prompt);
    
    if (generatedText) {
      // JSONを抽出
      const jsonMatch = generatedText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[0]);
        if (Array.isArray(suggestions) && suggestions.length > 0) {
          // 既存の提案に追加
          const container = document.getElementById('menu-suggestions');
          const existingItems = container.querySelectorAll('.menu-item');
          const startIndex = existingItems.length;
          
          // 新しい提案を追加
          const newSuggestionsHTML = suggestions.map((suggestion, index) => `
            <div class="menu-item" data-index="${startIndex + index}">
              <h4>${escapeHtml(suggestion.name)}</h4>
              ${suggestion.translated_name ? `<div class="translated-menu-name">${escapeHtml(suggestion.translated_name)}</div>` : ''}
              <p>${escapeHtml(suggestion.description)}</p>
            </div>
          `).join('');
          
          // 既存の「さらに提案」ボタンを一時的に削除
          const moreBtn = document.getElementById('more-suggestions-btn');
          if (moreBtn) {
            moreBtn.remove();
          }
          
          // 新しい提案を挿入
          container.insertAdjacentHTML('beforeend', newSuggestionsHTML);
          
          // 新しい提案にクリックハンドラーを追加
          const newItems = container.querySelectorAll('.menu-item');
          newItems.forEach((el, index) => {
            if (index >= startIndex) {
              el.addEventListener('click', () => {
                container.querySelectorAll('.menu-item').forEach(item => item.classList.remove('selected'));
                el.classList.add('selected');
                document.getElementById('generate-full-recipe-btn').disabled = false;
              });
            }
          });
          
          // 「さらに提案」ボタンを再追加
          // 既存の「さらに提案」ボタンを削除
          const existingMoreBtn = document.getElementById('more-suggestions-btn');
          if (existingMoreBtn) {
            existingMoreBtn.remove();
          }
          
          const newMoreBtn = document.createElement('button');
          newMoreBtn.id = 'more-suggestions-btn';
          newMoreBtn.className = 'btn secondary';
          newMoreBtn.innerHTML = '🔄 さらに5つ提案してもらう';
          newMoreBtn.style.marginTop = '15px';
          newMoreBtn.style.width = '100%';
          
          newMoreBtn.addEventListener('click', async () => {
            console.log('2回目の「さらに提案」ボタンがクリックされました');
            // 追加要望入力モーダルを表示
            showAdditionalRequestModal(newMoreBtn);
          });
          
          container.appendChild(newMoreBtn);
          console.log('新しい「さらに提案」ボタンを追加しました');
          
          console.log('追加提案を生成しました:', suggestions.length, '件');
        } else {
          throw new Error('提案の生成に失敗しました');
        }
      } else {
        throw new Error('提案の生成に失敗しました');
      }
    } else {
      throw new Error('提案の生成に失敗しました');
    }
  } catch (error) {
    console.error('追加提案生成エラー:', error);
    throw error;
  }
};

const generateFullRecipe = async () => {
  const selectedMenu = document.querySelector('.menu-item.selected');
  if (!selectedMenu) {
    alert('メニューを選択してください');
    return;
  }
  
  const menuName = selectedMenu.querySelector('h4').textContent;
  const translatedName = selectedMenu.querySelector('.translated-menu-name')?.textContent || '';
  const existingIngredients = getExistingIngredients();
  
  // 翻訳情報をグローバル変数に保存
  currentTranslatedName = translatedName;
  currentLanguageCode = getLanguageCode(selectedGenre);
  
  // 既存の材料がある場合はそれを含める指示を追加
  let ingredientInstruction = '';
  if (existingIngredients.length > 0) {
    if (existingIngredients.length >= 2) {
      ingredientInstruction = `\n\n※必ず以下の材料をすべて使用してレシピを作成してください: ${existingIngredients.join(', ')}\n複数の材料を効果的に組み合わせ、それぞれの特性を活かした調理法を提案してください。`;
    } else {
      ingredientInstruction = `\n\n※必ず以下の材料を含めてレシピを作成してください: ${existingIngredients.join(', ')}`;
    }
  }
  
  showAIStep('loading');
  
  try {
    const prompt = `あなたは経験豊富なシェフ兼料理研究家です。「${menuName}」の詳細で実用的なレシピを作成してください。${ingredientInstruction}

## レシピ作成の基本方針

### 材料の選択基準
- 入手しやすい食材を中心に構成
- 季節性と旬を考慮した食材選択
- 栄養バランスの良い組み合わせ
- コストパフォーマンスを考慮

### 調理技術の配慮
- 家庭のキッチンで再現可能な技法
- 段階的な手順で分かりやすく説明
- 失敗しにくい調理方法を選択
- 時間効率を考慮した工程

### 味付けと調味料
- 基本味のバランスを重視
- 段階的な味付けで深みを演出
- 香りとスパイスの効果的な使用
- 地域性を活かした調味料の選択

### 分量の精度
- 正確で再現性の高い分量表記
- 大さじ・小さじ・カップは使用せず、g・mlで統一
- 人数分に応じた適切な分量調整

### 手順の詳細化
- 各工程の目的とポイントを明記
- 調理時間と温度の目安を記載
- 失敗の原因と対処法を含める
- 見た目の美しさも考慮した盛り付け

## 出力形式
以下の厳密なJSON形式で回答してください（他の文章は含めない）：

{
  "title": "${menuName}",
  "description": "この料理の特徴、由来、美味しさのポイントを簡潔に説明（50文字以内）",
  "servings": 2,
  "ingredients": [
    {"item": "材料名", "quantity": "分量（数字のみ）", "unit": "単位（gまたはml）"},
    {"item": "材料名", "quantity": "分量（数字のみ）", "unit": "単位（gまたはml）"}
  ],
  "steps": [
    "手順1: 具体的で分かりやすい説明（調理のポイントを含む）",
    "手順2: 具体的で分かりやすい説明（調理のポイントを含む）",
    "手順3: 具体的で分かりやすい説明（調理のポイントを含む）"
  ],
  "notes": "調理のコツ、保存方法、アレンジ方法などの補足情報（50文字以内）"
}

## 品質基準
- **実用性**: 家庭で確実に再現できるレシピ
- **美味しさ**: 味覚的に優れた組み合わせ
- **美しさ**: 視覚的に魅力的な仕上がり
- **栄養価**: 健康的な食材の活用
- **経済性**: コストパフォーマンスの良い材料選択`;

    const content = await callChatGPTAPI(prompt);
    console.log('Raw ChatGPT response:', content);
    
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      console.log('Extracted JSON:', jsonMatch[0]);
      aiGeneratedRecipe = JSON.parse(jsonMatch[0]);
      window.aiGeneratedRecipe = aiGeneratedRecipe;
      console.log('Parsed AI recipe:', aiGeneratedRecipe);
      displayRecipePreview(aiGeneratedRecipe);
      showAIStep(3);
    } else {
      console.error('No JSON found in response:', content);
      throw new Error('レシピの生成に失敗しました');
    }
  } catch (error) {
    alert('レシピ生成に失敗しました: ' + error.message);
    showAIStep(2);
  }
};

const displayRecipePreview = (recipe) => {
  const preview = document.getElementById('recipe-preview');
  const ingredientsList = recipe.ingredients.map(ing => 
    `${ing.item} ${ing.quantity}${ing.unit}`
  ).join('\n');
  
  const stepsList = recipe.steps.map((step, index) => 
    `${index + 1}. ${step}`
  ).join('\n');
  
  preview.textContent = `料理名: ${recipe.title}

説明: ${recipe.description}

人数: ${recipe.servings}人分

材料:
${ingredientsList}

作り方:
${stepsList}`;
};

const applyAIRecipeToForm = async () => {
  const recipe = aiGeneratedRecipe || window.aiGeneratedRecipe;
  if (!recipe) {
    console.error('No AI generated recipe available');
    return;
  }
  
  console.log('=== APPLYING AI RECIPE TO FORM ===');
  console.log('AI Generated Recipe:', recipe);
  
  // Fill form fields
  if (recipe.title) {
    document.getElementById('title').value = recipe.title;
    console.log('Set title:', recipe.title);
  }
  if (recipe.description) {
    document.getElementById('notes').value = recipe.description;
    console.log('Set description:', recipe.description);
  }
  if (recipe.servings) {
    document.getElementById('servings').value = recipe.servings;
    console.log('Set servings:', recipe.servings);
  }
  
  // Clear existing ingredients and steps
  console.log('Clearing existing content...');
  const ingredientsEditor = document.getElementById('ingredientsEditor');
  const stepsEditor = document.getElementById('stepsEditor');
  
  if (ingredientsEditor) {
    ingredientsEditor.innerHTML = '';
    console.log('Cleared ingredients editor');
  } else {
    console.error('ingredientsEditor element not found!');
  }
  
  if (stepsEditor) {
    stepsEditor.innerHTML = '';
    console.log('Cleared steps editor');  
  } else {
    console.error('stepsEditor element not found!');
  }
  
  // Add ingredients with detailed logging
  console.log('=== PROCESSING INGREDIENTS ===');
  console.log('AI Recipe Ingredients:', recipe.ingredients);
  console.log('Ingredients is array?', Array.isArray(recipe.ingredients));
  
  if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
    console.log(`Found ${recipe.ingredients.length} ingredients to add`);
    
    // Add ingredients one by one with proper async handling
    for (let i = 0; i < recipe.ingredients.length; i++) {
      const ing = recipe.ingredients[i];
      console.log(`\n--- Adding ingredient ${i + 1} ---`);
      console.log('Ingredient data:', ing);
      
      // Check if addIngredientRow function exists
      if (typeof addIngredientRow !== 'function') {
        console.error('addIngredientRow function not found!');
        break;
      }
      
      // Add new row
      console.log('Calling addIngredientRow()...');
      addIngredientRow();
      
      // Wait a bit for DOM update
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get the newly added row (last one)
      const rows = document.querySelectorAll('.ingredient-row');
      console.log(`Total ingredient rows after adding: ${rows.length}`);
      const row = rows[rows.length - 1];
      
      if (row) {
        console.log('Found the new row, looking for input elements...');
        const itemInput = row.querySelector('.ingredient-item');
        const qtyInput = row.querySelector('.ingredient-quantity');
        const unitInput = row.querySelector('.ingredient-unit');
        const priceInput = row.querySelector('.ingredient-price');
        
        console.log('Input elements found:', { 
          itemInput: !!itemInput, 
          qtyInput: !!qtyInput, 
          unitInput: !!unitInput,
          priceInput: !!priceInput
        });
        
        if (itemInput) {
          const value = ing.item || ing.ingredient || '';
          itemInput.value = value;
          console.log(`Set item input to: "${value}"`);
        } else {
          console.error('itemInput not found in row!');
        }
        
        // Normalize quantity & unit to ml/g where possible
        const priceInfo = extractPriceInfo(ing.quantity || ing.amount || '', ing.unit || '');
        const normalized = normalizeQuantityUnit(priceInfo.quantity || '', priceInfo.unit || '');
        if (qtyInput) {
          qtyInput.value = normalized.quantity ?? '';
          console.log(`Set quantity input to: "${qtyInput.value}"`);
        }
        if (unitInput) {
          unitInput.value = normalized.unit ?? '';
          console.log(`Set unit input to: "${unitInput.value}"`);
        }

        if (priceInput) {
          const priceValue = (ing.price || priceInfo.price || '').toString().trim();
          priceInput.value = priceValue;
          console.log(`Set price input to: "${priceValue}"`);
        }
        
        console.log(`✅ Successfully processed ingredient ${i + 1}`);
      } else {
        console.error(`❌ Could not find row for ingredient ${i + 1}`);
      }
    }
    
    console.log('=== INGREDIENTS PROCESSING COMPLETE ===');
  } else {
    console.log('No valid ingredients array found');
  }
  
  // Add steps
  console.log('=== PROCESSING STEPS ===');
  console.log('AI Recipe Steps:', recipe.steps);
  console.log('Steps is array?', Array.isArray(recipe.steps));
  
  if (recipe.steps && Array.isArray(recipe.steps)) {
    console.log(`Found ${recipe.steps.length} steps to add`);
    
    // Add all step rows first
    for (let i = 0; i < recipe.steps.length; i++) {
      console.log(`Adding step ${i + 1}:`, recipe.steps[i]);
      addStepRow({ instruction: recipe.steps[i] });
      // Wait a bit between each addition
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Wait for DOM update
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Try multiple selectors to find step inputs (textarea elements)
    let stepRows = document.querySelectorAll('.step-row textarea.step-text');
    console.log(`Found ${stepRows.length} step textarea elements with .step-row textarea.step-text`);
    
    // If no elements found, try alternative selectors
    if (stepRows.length === 0) {
      stepRows = document.querySelectorAll('#stepsEditor textarea.step-text');
      console.log(`Found ${stepRows.length} step textarea elements with #stepsEditor textarea.step-text`);
    }
    
    if (stepRows.length === 0) {
      stepRows = document.querySelectorAll('#stepsEditor textarea');
      console.log(`Found ${stepRows.length} textarea elements in #stepsEditor`);
    }
    
    recipe.steps.forEach((step, index) => {
      if (stepRows[index]) {
        let stepText = '';
        
        // 文字列の場合
        if (typeof step === 'string') {
          stepText = step;
        }
        // オブジェクトの場合（翻訳データ形式）
        else if (typeof step === 'object' && step.text) {
          stepText = step.text;
        }
        // その他の場合
        else {
          stepText = (step || '').toString();
        }
        
        // 既存の番号を除去（例：「1. 手順内容」→「手順内容」）
        stepText = stepText.replace(/^\d+\.\s*/, '');
        
        stepRows[index].value = stepText;
        console.log(`Set step ${index + 1} to: "${stepText}"`);
      } else {
        console.error(`Could not find step input for index ${index}`);
      }
    });
    
    console.log('=== STEPS PROCESSING COMPLETE ===');
  } else {
    console.log('No valid steps array found');
  }
  
  // Reset AI modal to step 1
  showAIStep(1);
  
  // AI創作完了ボタンを表示
  const aiSaveButton = document.querySelector('.js-ai-save-options');
  if (aiSaveButton) {
    aiSaveButton.style.display = 'inline-block';
    console.log('AI創作完了ボタンを表示しました');
  }
  
  // AI創作完了後の保存選択肢を表示（少し遅延させて確実に実行）
  setTimeout(() => {
    showAISaveOptions();
  }, 500);
  
  // カスタムイベントも発火（バックアップ用）
  const event = new CustomEvent('aiRecipeApplied', {
    detail: { recipe: recipe }
  });
  document.dispatchEvent(event);
};

// AI創作完了後の保存選択肢を表示
const showAISaveOptions = () => {
  console.log('=== AI創作完了 - 保存選択肢を表示 ===');
  
  const currentRecipeId = new URLSearchParams(window.location.search).get('id');
  console.log('現在のレシピID:', currentRecipeId);
  
  if (currentRecipeId) {
    // 既存レシピの場合は上書き/新規保存の選択肢を表示
    console.log('既存レシピの編集 - 選択肢を表示');
    
    const modal = document.getElementById('ai-save-options-modal');
    if (modal) {
      modal.style.display = 'flex';
    }
  } else {
    // 新規レシピの場合は自動保存
    console.log('新規レシピ作成 - 自動新規保存');
    saveAndReturnToIndex('new');
  }
};

// AI創作用の保存関数（リダイレクトなし）
const saveRecipeForAI = async () => {
  try {
    const params = new URLSearchParams(window.location.search);
    const recipeId = params.get('id');
    
    const title = document.getElementById('title')?.value?.trim();
    if (!title) return alert('料理名を入力してください。');
    
    // 材料データの取得
    const ingredientRows = document.querySelectorAll('.ingredient-row');
    const ingredients = Array.from(ingredientRows).map((row, index) => {
      const item = row.querySelector('.ingredient-item')?.value?.trim();
      const quantityRaw = row.querySelector('.ingredient-quantity')?.value?.trim();
      const unit = row.querySelector('.ingredient-unit')?.value?.trim();
      const price = row.querySelector('.ingredient-price')?.value?.trim();
      const quantity = quantityRaw !== '' ? quantityRaw : null;
      return item ? { 
        position: index + 1, 
        item, 
        quantity, 
        unit: unit || null,
        price: price ? parseFloat(price) : null
      } : null;
    }).filter(Boolean);
    
    // 手順データの取得
    const stepRows = document.querySelectorAll('.step-row');
    console.log('AI創作: Found step rows:', stepRows.length);

    const steps = [];
    stepRows.forEach((row, index) => {
      const textArea = row.querySelector('.step-text');
      const instruction = textArea?.value?.trim();
      console.log(`AI創作: Processing step ${index + 1}:`, {
        instruction,
        element: row,
        textArea: textArea,
        hasValue: !!instruction,
        valueLength: instruction ? instruction.length : 0
      });

      if (instruction && instruction.length > 0) {
        const stepData = {
          step_number: index + 1,
          position: index + 1,
          instruction: instruction
        };
        console.log(`AI創作: ✅ Adding step ${index + 1}:`, stepData);
        steps.push(stepData);
      } else {
        console.log(`AI創作: ❌ Skipping empty step ${index + 1}`);
      }
    });

    console.log('AI創作: Collected steps:', steps);
    
    // レシピデータの構築
    const recipeData = {
      title,
      category: selectedCategories.length > 0 ? selectedCategories.join(', ') : 'その他',
      tags: selectedTags.length > 0 ? selectedTags : null,
      notes: document.getElementById('notes')?.value?.trim() || null,
      source_url: document.getElementById('sourceUrl')?.value?.trim() || null,
      is_ai_generated: true, // AI創作レシピはtrue
      is_groq_generated: false // AI創作レシピはChatGPTを使用するためfalse
    };
    
    if (document.getElementById('servings')?.value) {
      recipeData.servings = parseInt(document.getElementById('servings').value);
    }
    
    // レシピの保存
    let result;
    if (recipeId) {
      result = await sb.from('recipes').update(recipeData).eq('id', recipeId).select('id').single();
    } else {
      result = await sb.from('recipes').insert(recipeData).select('id').single();
    }
    
    if (result.error) {
      console.error('レシピ保存エラー:', result.error);
      throw new Error(`レシピ保存に失敗しました: ${result.error.message}`);
    }
    
    const savedId = result.data.id;
    console.log('AI創作レシピ保存成功. ID:', savedId);
    
    // 材料と手順の保存
    await sb.from('recipe_ingredients').delete().eq('recipe_id', savedId);
    await sb.from('recipe_steps').delete().eq('recipe_id', savedId);
    
    if (ingredients.length > 0) {
      const payload = ingredients.map(ing => ({
        recipe_id: savedId,
        position: ing.position,
        item: ing.item,
        quantity: ing.quantity,
        unit: ing.unit,
        price: ing.price
      }));
      const { error: ingredientError } = await sb.from('recipe_ingredients').insert(payload);
      if (ingredientError) {
        console.error('Insert ingredients failed:', ingredientError);
        throw ingredientError;
      }
    }
    
    console.log('💾 About to save steps:', steps.length);
    if (steps.length > 0) {
      const stepPayload = steps.map((step, index) => ({
        recipe_id: savedId,
        step_number: step.step_number || (index + 1),
        instruction: step.instruction || ''
      }));
      console.log('💾 Step payload:', stepPayload);

      const { error: stepError } = await sb.from('recipe_steps').insert(stepPayload);
      if (stepError) {
        console.error('❌ 手順保存エラー:', stepError);

        // 最小限のデータで再試行
        console.log('🔄 Retrying steps with minimal format...');
        const minimal = steps.map((step, index) => ({
          recipe_id: savedId,
          step_number: index + 1,
          instruction: step.instruction || ''
        }));
        console.log('🔄 Minimal step payload:', minimal);

        const { error: retryErr } = await sb.from('recipe_steps').insert(minimal);
        if (retryErr) {
          console.error('❌ Minimal step insert also failed:', retryErr);
          alert('手順の保存に失敗しました: ' + retryErr.message);
        } else {
          console.log('✅ 手順保存成功（minimal format）');
        }
      } else {
        console.log('✅ 手順保存成功（normal format）');
      }
    }
    
    console.log('AI創作レシピの保存が完了しました');
    
  } catch (error) {
    console.error('AI創作レシピ保存エラー:', error);
    throw error;
  }
};

// 保存してトップページに戻る
// 保存処理の重複実行防止フラグ
let isSaving = false;

const saveAndReturnToIndex = async (saveType) => {
  // 重複実行防止
  if (isSaving) {
    console.log('保存処理が既に実行中です。重複実行を防止します。');
    return;
  }
  
  isSaving = true;
  
  try {
    console.log(`AI創作レシピを${saveType === 'overwrite' ? '上書き' : '新規'}保存中...`);
    
    if (saveType === 'new') {
      // 新規保存の場合は、URLからIDを削除して新規レシピとして保存
      const url = new URL(window.location);
      url.searchParams.delete('id');
      window.history.replaceState({}, '', url);
    }
    
    // AI創作用の保存処理を実行（リダイレクトなし）
    await saveRecipeForAI();
    
    // AI創作完了ボタンを非表示
    const aiSaveButton = document.querySelector('.js-ai-save-options');
    if (aiSaveButton) {
      aiSaveButton.style.display = 'none';
    }
    
    // 新規創作の場合は成功ポップアップを表示
    if (saveType === 'new') {
      showAISuccessNotification();
      // ポップアップ表示後に少し待ってからリダイレクト
      setTimeout(() => {
        window.location.href = '../index.html';
      }, 2000);
    } else {
      // 上書きの場合は即座にリダイレクト
      window.location.href = '../index.html';
    }
    
  } catch (error) {
    console.error('AI創作レシピの保存エラー:', error);
    alert('保存に失敗しました: ' + error.message);
  } finally {
    // 保存処理完了時にフラグをリセット
    isSaving = false;
  }
};

// AI創作成功通知を表示
const showAISuccessNotification = () => {
  // 成功通知ポップアップを作成
  const notification = document.createElement('div');
  notification.id = 'ai-success-notification';
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: linear-gradient(135deg, #4CAF50, #45a049);
    color: white;
    padding: 2rem 3rem;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    z-index: 10000;
    text-align: center;
    font-family: 'Hiragino Sans', 'Yu Gothic UI', 'Meiryo UI', sans-serif;
    animation: aiSuccessFadeIn 0.5s ease-out;
  `;
  
  notification.innerHTML = `
    <div style="font-size: 3rem; margin-bottom: 1rem;">🎉</div>
    <h2 style="margin: 0 0 0.5rem 0; font-size: 1.5rem; font-weight: 600;">レシピを登録しました！</h2>
    <p style="margin: 0; font-size: 1rem; opacity: 0.9;">AI創作レシピが正常に保存されました</p>
  `;
  
  // CSS アニメーションを追加
  const style = document.createElement('style');
  style.textContent = `
    @keyframes aiSuccessFadeIn {
      from {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.8);
      }
      to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }
  `;
  document.head.appendChild(style);
  
  // ポップアップを表示
  document.body.appendChild(notification);
  
  // 2秒後に自動でフェードアウト
  setTimeout(() => {
    notification.style.animation = 'aiSuccessFadeIn 0.3s ease-out reverse';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    }, 300);
  }, 1700);
};

// 追加要望入力モーダルを表示
const showAdditionalRequestModal = (button) => {
  console.log('showAdditionalRequestModal が呼び出されました');
  const modal = document.getElementById('additional-request-modal');
  const input = document.getElementById('additional-request-input');
  
  console.log('モーダル要素:', modal);
  console.log('入力要素:', input);
  
  if (modal && input) {
    // ボタンの参照を保存
    window.currentMoreSuggestionsButton = button;
    console.log('ボタンの参照を保存しました:', button);
    console.log('保存されたボタンの参照:', window.currentMoreSuggestionsButton);
    
    // 入力フィールドをクリア
    input.value = '';
    
    // モーダルを表示
    modal.style.display = 'flex';
    console.log('モーダルを表示しました');
    
    // 入力フィールドにフォーカス
    setTimeout(() => {
      input.focus();
    }, 100);
  } else {
    console.error('モーダルまたは入力要素が見つかりません');
  }
};

// 追加要望入力モーダルを非表示
const hideAdditionalRequestModal = () => {
  const modal = document.getElementById('additional-request-modal');
  if (modal) {
    modal.style.display = 'none';
  }
  // ボタンの参照をクリア
  window.currentMoreSuggestionsButton = null;
};

// 追加提案を実行
const executeMoreSuggestions = async (button, additionalRequest) => {
  console.log('executeMoreSuggestions 開始');
  console.log('ボタン:', button);
  console.log('追加リクエスト:', additionalRequest);
  
  button.disabled = true;
  button.innerHTML = '⏳ 生成中...';
  
  try {
    console.log('generateMoreMenuSuggestions を呼び出します');
    await generateMoreMenuSuggestions(additionalRequest);
    console.log('generateMoreMenuSuggestions 完了');
  } catch (error) {
    console.error('追加提案生成エラー:', error);
    alert('追加提案の生成に失敗しました: ' + error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = '🔄 さらに5つ提案してもらう';
    console.log('executeMoreSuggestions 終了');
  }
};

const showAIStep = (step) => {
  // Hide all steps
  document.getElementById('ai-step-1').style.display = 'none';
  document.getElementById('ai-step-2').style.display = 'none';
  document.getElementById('ai-step-3').style.display = 'none';
  document.getElementById('ai-loading').style.display = 'none';
  
  // Show selected step
  if (step === 'loading') {
    document.getElementById('ai-loading').style.display = 'block';
  } else {
    document.getElementById(`ai-step-${step}`).style.display = 'block';
  }
};


  // AI創作完了イベントのリスナーを追加（重複保存を防ぐため、イベントリスナーは削除）
  // document.addEventListener('aiRecipeApplied', (event) => {
  //   console.log('AI創作完了イベントを受信:', event.detail);
  //   // バックアップとして、イベントでも保存選択肢を表示
  //   setTimeout(() => {
  //     showAISaveOptions();
  //   }, 1000);
  // });

  // 追加要望入力モーダルのイベントリスナー
  document.getElementById('additional-request-cancel')?.addEventListener('click', () => {
    console.log('キャンセルボタンがクリックされました');
    hideAdditionalRequestModal();
  });

  document.getElementById('additional-request-confirm')?.addEventListener('click', () => {
    console.log('「提案を生成」ボタンがクリックされました');
    const input = document.getElementById('additional-request-input');
    const additionalRequest = input ? input.value.trim() : '';
    console.log('追加リクエスト:', additionalRequest);
    
    // ボタンの参照を取得してからモーダルを閉じる
    const button = window.currentMoreSuggestionsButton;
    console.log('ボタンの参照:', button);
    
    hideAdditionalRequestModal();
    
    if (button) {
      console.log('executeMoreSuggestions を実行します');
      executeMoreSuggestions(button, additionalRequest);
    } else {
      console.error('ボタンの参照が見つかりません');
    }
  });

  // モーダル外クリックで閉じる
  document.getElementById('additional-request-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'additional-request-modal') {
      console.log('モーダル外クリックで閉じます');
      hideAdditionalRequestModal();
    }
  });

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing app...');
  try {
    // 設定を移行
    Settings.migrateSettings();
    
    initializeApp();
    console.log('App initialized successfully');
  } catch (error) {
    console.error('Error initializing app:', error);
  }
});
