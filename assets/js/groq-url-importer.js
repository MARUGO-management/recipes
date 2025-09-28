/**
 * Groq専用URL取り込み機能
 * 高速なLLM APIとしてGroqを使用したレシピ抽出
 * データベーステーブルへの挿入方法を指定可能
 */

// 設定を読み込む関数
const getSettings = () => {
  try {
   const stored = localStorage.getItem('recipe-box-settings');
   const defaultSettings = {
     aiApi: 'groq',
      groqModel: 'llama-3.1-8b-instant'
    };
    return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings;
  } catch (error) {
    console.error('設定の読み込みエラー:', error);
   return {
     aiApi: 'groq',
      groqModel: 'llama-3.1-8b-instant'
    };
  }
};

// 現在のGroqモデルを取得する関数（URL取り込み・レシピ編集用）
const getCurrentGroqModel = () => {
  const settings = getSettings();
  const model = settings.groqModel || 'meta-llama/llama-4-scout-17b-16e-instruct';
  
  // 無効なモデルの場合はデフォルトに戻す
  const validModels = ['llama-3.1-8b-instant', 'llama-3.1-70b-8192', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'meta-llama/llama-4-scout-17b-16e-instruct'];
  if (!validModels.includes(model)) {
    console.warn('⚠️ 無効なモデルです。meta-llama/llama-4-scout-17b-16e-instructに切り替えます。');
    return 'meta-llama/llama-4-scout-17b-16e-instruct';
  }
  
  return model;
};

class GroqUrlImporter {
  constructor() {
    this.supabaseUrl = window.APP_CONFIG?.SUPABASE_URL;
    this.supabaseKey = window.APP_CONFIG?.SUPABASE_ANON_KEY;
    this.isProcessing = false;
    
だ    console.log('🔧 GroqUrlImporter初期化:');
    console.log('  - SUPABASE_URL:', this.supabaseUrl);
    console.log('  - SUPABASE_ANON_KEY:', this.supabaseKey ? '設定済み' : '未設定');
    
    // デフォルトのテーブル設定
    this.tableConfig = {
      recipes: {
        enabled: true,
        fields: {
          title: 'title',
          description: 'description',
          category: 'category',
          tags: 'tags',
          source_url: 'source_url',
          created_at: 'created_at',
          updated_at: 'updated_at'
        }
      },
      recipe_ingredients: {
        enabled: true,
        fields: {
          recipe_id: 'recipe_id',
          ingredient: 'item',
          quantity: 'quantity',
          unit: 'unit',
          position: 'position',
          created_at: 'created_at'
        }
      },
      recipe_steps: {
        enabled: true,
        fields: {
          recipe_id: 'recipe_id',
          step_number: 'step_number',
          instruction: 'instruction',
          position: 'position',
          created_at: 'created_at'
        }
      }
    };
  }

  /**
   * テーブル設定を更新
   * @param {Object} config - テーブル設定
   */
  setTableConfig(config) {
    this.tableConfig = { ...this.tableConfig, ...config };
    console.log('📊 テーブル設定を更新:', this.tableConfig);
  }

  /**
   * 特定のテーブルを有効/無効にする
   * @param {string} tableName - テーブル名
   * @param {boolean} enabled - 有効/無効
   */
  setTableEnabled(tableName, enabled) {
    if (this.tableConfig[tableName]) {
      this.tableConfig[tableName].enabled = enabled;
      console.log(`📊 テーブル ${tableName} を ${enabled ? '有効' : '無効'} に設定`);
    }
  }

  /**
   * フィールドマッピングを設定
   * @param {string} tableName - テーブル名
   * @param {Object} fieldMapping - フィールドマッピング
   */
  setFieldMapping(tableName, fieldMapping) {
    if (this.tableConfig[tableName]) {
      this.tableConfig[tableName].fields = { ...this.tableConfig[tableName].fields, ...fieldMapping };
      console.log(`📊 テーブル ${tableName} のフィールドマッピングを更新:`, fieldMapping);
    }
  }

  /**
   * URLからレシピを抽出してデータベースに保存
   * @param {string} url - レシピサイトのURL
   * @param {Object} options - オプション設定
   * @returns {Promise<Object>} 保存されたレシピデータ
   */
  async extractAndSaveRecipe(url, options = {}) {
    if (this.isProcessing) {
      throw new Error('既に処理中です。しばらくお待ちください。');
    }

    this.isProcessing = true;
    
    try {
      console.log('🚀 Groq URL取り込み開始:', url);
      
      // 1. HTMLを取得
      const html = await this.fetchHtmlFromUrl(url);
      console.log('📄 HTML取得完了:', html.length, '文字');
      
      // 2. Groq APIでレシピ抽出
      const recipeData = await this.extractRecipeWithGroq(html, url, options);
      console.log('✅ レシピ抽出完了:', recipeData.title);
      
      // 3. データベースに保存
      const savedRecipe = await this.saveToDatabase(recipeData);
      console.log('💾 データベース保存完了:', savedRecipe.id);
      
      return savedRecipe;
      
    } catch (error) {
      console.error('❌ Groq URL取り込みエラー:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * URLからレシピを抽出（保存なし）
   * @param {string} url - レシピサイトのURL
   * @param {Object} options - オプション設定
   * @returns {Promise<Object>} 抽出されたレシピデータ
   */
  async extractRecipeFromUrl(url, options = {}) {
    if (this.isProcessing) {
      throw new Error('既に処理中です。しばらくお待ちください。');
    }

    this.isProcessing = true;
    
    try {
      console.log('🚀 Groq URL取り込み開始:', url);
      
      // 1. HTMLを取得
      const html = await this.fetchHtmlFromUrl(url);
      console.log('📄 HTML取得完了:', html.length, '文字');
      
      // 2. Groq APIでレシピ抽出
      const recipeData = await this.extractRecipeWithGroq(html, url, options);
      console.log('✅ レシピ抽出完了:', recipeData.title);
      
      return recipeData;
      
    } catch (error) {
      console.error('❌ Groq URL取り込みエラー:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * URLからHTMLを取得
   * @param {string} url - 対象URL
   * @returns {Promise<string>} HTMLコンテンツ
   */
  async fetchHtmlFromUrl(url) {
    if (window.proxyManager) {
      return await window.proxyManager.fetchHtml(url);
    } else {
      throw new Error('ProxyManagerが読み込まれていません。proxy-manager.jsを読み込んでください。');
    }
  }

  /**
   * Groq APIを使用してレシピを抽出
   * @param {string} html - HTMLコンテンツ
   * @param {string} url - 元URL
   * @param {Object} options - オプション
   * @returns {Promise<Object>} 抽出されたレシピデータ
   */
  async extractRecipeWithGroq(html, url, options = {}) {
    const {
      model = getCurrentGroqModel(),
      maxTokens = 4096,
      temperature = 0.0,
      includeNutrition = false,
      includeTips = false
    } = options;

    console.log('⚡ Groq APIでレシピ抽出開始');
    console.log(`📊 設定: モデル=${model}, 最大トークン=${maxTokens}, 温度=${temperature}`);

    const response = await fetch(`${this.supabaseUrl}/functions/v1/call-groq-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.supabaseKey}`,
      },
      body: JSON.stringify({
        text: html.substring(0, 8000), // トークン制限のため制限
        url: url,
        mode: 'recipe_extraction',
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        include_nutrition: includeNutrition,
        include_tips: includeTips
      })
    });

    console.log('📡 Groq API レスポンスステータス:', response.status);
    console.log('📡 Groq API レスポンスヘッダー:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Groq API呼び出しエラー:', errorText);
      throw new Error(`Groq API呼び出しエラー: ${response.status} - ${errorText}`);
    }

    let result;
    try {
      result = await response.json();
      console.log('📋 Groq API レスポンス全体:', result);
    } catch (jsonError) {
      console.error('❌ JSON解析エラー:', jsonError);
      const responseText = await response.text();
      console.error('📄 レスポンステキスト:', responseText);
      throw new Error(`JSON解析に失敗しました: ${jsonError.message}`);
    }
    
    if (!result.success) {
      throw new Error(result.error || 'Groq API呼び出しに失敗しました');
    }

    console.log('✅ Groq API抽出完了:', result.data);
    return result.data;
  }


  /**
   * レシピデータをデータベースに保存
   * @param {Object} recipeData - レシピデータ
   * @returns {Promise<Object>} 保存されたレシピデータ
   */
  async saveToDatabase(recipeData) {
    console.log('💾 データベース保存開始');
    
    try {
      const sb = window.supabase?.createClient(this.supabaseUrl, this.supabaseKey);
      if (!sb) {
        throw new Error('Supabaseクライアントが初期化されていません');
      }

      let savedRecipe = null;

      // 1. recipesテーブルに保存
      if (this.tableConfig.recipes.enabled) {
        console.log('📝 recipesテーブルに保存中...');
        
        const recipeRecord = this.mapRecipeData(recipeData);
        const { data: recipeResult, error: recipeError } = await sb
          .from('recipes')
          .insert(recipeRecord)
          .select()
          .single();

        if (recipeError) {
          throw new Error(`recipesテーブル保存エラー: ${recipeError.message}`);
        }

        savedRecipe = recipeResult;
        console.log('✅ recipesテーブル保存完了:', savedRecipe.id);
      }

      // 2. recipe_ingredientsテーブルに保存
      if (this.tableConfig.recipe_ingredients.enabled && savedRecipe) {
        console.log('📝 recipe_ingredientsテーブルに保存中...');
        
        const ingredients = recipeData.ingredients.map((ing, index) => ({
          recipe_id: savedRecipe.id,
          ingredient: ing.item || ing.name || ing.ingredient || "",
          quantity: ing.quantity || ing.amount || ing.qty || "",
          unit: ing.unit || ing.measure || "",
          position: index,
          created_at: new Date().toISOString()
        }));

        const { error: ingredientsError } = await sb
          .from('recipe_ingredients')
          .insert(ingredients);

        if (ingredientsError) {
          console.warn('⚠️ recipe_ingredientsテーブル保存エラー:', ingredientsError.message);
        } else {
          console.log('✅ recipe_ingredientsテーブル保存完了:', ingredients.length, '件');
        }
      }

      // 3. recipe_stepsテーブルに保存
      if (this.tableConfig.recipe_steps.enabled && savedRecipe) {
        console.log('📝 recipe_stepsテーブルに保存中...');
        
        const steps = recipeData.steps.map((step, index) => ({
          recipe_id: savedRecipe.id,
          step_number: step.step_number || step.number || index + 1,
          instruction: step.step || step.instruction || step.text || step,
          position: index,
          created_at: new Date().toISOString()
        }));

        const { error: stepsError } = await sb
          .from('recipe_steps')
          .insert(steps);

        if (stepsError) {
          console.warn('⚠️ recipe_stepsテーブル保存エラー:', stepsError.message);
        } else {
          console.log('✅ recipe_stepsテーブル保存完了:', steps.length, '件');
        }
      }

      // 4. 関連データを追加
      if (savedRecipe) {
        savedRecipe.ingredients = recipeData.ingredients;
        savedRecipe.steps = recipeData.steps;
        savedRecipe.extracted_by = 'groq';
        savedRecipe.model = recipeData.model;
      }

      console.log('💾 データベース保存完了');
      return savedRecipe;

    } catch (error) {
      console.error('❌ データベース保存エラー:', error);
      throw error;
    }
  }

  /**
   * レシピデータをテーブル用にマッピング
   * @param {Object} recipeData - レシピデータ
   * @returns {Object} マッピングされたレシピデータ
   */
  mapRecipeData(recipeData) {
    const now = new Date().toISOString();
    
    return {
      title: recipeData.title,
      description: recipeData.description,
      category: recipeData.category,
      tags: JSON.stringify(recipeData.tags),
      source_url: recipeData.source_url,
      created_at: now,
      updated_at: now
    };
  }

  /**
   * カスタムテーブルに保存
   * @param {string} tableName - テーブル名
   * @param {Object} data - 保存するデータ
   * @returns {Promise<Object>} 保存結果
   */
  async saveToCustomTable(tableName, data) {
    console.log(`💾 カスタムテーブル ${tableName} に保存中...`);
    
    try {
      const sb = window.supabase?.createClient(this.supabaseUrl, this.supabaseKey);
      if (!sb) {
        throw new Error('Supabaseクライアントが初期化されていません');
      }

      const { data: result, error } = await sb
        .from(tableName)
        .insert(data)
        .select()
        .single();

      if (error) {
        throw new Error(`${tableName}テーブル保存エラー: ${error.message}`);
      }

      console.log(`✅ カスタムテーブル ${tableName} 保存完了:`, result.id);
      return result;

    } catch (error) {
      console.error(`❌ カスタムテーブル ${tableName} 保存エラー:`, error);
      throw error;
    }
  }

  /**
   * 利用可能なGroqモデル一覧を取得
   * @returns {Array} モデル一覧
   */
  getAvailableModels() {
    return [
      {
        id: 'penai/gpt-oss-120b',
        name: 'Llama 3.1 8B Instant',
        description: '高速・軽量モデル（推奨）',
        maxTokens: 2048,
        speed: 'fast'
      },
      {
        id: 'penai/gpt-oss-120b',
        name: 'Llama 3.1 70B Versatile',
        description: '高精度・大容量モデル',
        maxTokens: 4096,
        speed: 'slow'
      },
      {
        id: 'mixtral-8x7b-32768',
        name: 'Mixtral 8x7B',
        description: 'バランス型モデル',
        maxTokens: 32768,
        speed: 'medium'
      },
      {
        id: 'gemma-7b-it',
        name: 'Gemma 7B IT',
        description: 'Google製軽量モデル',
        maxTokens: 2048,
        speed: 'fast'
      }
    ];
  }

  /**
   * Groq APIの接続テスト
   * @returns {Promise<Object>} テスト結果
   */
  async testConnection() {
    try {
      console.log('🧪 Groq API接続テスト開始');
      
      const response = await fetch(`${this.supabaseUrl}/functions/v1/call-groq-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseKey}`,
        },
        body: JSON.stringify({
          mode: 'test'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'テストに失敗しました');
      }

      console.log('✅ Groq API接続テスト成功:', result.data);
      return {
        success: true,
        data: result.data,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Groq API接続テスト失敗:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * バッチ処理でURLリストからレシピを抽出
   * @param {Array<string>} urls - URLリスト
   * @param {Object} options - オプション
   * @returns {Promise<Array>} 抽出結果リスト
   */
  async batchExtractRecipes(urls, options = {}) {
    const { delay = 2000, maxConcurrent = 3 } = options;
    const results = [];
    
    console.log(`🔄 バッチ処理開始: ${urls.length}件のURL`);
    
    for (let i = 0; i < urls.length; i += maxConcurrent) {
      const batch = urls.slice(i, i + maxConcurrent);
      
      const batchPromises = batch.map(async (url, index) => {
        try {
          console.log(`📝 処理中 (${i + index + 1}/${urls.length}): ${url}`);
          const result = await this.extractRecipeFromUrl(url, options);
          return { url, success: true, data: result };
        } catch (error) {
          console.error(`❌ 処理失敗 (${i + index + 1}/${urls.length}): ${url}`, error);
          return { url, success: false, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // 次のバッチまでの待機
      if (i + maxConcurrent < urls.length) {
        console.log(`⏳ ${delay}ms待機中...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    console.log(`✅ バッチ処理完了: ${successCount}/${urls.length}件成功`);
    
    return results;
  }

  /**
   * 処理状態を取得
   * @returns {boolean} 処理中かどうか
   */
  isProcessingNow() {
    return this.isProcessing;
  }

  /**
   * 処理をキャンセル
   */
  cancel() {
    this.isProcessing = false;
    console.log('🛑 Groq URL取り込みをキャンセルしました');
  }
}

// グローバルインスタンスを作成
window.groqUrlImporter = new GroqUrlImporter();

// 便利な関数をグローバルに公開
window.extractRecipeWithGroq = (url, options) => window.groqUrlImporter.extractRecipeFromUrl(url, options);
window.extractAndSaveRecipeWithGroq = (url, options) => window.groqUrlImporter.extractAndSaveRecipe(url, options);
window.getGroqModels = () => window.groqUrlImporter.getAvailableModels();

// テーブル設定関数
window.setGroqTableConfig = (config) => window.groqUrlImporter.setTableConfig(config);
window.setGroqTableEnabled = (tableName, enabled) => window.groqUrlImporter.setTableEnabled(tableName, enabled);
window.setGroqFieldMapping = (tableName, fieldMapping) => window.groqUrlImporter.setFieldMapping(tableName, fieldMapping);
window.saveToGroqCustomTable = (tableName, data) => window.groqUrlImporter.saveToCustomTable(tableName, data);

// デバッグ関数
window.debugGroqResponse = async (url) => {
  try {
    console.log('🔍 Groq APIレスポンスデバッグ開始:', url);
    
    const html = await window.groqUrlImporter.fetchHtmlFromUrl(url);
    console.log('📄 HTML取得完了:', html.length, '文字');
    
    const response = await fetch(`${window.groqUrlImporter.supabaseUrl}/functions/v1/call-groq-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window.groqUrlImporter.supabaseKey}`,
      },
      body: JSON.stringify({
        text: html.substring(0, 8000),
        url: url,
        mode: 'recipe_extraction',
        model: getCurrentGroqModel()
      })
    });

    console.log('📡 レスポンスステータス:', response.status);
    console.log('📡 レスポンスヘッダー:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('📄 生レスポンステキスト:', responseText);
    
    try {
      const jsonData = JSON.parse(responseText);
      console.log('✅ JSON解析成功:', jsonData);
      return jsonData;
    } catch (jsonError) {
      console.error('❌ JSON解析失敗:', jsonError);
      console.log('📄 解析失敗したテキスト:', responseText);
      return { error: 'JSON解析失敗', rawText: responseText };
    }
    
  } catch (error) {
    console.error('❌ デバッグエラー:', error);
    return { error: error.message };
  }
};

console.log('⚡ Groq URL Importer loaded with database integration and debug tools');
