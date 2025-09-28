document.addEventListener('DOMContentLoaded', () => {
    if (typeof supabase === 'undefined') {
        alert('エラー: Supabaseライブラリの読み込みに失敗しました。');
        return;
    }

    // 設定管理は settings-manager.js にてグローバルな Settings オブジェクトとして提供

    // 設定モーダルの管理
    const setupSettingsModal = () => {
        const settingsBtn = document.querySelector('.js-settings');
        const settingsModal = document.getElementById('settings-modal');
        const settingsClose = document.getElementById('settings-modal-close');
        const settingsSave = document.getElementById('settings-save');
        const settingsCancel = document.getElementById('settings-cancel');
        
        if (!settingsBtn || !settingsModal) {
            console.error('❌ 設定ボタンまたはモーダルが見つかりません:', {
                settingsBtn: !!settingsBtn,
                settingsModal: !!settingsModal
            });
            return;
        }
        
        console.log('✅ 設定ボタンとモーダルが見つかりました');
        
        // 設定ボタンクリック
        settingsBtn.addEventListener('click', () => {
            console.log('🔧 設定ボタンがクリックされました');
            const currentSettings = Settings.get();
            
            // 設定の詳細をログ出力
            console.log('📊 現在の設定詳細:', {
                aiApi: currentSettings.aiApi,
                groqModel: currentSettings.groqModel,
                aiCreativeApi: currentSettings.aiCreativeApi,
                timestamp: new Date().toISOString()
            });
            
            // 現在の設定を反映
            const groqRadio = document.querySelector('input[name="ai-api"][value="groq"]');
            const chatgptRadio = document.querySelector('input[name="ai-api"][value="chatgpt"]');
            
            console.log('🔧 AI API設定を適用中:', currentSettings.aiApi);
            if (currentSettings.aiApi === 'chatgpt') {
                chatgptRadio.checked = true;
                console.log('✅ ChatGPT APIが選択されました');
            } else {
                groqRadio.checked = true;
                console.log('✅ Groq APIが選択されました');
            }
            
            // Groqモデルの設定を反映
            const groqModelRadios = document.querySelectorAll('input[name="groq-model"]');
            console.log('🔧 Groqモデル設定を適用中:', currentSettings.groqModel);
            groqModelRadios.forEach(radio => {
                radio.checked = radio.value === currentSettings.groqModel;
                if (radio.checked) {
                    console.log('✅ Groqモデルが選択されました:', radio.value);
                }
            });
            
            // AI創作APIの設定を反映
            const aiCreativeRadios = document.querySelectorAll('input[name="ai-creative-api"]');
            console.log('🔧 AI創作API設定を適用中:', currentSettings.aiCreativeApi);
            aiCreativeRadios.forEach(radio => {
                radio.checked = radio.value === currentSettings.aiCreativeApi;
                if (radio.checked) {
                    console.log('✅ AI創作APIが選択されました:', radio.value);
                }
            });
            
            console.log('🔧 設定モーダルを表示中...');
            settingsModal.style.display = 'flex';
            console.log('✅ 設定モーダル表示完了');
        });
        
        // モーダルを閉じる
        const closeModal = () => {
            console.log('🔧 設定モーダルを閉じます');
            settingsModal.style.display = 'none';
            console.log('✅ 設定モーダルを閉じました');
        };
        
        settingsClose.addEventListener('click', () => {
            console.log('🔧 設定モーダル閉じるボタン（×）がクリックされました');
            closeModal();
        });
        settingsCancel.addEventListener('click', () => {
            console.log('🔧 設定モーダルキャンセルボタンがクリックされました');
            closeModal();
        });
        
        // 保存ボタン
        settingsSave.addEventListener('click', () => {
            console.log('🔧 設定保存ボタンがクリックされました');
            const selectedApi = document.querySelector('input[name="ai-api"]:checked')?.value || 'groq';
            const selectedGroqModel = document.querySelector('input[name="groq-model"]:checked')?.value || 'llama-3.1-8b-instant';
            const selectedAiCreativeApi = document.querySelector('input[name="ai-creative-api"]:checked')?.value || 'chatgpt';
            
            console.log('📊 選択された設定:', {
                aiApi: selectedApi,
                groqModel: selectedGroqModel,
                aiCreativeApi: selectedAiCreativeApi
            });
            
            Settings.set({ 
                aiApi: selectedApi,
                groqModel: selectedGroqModel,
                aiCreativeApi: selectedAiCreativeApi
            });
            
            console.log('✅ 設定を保存しました');
            
            // 成功メッセージ
            const originalText = settingsSave.innerHTML;
            settingsSave.innerHTML = '<i class="fas fa-check"></i> 保存完了';
            settingsSave.disabled = true;
            
            setTimeout(() => {
                settingsSave.innerHTML = originalText;
                settingsSave.disabled = false;
                
                // 保存後の設定を確認
                const savedSettings = Settings.get();
                console.log('📊 保存後の設定確認:', {
                    aiApi: savedSettings.aiApi,
                    groqModel: savedSettings.groqModel,
                    aiCreativeApi: savedSettings.aiCreativeApi,
                    timestamp: new Date().toISOString()
                });
                
                closeModal();
            }, 1500);
        });
        
        // モーダル外クリックで閉じる
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                console.log('🔧 設定モーダル外クリックで閉じます');
                closeModal();
            }
        });
    };

    // Supabaseクライアントの初期化
    if (!window.APP_CONFIG) {
        console.error('config.jsが読み込まれていません');
        alert('設定ファイルの読み込みに失敗しました');
        return;
    }
    
    const sb = supabase.createClient(
        window.APP_CONFIG.SUPABASE_URL, 
        window.APP_CONFIG.SUPABASE_ANON_KEY
    );
    
    console.log('Supabaseクライアント初期化完了');

    const cardListEl = document.getElementById('cardList');
    const tabsContainer = document.querySelector('.tabs');
    const newButtons = document.querySelectorAll('.js-new');
    const searchInput = document.getElementById('searchInput');
    const searchClear = document.getElementById('searchClear');
    let categoryButtons = document.querySelectorAll('.category-btn');

    if (!cardListEl || !tabsContainer) {
        console.error("Element with id 'cardList' or class 'tabs' not found.");
        return;
    }

    // カテゴリーボタンの確認（簡潔版）
    console.log(`📋 カテゴリーボタン: ${categoryButtons.length}個`);

    let allRecipes = [];
    let favoriteRecipes = [];
    let translatedRecipes = [];
    let aiRecipes = [];
    let urlRecipes = [];
    let currentTab = 'all';
    let currentCategoryFilter = 'all';
    let currentSearchTerm = '';
    let filteredRecipes = [];

    // 一括選択機能用の変数
    let isBulkMode = false;
    let selectedRecipes = new Set();

1    // escapeHtml関数は utils.js で定義済み
    
    const getClientId = () => {
        let clientId = localStorage.getItem("client_id");
        if (!clientId) {
            clientId = crypto?.randomUUID?.() || String(Math.random()).slice(2);
            localStorage.setItem("client_id", clientId);
        }
        return clientId;
    };

    const baseRecipeColumns = "id,title,category,created_at,tags,is_ai_generated,is_groq_generated,source_url,language_code,original_recipe_id";

    const fetchAllRecipes = async () => {
        try {
            // 通常のレシピデータを取得
            const { data: recipes, error: recipesError } = await sb
                .from("recipes")
                .select(baseRecipeColumns)
                .order("created_at", { ascending: false });
            
            if (recipesError) {
                console.error('Failed to fetch recipes:', recipesError);
                throw recipesError;
            }

            // パン用レシピデータを取得
            const { data: breadRecipes, error: breadError } = await sb
                .from("bread_recipes")
                .select("id,title,flour_total_g,created_at,updated_at,notes")
                .order("created_at", { ascending: false });

            if (breadError) {
                console.warn('パン用レシピデータの読み込みに失敗:', breadError);
            }

            // パン用レシピを通常のレシピ形式に変換
            const convertedBreadRecipes = breadRecipes ? breadRecipes.map(breadRecipe => ({
                id: breadRecipe.id,
                title: breadRecipe.title,
                category: 'パン',
                tags: ['パン用レシピ', 'ベーカーズパーセンテージ'],
                created_at: breadRecipe.created_at,
                updated_at: breadRecipe.updated_at,
                is_bread_recipe: true,
                flour_total_g: breadRecipe.flour_total_g,
                notes: breadRecipe.notes,
                description: `パン用レシピ - 総重量: ${breadRecipe.flour_total_g}g`
            })) : [];

            // 通常のレシピとパン用レシピを結合
            const allRecipes = [...(recipes || []), ...convertedBreadRecipes];
            
            // 作成日時でソート
            allRecipes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            console.log(`📚 レシピ読み込み完了: 通常レシピ${recipes?.length || 0}件, パン用レシピ${convertedBreadRecipes.length}件`);
            return allRecipes;
        } catch (error) {
            console.error('レシピデータの読み込みに失敗:', error);
            throw error;
        }
    };

    const fetchFavoriteRecipes = async () => {
        const clientId = getClientId();

        // 1. Fetch standard favorites
        const { data: standardFavData, error: standardError } = await sb
            .from("favorites")
            .select(`recipes!inner(${baseRecipeColumns})`)
            .eq("client_id", clientId);

        if (standardError) {
            console.error('Failed to fetch standard favorites:', standardError);
            throw standardError;
        }
        const standardFavorites = (standardFavData || []).map(x => x.recipes).filter(Boolean);

        // 2. Fetch bread favorites
        let breadFavorites = [];
        const { data: breadFavData, error: breadError } = await sb
            .from("bread_favorites")
            .select(`bread_recipes!inner(id,title,flour_total_g,created_at,updated_at,notes)`)
            .eq("client_id", clientId);

        if (breadError) {
            console.warn('Could not fetch bread favorites. The table might not exist yet.', breadError);
        } else {
            const breadFavoritesRaw = (breadFavData || []).map(x => x.bread_recipes).filter(Boolean);
            // 3. Convert bread favorites to the common recipe card format
            breadFavorites = breadFavoritesRaw.map(breadRecipe => ({
                id: breadRecipe.id,
                title: breadRecipe.title,
                category: 'パン',
                tags: ['パン用レシピ', 'ベーカーズパーセンテージ'],
                created_at: breadRecipe.created_at,
                updated_at: breadRecipe.updated_at,
                is_bread_recipe: true,
                flour_total_g: breadRecipe.flour_total_g,
                notes: breadRecipe.notes,
                description: `パン用レシピ - 総重量: ${breadRecipe.flour_total_g}g`
            }));
        }

        // 4. Merge and sort
        const allFavorites = [...standardFavorites, ...breadFavorites];
        allFavorites.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        console.log(`❤️ お気に入り: ${allFavorites.length}件 (通常: ${standardFavorites.length}, パン: ${breadFavorites.length})`);
        return allFavorites;
    };

    const fetchTranslatedRecipes = async () => {
        const { data, error } = await sb.from("recipes").select(baseRecipeColumns).contains("tags", ["翻訳"]).order("created_at", { ascending: false });                                                            
        if (error) {
            console.error('Failed to fetch translated recipes:', error);
            throw error;
        }
        console.log(`🌍 翻訳レシピ読み込み: ${data?.length || 0}件`);
        return data || [];
    };

    const fetchAIRecipes = async () => {
        const { data, error } = await sb.from("recipes").select(baseRecipeColumns).eq("is_ai_generated", true).order("created_at", { ascending: false });
        if (error) {
            console.error('Failed to fetch AI recipes:', error);
            throw error;
        }
        console.log(`🤖 AIレシピ読み込み: ${data?.length || 0}件`);
        return data || [];
    };

    const fetchURLRecipes = async () => {
        const { data, error } = await sb.from("recipes").select(baseRecipeColumns).not("source_url", "is", null).order("created_at", { ascending: false });
        if (error) {
            console.error('Failed to fetch URL recipes:', error);
            throw error;
        }
        console.log(`🔗 URLレシピ読み込み: ${data?.length || 0}件`);
        return data || [];
    };

    const updateStats = () => {
        const totalRecipes = allRecipes.length;
        const favoriteCount = favoriteRecipes.length;
        const translatedCount = translatedRecipes.length;

        const totalEl = document.getElementById('totalRecipes');
        const favoriteEl = document.getElementById('favoriteRecipes');
        const translatedEl = document.getElementById('translatedRecipes');
        
        if (totalEl) totalEl.textContent = totalRecipes;
        if (favoriteEl) favoriteEl.textContent = favoriteCount;
        if (translatedEl) translatedEl.textContent = translatedCount;
    };



    // テキストを正規化する関数（ひらがな・カタカナ変換）
    const normalizeText = (text) => {
        if (!text) return '';
        return text
            .toLowerCase() // 小文字に変換
            .replace(/[ァ-ヶ]/g, match => String.fromCharCode(match.charCodeAt(0) - 0x60)) // カタカナ→ひらがな
            .replace(/[Ａ-Ｚａ-ｚ０-９]/g, match => {
                // 全角英数字→半角英数字
                const code = match.charCodeAt(0);
                if (code >= 0xFF01 && code <= 0xFF5E) {
                    return String.fromCharCode(code - 0xFEE0);
                }
                return match;
            })
            .trim();
    };

    const filterRecipes = () => {
        let recipes;
        if (currentTab === 'favorites') {
            recipes = favoriteRecipes;
            console.log(`❤️ お気に入りタブ: ${recipes.length}件`);
        } else if (currentTab === 'translated') {
            recipes = translatedRecipes;
            console.log(`🌍 翻訳タブ: ${recipes.length}件`);
        } else if (currentTab === 'updated') {
            recipes = allRecipes;
            console.log(`🔄 更新順タブ: ${recipes.length}件`);
        } else {
            recipes = allRecipes;
            console.log(`📚 すべてタブ: ${recipes.length}件`);
        }

        // 更新順タブの場合は作成日時でソート（updated_atフィールドが存在しないため）
        if (currentTab === 'updated') {
            recipes = recipes.sort((a, b) => {
                const dateA = new Date(a.created_at);
                const dateB = new Date(b.created_at);
                return dateB - dateA; // 降順（新しい順）
            });
        }

        // カテゴリーフィルター
        if (currentCategoryFilter !== 'all' && currentCategoryFilter !== 'favorites') {
            recipes = recipes.filter(r => (r.category || 'その他') === currentCategoryFilter);
        }


        // 検索フィルター（正規化されたテキストで部分一致検索）
        if (currentSearchTerm.trim()) {
            const normalizedSearchTerm = normalizeText(currentSearchTerm);
            console.log(`🔍 検索: "${currentSearchTerm}" → "${normalizedSearchTerm}"`);
            
            recipes = recipes.filter(r => {
                const normalizedTitle = normalizeText(r.title);
                const normalizedCategory = normalizeText(r.category || '');
                
                const titleMatch = normalizedTitle.includes(normalizedSearchTerm);
                const categoryMatch = normalizedCategory.includes(normalizedSearchTerm);
                
                return titleMatch || categoryMatch;
            });
            
            console.log(`✅ 検索結果: ${recipes.length}件`);
        }

        filteredRecipes = recipes;
        return recipes;
    };
    
    const renderCards = (recipes) => {
        console.log(`🎨 レンダリング開始: ${recipes.length}件のレシピ`);
        cardListEl.innerHTML = '';
        
        if (!recipes || recipes.length === 0) {
            const emptyMessage = document.getElementById('empty-message');
            if (currentSearchTerm.trim()) {
                cardListEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="fas fa-search"></i>
                        </div>
                        <h2>検索結果が見つかりません</h2>
                        <p>"${escapeHtml(currentSearchTerm)}" に一致するレシピがありません。</p>
                        <button class="btn primary" onclick="clearSearch()">
                            <i class="fas fa-times"></i>
                            検索をクリア
                        </button>
                    </div>
                `;
            } else if (currentCategoryFilter !== 'all') {
                // カテゴリーフィルター時の空メッセージ
                cardListEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">
                            <i class="fas fa-folder-open"></i>
                        </div>
                        <h2>「${currentCategoryFilter}」のレシピがありません</h2>
                        <p>このカテゴリーにはまだレシピが登録されていません。</p>
                        <button class="btn primary js-new">
                            <i class="fas fa-plus"></i>
                            新規レシピを作成
                        </button>
                    </div>
                `;
            } else {
                emptyMessage.style.display = 'block';
            }
            return;
        }

        document.getElementById('empty-message').style.display = 'none';

        // カテゴリーでグループ化（すべて表示時のみ）
        if (currentTab === 'all' && !currentSearchTerm.trim()) {
            const groupedRecipes = recipes.reduce((acc, recipe) => {
                const category = recipe.category || 'その他';
                if (!acc[category]) {
                    acc[category] = [];
                }
                acc[category].push(recipe);
                return acc;
            }, {});

            const categoryOrder = ['アミューズ', '前菜', 'スープ', 'パスタ', '魚料理', '肉料理', 'メイン', 'デザート', 'パン', 'その他'];
            const sortedCategories = Object.keys(groupedRecipes).sort((a, b) => {
                const indexA = categoryOrder.indexOf(a);
                const indexB = categoryOrder.indexOf(b);
                if (indexA > -1 && indexB > -1) return indexA - indexB;
                if (indexA > -1) return -1;
                if (indexB > -1) return 1;
                return a.localeCompare(b);
            });

            sortedCategories.forEach(category => {
                const categorySection = document.createElement('section');
                categorySection.className = 'category-section';
                const header = document.createElement('h2');
                header.className = 'category-header';
                header.textContent = category;
                categorySection.appendChild(header);

                const recipeGroup = document.createElement('div');
                recipeGroup.className = 'recipe-group';
                groupedRecipes[category].forEach(r => {
                    recipeGroup.appendChild(createRecipeCard(r));
                });
                categorySection.appendChild(recipeGroup);
                cardListEl.appendChild(categorySection);
            });
        } else {
            // フィルター時はシンプルなグリッド表示
            cardListEl.className = 'card-grid';
            recipes.forEach(r => {
                cardListEl.appendChild(createRecipeCard(r));
            });
        }
    };

    const normalizeCategories = (recipe) => {
        const set = new Set();
        if (typeof recipe?.category === 'string') {
            recipe.category.split(/[、,／\/]/).forEach(cat => {
                const trimmed = (cat || '').trim();
                if (trimmed) set.add(trimmed);
            });
        }
        if (Array.isArray(recipe?.tags)) {
            recipe.tags.forEach(tag => {
                const trimmed = (tag || '').trim();
                if (trimmed) set.add(trimmed);
            });
        }
        return set;
    };

    const createStatusIcon = (fileName, label) => {
        return `<img src="assets/icons/${fileName}" alt="${label}" title="${label}" class="recipe-status-icon" loading="lazy">`;
    };

    const buildStatusIcons = (recipe) => {
        const categories = normalizeCategories(recipe);
        const hasCategory = (...names) => names.some(name => categories.has(name));

        const icons = [];

        const isAiRecipe = recipe.is_ai_generated || hasCategory('AI創作', 'AI創作レシピ');
        if (isAiRecipe) {
            icons.push(createStatusIcon('groq-icon.svg', 'AI創作レシピ'));
        }

        const isTranslated = hasCategory('翻訳', '翻訳レシピ') || Boolean(recipe.language_code) || Boolean(recipe.original_recipe_id);
        if (isTranslated) {
            icons.push(createStatusIcon('translate.svg', '翻訳レシピ'));
        }

        const isUrlImported = Boolean(recipe.source_url) || hasCategory('URL取り込み', 'URLインポート');
        if (isUrlImported) {
            icons.push(createStatusIcon('url.svg', 'URL取り込みレシピ'));
        }

        const tags = Array.isArray(recipe.tags) ? recipe.tags : [];

        const hasGroqImageAnalysis = hasCategory('AI-Groq解析') || tags.includes('AI-Groq解析');
        if (hasGroqImageAnalysis) {
            icons.push(createStatusIcon('URL-groq.svg', '画像解析（Groq）'));
        }

        const hasChatGPTImageAnalysis = hasCategory('AI-ChatGPT解析') || tags.includes('AI-ChatGPT解析');
        if (hasChatGPTImageAnalysis) {
            icons.push(createStatusIcon('openai.svg', '画像解析（ChatGPT）'));
        }

        if (!hasGroqImageAnalysis && !hasChatGPTImageAnalysis) {
            const imageCategoryNames = ['画像解析', '画像分析', '画像AI', '画像抽出'];
            const isImageAnalysis = imageCategoryNames.some(name => hasCategory(name)) || tags.includes('画像解析');
            if (isImageAnalysis) {
                icons.push(createStatusIcon('gemini.svg', '画像解析レシピ'));
            }
        }

        return icons.join('');
    };

    const createRecipeCard = (recipe) => {
        const card = document.createElement('div');
        card.className = 'recipe-card';
        card.dataset.id = recipe.id;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        
        const date = new Date(recipe.created_at);
        const formattedDate = date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        const isFavorite = favoriteRecipes.some(fav => fav.id === recipe.id);
        const isSelected = selectedRecipes.has(recipe.id);
        
        const statusIconsHtml = buildStatusIcons(recipe);

        // パン用レシピかどうかを判定
        const isBreadRecipe = recipe.is_bread_recipe || (recipe.title && (
            recipe.title.includes('パン') || 
            recipe.title.includes('ブレッド') || 
            recipe.title.includes('bread') ||
            recipe.title.includes('ベーカーズ') ||
            recipe.title.includes('baker')
        ));

        card.innerHTML = `
            <div class="bulk-checkbox"></div>
            <div class="recipe-header">
                <h3 class="recipe-title">${escapeHtml(recipe.title)}</h3>
                <div class="recipe-actions">
                    ${statusIconsHtml}
                    ${isBreadRecipe ? '<span class="bread-recipe-badge">パン用レシピ</span>' : ''}
                    <button class="favorite-btn ${isFavorite ? 'is-favorite' : ''}" data-recipe-id="${recipe.id}">
                        <i class="fas fa-heart"></i>
                    </button>
                </div>
            </div>
            ${isBreadRecipe && recipe.flour_total_g ? `<div class="recipe-meta">総重量: ${recipe.flour_total_g}g</div>` : ''}
        `;
        
        // 一括選択モードの場合は選択状態を設定
        if (isBulkMode) {
            card.classList.add('bulk-mode');
            if (isSelected) {
                card.classList.add('selected');
            }
        }

        // パン用レシピの場合は、識別のためのデータ属性を追加
        if (isBreadRecipe) {
            card.dataset.isBread = 'true';
        }
        
        return card;
    };

    const updateView = () => {
        console.log(`🔄 ビュー更新開始: タブ=${currentTab}, カテゴリー=${currentCategoryFilter}, 検索=${currentSearchTerm}`);
        cardListEl.className = '';
        const recipes = filterRecipes();
        console.log(`📊 フィルター結果: ${recipes.length}件`);
        renderCards(recipes);
        updateCategoryButtons();
        updateBulkSelectionUI();
        updateBulkSelectionButtons();

    };

    const updateBulkSelectionButtons = () => {
        const bulkSelectBtn = document.querySelector('.js-bulk-select');
        const bulkPdfBtn = document.querySelector('.js-bulk-pdf');
        const recipes = filterRecipes();
        
        // レシピが存在する場合のみ一括選択ボタンを表示
        if (bulkSelectBtn) {
            bulkSelectBtn.style.display = recipes.length > 0 ? 'inline-flex' : 'none';
        }
        
        if (bulkPdfBtn && !isBulkMode) {
            bulkPdfBtn.style.display = 'none';
        }
    };

    // 一括選択機能の関数
    const toggleBulkMode = () => {
        isBulkMode = !isBulkMode;
        selectedRecipes.clear();
        
        const bulkSelectBtn = document.querySelector('.js-bulk-select');
        const bulkPdfBtn = document.querySelector('.js-bulk-pdf');
        const bulkUI = document.getElementById('bulk-selection-ui');
        
        if (isBulkMode) {
            bulkSelectBtn.textContent = '編集終了';
            bulkSelectBtn.innerHTML = '<i class="fas fa-times"></i> 編集終了';
            if (bulkPdfBtn) {
                bulkPdfBtn.style.display = 'inline-flex';
            }
            bulkUI.style.display = 'block';
        } else {
            bulkSelectBtn.textContent = '一括編集';
            bulkSelectBtn.innerHTML = '<i class="fas fa-edit"></i> 一括編集';
            if (bulkPdfBtn) {
                bulkPdfBtn.style.display = 'none';
            }
            bulkUI.style.display = 'none';
        }
        
        updateView();
    };

    const updateBulkSelectionUI = () => {
        const selectedCount = document.getElementById('selected-count');
        const createBookBtn = document.querySelector('.js-create-recipe-book');
        const bulkDeleteBtn = document.querySelector('.js-bulk-delete');
        
        if (selectedCount) {
            selectedCount.textContent = selectedRecipes.size;
        }
        
        if (createBookBtn) {
            createBookBtn.disabled = selectedRecipes.size === 0;
        }
        
        if (bulkDeleteBtn) {
            bulkDeleteBtn.disabled = selectedRecipes.size === 0;
        }
    };

    const toggleRecipeSelection = (recipeId) => {
        if (selectedRecipes.has(recipeId)) {
            selectedRecipes.delete(recipeId);
        } else {
            selectedRecipes.add(recipeId);
        }
        updateBulkSelectionUI();
        updateRecipeCardSelection(recipeId);
    };

    // 個別のレシピカードの選択状態のみを更新（全体の再描画を避ける）
    const updateRecipeCardSelection = (recipeId) => {
        const card = document.querySelector(`.recipe-card[data-id="${recipeId}"]`);
        if (card) {
            const isSelected = selectedRecipes.has(recipeId);
            card.classList.toggle('selected', isSelected);
        }
    };

    const selectAllRecipes = () => {
        const recipes = filterRecipes();
        recipes.forEach(recipe => {
            selectedRecipes.add(recipe.id);
            updateRecipeCardSelection(recipe.id);
        });
        updateBulkSelectionUI();
    };

    const deselectAllRecipes = () => {
        // 現在選択されているレシピの選択状態をクリア
        selectedRecipes.forEach(recipeId => {
            updateRecipeCardSelection(recipeId);
        });
        selectedRecipes.clear();
        updateBulkSelectionUI();
    };

    // 一括削除機能
    const bulkDeleteRecipes = async () => {
        if (selectedRecipes.size === 0) {
            alert('削除するレシピを選択してください。');
            return;
        }

        // 削除確認モーダルを表示
        showBulkDeleteModal();
    };

    // 削除確認モーダルを表示
    const showBulkDeleteModal = () => {
        console.log('削除確認モーダル表示開始');
        const modal = document.getElementById('bulk-delete-modal');
        const countElement = document.getElementById('delete-count-number');
        const recipeListElement = document.getElementById('delete-recipe-list');
        
        if (!modal || !countElement || !recipeListElement) {
            console.error('削除確認モーダルの要素が見つかりません');
            return;
        }
        
        // 一括選択UIの現在の状態を確認
        const bulkSelectionUI = document.getElementById('bulk-selection-ui');
        console.log('一括選択UIの現在の状態:', bulkSelectionUI ? bulkSelectionUI.style.display : '要素が見つからない');

        // 削除対象のレシピ情報を取得（ID型の不一致を吸収）
        const selectedRecipeIds = Array.from(selectedRecipes);
        const selectedIdsStr = selectedRecipeIds.map(id => String(id));
        const selectedRecipesData = allRecipes.filter(recipe =>
            selectedIdsStr.includes(String(recipe.id))
        );

        // 削除件数を表示（Setサイズを優先）
        countElement.textContent = selectedRecipes.size;

        // 削除対象レシピ一覧を表示
        recipeListElement.innerHTML = '';
        
        // 一括選択UIを表示して、ボタンを固定表示
        const bulkSelectionUI2 = document.getElementById('bulk-selection-ui');
        if (bulkSelectionUI2) {
            console.log('一括選択UIを固定表示に設定');
            bulkSelectionUI2.style.display = 'block !important';
            bulkSelectionUI2.style.position = 'fixed !important';
            bulkSelectionUI2.style.top = '20px !important';
            bulkSelectionUI2.style.left = '50% !important';
            bulkSelectionUI2.style.transform = 'translateX(-50%) !important';
            bulkSelectionUI2.style.zIndex = '10000 !important';
            bulkSelectionUI2.style.width = 'auto !important';
            bulkSelectionUI2.style.maxWidth = '90% !important';
            bulkSelectionUI2.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3) !important';
            bulkSelectionUI2.style.borderRadius = 'var(--radius-md) !important';
            bulkSelectionUI2.style.visibility = 'visible !important';
            bulkSelectionUI2.style.opacity = '1 !important';
        } else {
            console.log('一括選択UIが見つかりません');
        }
        
        // リストコンテナのスタイルを直接設定
        recipeListElement.style.cssText = `
            height: 400px !important;
            overflow-y: auto !important;
            background: var(--bg-secondary) !important;
            border: 1px solid var(--border-medium) !important;
            border-radius: var(--radius-md) !important;
            padding: 1rem !important;
            margin-bottom: 1rem !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 0.5rem !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: none !important;
            box-sizing: border-box !important;
        `;
        
        // 重複・未定義要素への追加を避けるため、描画はこの後の処理に一本化
        
        // レシピアイテムをリストに直接追加
        selectedRecipesData.forEach(recipe => {
            const item = document.createElement('div');
            item.className = 'delete-recipe-item';
            
            // アイテムのスタイルを直接設定
            item.style.cssText = `
                display: flex !important;
                align-items: flex-start !important;
                padding: 0.75rem !important;
                background: var(--bg-tertiary) !important;
                border-radius: var(--radius-sm) !important;
                border: 1px solid var(--border-light) !important;
                transition: all 0.2s ease !important;
                width: 100% !important;
                min-width: 0 !important;
                max-width: none !important;
                box-sizing: border-box !important;
                min-height: auto !important;
                overflow: visible !important;
            `;
            
            // アイコン要素
            const icon = document.createElement('i');
            icon.className = 'fas fa-utensils';
            icon.style.cssText = `
                color: var(--accent-danger) !important;
                margin-right: 0.75rem !important;
                width: 16px !important;
                flex-shrink: 0 !important;
                margin-top: 0.1rem !important;
            `;
            
            // テキスト要素
            const span = document.createElement('span');
            span.textContent = recipe.title;
            
            // テキストの折り返しを強制するスタイルを直接設定
            span.style.cssText = `
                color: var(--text-primary) !important;
                font-size: 0.9rem !important;
                word-wrap: break-word !important;
                word-break: break-word !important;
                overflow-wrap: anywhere !important;
                hyphens: auto !important;
                white-space: normal !important;
                line-height: 1.4 !important;
                flex: 1 !important;
                min-width: 0 !important;
                display: block !important;
                text-overflow: unset !important;
                overflow: visible !important;
                max-width: none !important;
                width: 100% !important;
                -webkit-line-clamp: unset !important;
                -webkit-box-orient: unset !important;
                display: -webkit-box !important;
                display: block !important;
            `;
            
            // さらに強制的にテキスト省略を無効化
            span.setAttribute('style', span.getAttribute('style') + '; text-overflow: unset !important; overflow: visible !important; white-space: normal !important;');
            
            item.appendChild(icon);
            item.appendChild(span);
            recipeListElement.appendChild(item);
        });

        // モーダルを表示
        modal.style.display = 'flex';
        
        // モーダルコンテンツの幅を強制的に拡大
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.cssText = `
                width: 90% !important;
                max-width: 700px !important;
                max-height: 95vh !important;
                min-height: 600px !important;
                overflow-y: auto !important;
                box-sizing: border-box !important;
            `;
        }
    };

    // 削除確認モーダルを非表示
    const hideBulkDeleteModal = () => {
        const modal = document.getElementById('bulk-delete-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        
        // 一括選択UIを元に戻す
        const bulkSelectionUI3 = document.getElementById('bulk-selection-ui');
        if (bulkSelectionUI3) {
            bulkSelectionUI3.style.display = 'none';
            bulkSelectionUI3.style.position = '';
            bulkSelectionUI3.style.top = '';
            bulkSelectionUI3.style.left = '';
            bulkSelectionUI3.style.transform = '';
            bulkSelectionUI3.style.zIndex = '';
            bulkSelectionUI3.style.width = '';
            bulkSelectionUI3.style.maxWidth = '';
            bulkSelectionUI3.style.boxShadow = '';
            bulkSelectionUI3.style.borderRadius = '';
        }
    };

    // 実際の削除処理を実行
    const executeBulkDelete = async () => {
        try {
            const selectedRecipeIds = Array.from(selectedRecipes);
            const selectedCount = selectedRecipeIds.length;
            console.log('削除対象のレシピID:', selectedRecipeIds);

            // 削除確認モーダルを非表示
            hideBulkDeleteModal();

            // 関連データも含めて削除
            const deletePromises = [
                // お気に入りから削除
                sb.from('favorites').delete().in('recipe_id', selectedRecipeIds),
                // 材料データを削除
                sb.from('recipe_ingredients').delete().in('recipe_id', selectedRecipeIds),
                // 手順データを削除
                sb.from('recipe_steps').delete().in('recipe_id', selectedRecipeIds),
                // レシピ本体を削除
                sb.from('recipes').delete().in('id', selectedRecipeIds)
            ];

            await Promise.all(deletePromises);
            
            console.log(`${selectedCount}件のレシピを削除しました`);
            alert(`${selectedCount}件のレシピを削除しました。`);

            // データを再読み込み
            const [allResult, favResult, transResult] = await Promise.allSettled([
                fetchAllRecipes(), 
                fetchFavoriteRecipes(),
                fetchTranslatedRecipes()
            ]);

            allRecipes = allResult.status === 'fulfilled' ? allResult.value : [];
            favoriteRecipes = favResult.status === 'fulfilled' ? favResult.value : [];
            translatedRecipes = transResult.status === 'fulfilled' ? transResult.value : [];

            // 一括選択モードを終了
            isBulkMode = false;
            selectedRecipes.clear();
            
            // UIを更新
            updateStats();
            updateView();
            
        } catch (error) {
            console.error('一括削除エラー:', error);
            alert('レシピの削除に失敗しました。');
        }
    };

    // 進行状況管理機能
    const showProgressPopup = () => {
        const popup = document.getElementById('progress-popup');
        if (popup) {
            popup.style.display = 'flex';
        }

    };

    const hideProgressPopup = () => {
        const popup = document.getElementById('progress-popup');
        if (popup) {
            popup.style.display = 'none';
        }
    };

    const updateProgressStep = (stepId, status) => {
        const step = document.getElementById(stepId);
        if (!step) return;

        // すべてのステップからactiveクラスを削除
        document.querySelectorAll('.progress-step').forEach(s => {
            s.classList.remove('active', 'completed');
        });

        if (status === 'active') {
            step.classList.add('active');
        } else if (status === 'completed') {
            step.classList.add('completed');
        }
    };

    const updateProgressBar = (percentage) => {
        const progressFill = document.getElementById('progress-fill');
        const progressText = document.getElementById('progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${Math.round(percentage)}%`;
        }
    };

    const updateProgressInfo = (message) => {
        const progressInfo = document.getElementById('progress-info');
        if (progressInfo) {
            progressInfo.textContent = message;
        }
    };

    const showCompletionMessage = () => {
        const progressInfo = document.getElementById('progress-info');
        const completionMessage = document.getElementById('progress-completion-message');
        
        if (progressInfo) {
            progressInfo.style.display = 'none';
        }
        
        if (completionMessage) {
            completionMessage.style.display = 'flex';
        }
    };

    // サイトリセット機能
    const resetSite = () => {
        console.log('サイトをリセット中...');
        
        // 一括選択モードを終了
        isBulkMode = false;
        selectedRecipes.clear();
        
        // 一括選択UIを非表示
        const bulkUI = document.getElementById('bulk-selection-ui');
        if (bulkUI) {
            bulkUI.style.display = 'none';
        }
        
        // 一括選択ボタンの状態をリセット
        const bulkSelectBtn = document.querySelector('.js-bulk-select');
        if (bulkSelectBtn) {
            bulkSelectBtn.textContent = '一括編集';
            bulkSelectBtn.innerHTML = '<i class="fas fa-edit"></i> 一括編集';
        }
        
        // レシピブック作成ボタンを非表示
        const bulkPdfBtn = document.querySelector('.js-bulk-pdf');
        if (bulkPdfBtn) {
            bulkPdfBtn.style.display = 'none';
        }
        
        // すべてのレシピカードから選択状態をクリア
        document.querySelectorAll('.recipe-card').forEach(card => {
            card.classList.remove('bulk-mode', 'selected');
        });
        
        // 選択カウントをリセット
        updateBulkSelectionUI();
        
        // ビューを更新
        updateView();
        
        console.log('サイトリセット完了');
    };

    // レシピブック作成機能
    const createRecipeBook = async () => {
        if (selectedRecipes.size === 0) {
            alert('レシピを選択してください。');
            return;
        }

        // 進行状況ポップアップを表示
        showProgressPopup();
        updateProgressStep('step-data-loading', 'active');
        updateProgressBar(0);
        updateProgressInfo('レシピデータの取得を開始しています...');

        try {
            // 選択されたレシピの詳細データを取得
            const selectedRecipeIds = Array.from(selectedRecipes);
            console.log('選択されたレシピID:', selectedRecipeIds);
            
            // バックグラウンドで並列にデータを取得
            updateProgressInfo('レシピ情報をデータベースから取得中...');
            updateProgressBar(10);
            
            const [recipesResult, ingredientsResult, stepsResult] = await Promise.allSettled([
                // レシピ基本データ
                sb.from('recipes').select('*').in('id', selectedRecipeIds),
                // 材料データ
                sb.from('recipe_ingredients').select('*').in('recipe_id', selectedRecipeIds).order('position'),
                // 手順データ
                sb.from('recipe_steps').select('*').in('recipe_id', selectedRecipeIds).order('position')
            ]);

            if (recipesResult.status === 'rejected') {
                console.error('レシピデータの取得に失敗:', recipesResult.reason);
                alert('レシピデータの取得に失敗しました。');
                hideProgressPopup();
                return;
            }

            const recipes = recipesResult.value.data;
            if (!recipes || recipes.length === 0) {
                alert('選択されたレシピが見つかりません。');
                hideProgressPopup();
                return;
            }

            console.log('取得されたレシピデータ:', recipes);
            
            // データ読み込み完了
            updateProgressStep('step-data-loading', 'completed');
            updateProgressStep('step-cover-generation', 'active');
            updateProgressBar(20);
            updateProgressInfo('データの読み込みが完了しました。表紙を生成中...');
            
            // 材料と手順データをレシピIDでグループ化
            const ingredientsByRecipe = {};
            const stepsByRecipe = {};
            
            if (ingredientsResult.status === 'fulfilled' && ingredientsResult.value.data) {
                ingredientsResult.value.data.forEach(ing => {
                    if (!ingredientsByRecipe[ing.recipe_id]) {
                        ingredientsByRecipe[ing.recipe_id] = [];
                    }
                    ingredientsByRecipe[ing.recipe_id].push(ing);
                });
            }
            
            if (stepsResult.status === 'fulfilled' && stepsResult.value.data) {
                stepsResult.value.data.forEach(step => {
                    if (!stepsByRecipe[step.recipe_id]) {
                        stepsByRecipe[step.recipe_id] = [];
                    }
                    stepsByRecipe[step.recipe_id].push(step);
                });
            }
            
            // レシピデータに材料と手順を追加
            const recipesWithDetails = recipes.map(recipe => {
                const recipeWithDetails = {
                    ...recipe,
                    ingredients: ingredientsByRecipe[recipe.id] || [],
                    steps: stepsByRecipe[recipe.id] || []
                };
                
                console.log(`レシピ ${recipe.title} の詳細:`, {
                    id: recipe.id,
                    title: recipe.title,
                    category: recipe.category,
                    ingredients: recipeWithDetails.ingredients,
                    steps: recipeWithDetails.steps,
                    notes: recipe.notes
                });
                
                return recipeWithDetails;
            });

            // レシピブックPDFを生成
            await generateRecipeBookPDF(recipesWithDetails);
            
        } catch (error) {
            console.error('レシピブック作成エラー:', error);
            
            // メモリ不足エラーの場合の特別な処理
            if (error.message && error.message.includes('Out of memory')) {
                alert('レシピ数が多すぎてメモリ不足になりました。\n一度に処理できるレシピ数を減らして再試行してください。\n\n推奨: 50個以下のレシピで試してください。');
            } else {
                alert('レシピブックの作成に失敗しました。\nエラー: ' + error.message);
            }
        } finally {
            // 進行状況ポップアップを非表示してサイトをリセット
            hideProgressPopup();
            resetSite();
        }
    };

    // レシピブックPDF生成関数（メモリ効率化版）
    const generateRecipeBookPDF = async (recipes) => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // 日本語フォント設定
        try {
            doc.setFont('helvetica');
        } catch (fontError) {
            console.warn('フォント設定エラー:', fontError);
        }
        
        // メモリ効率化のため、レシピを分割して処理
        const BATCH_SIZE = 10; // 一度に処理するレシピ数
        const totalRecipes = recipes.length;
        console.log(`📊 レシピブック生成開始: ${totalRecipes}個のレシピを${BATCH_SIZE}個ずつ処理`);
        console.log(`📊 PDF初期化直後のページ数:`, doc.getNumberOfPages());

        // 表紙をHTML形式で生成（1ページ目を使用）
        updateProgressInfo('レシピブックの表紙を作成中...');
        await generateRecipeBookCover(doc, recipes);
        updateProgressStep('step-cover-generation', 'completed');
        updateProgressStep('step-toc-generation', 'active');
        updateProgressBar(40);
        console.log(`📊 表紙生成後のページ数:`, doc.getNumberOfPages());
        
        // 目次のために新しいページを追加
        doc.addPage();
        console.log(`📊 目次ページ追加後のページ数:`, doc.getNumberOfPages());
        
        // 目次をHTML形式で生成
        updateProgressInfo('目次を作成中...');
        await generateRecipeBookTOC(doc, recipes);
        updateProgressStep('step-toc-generation', 'completed');
        updateProgressStep('step-recipes-generation', 'active');
        updateProgressBar(60);
        console.log(`📊 目次生成後のページ数:`, doc.getNumberOfPages());
        
        // レシピページのための新しいページを追加
        doc.addPage();
        console.log(`📊 レシピページ追加後のページ数:`, doc.getNumberOfPages());

        // 各レシピの詳細ページをHTML形式で生成（分割処理）
        for (let batchStart = 0; batchStart < recipes.length; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, recipes.length);
            const batch = recipes.slice(batchStart, batchEnd);
            
            console.log(`バッチ処理開始: レシピ ${batchStart + 1}-${batchEnd} (${batch.length}個)`);
            
            for (let i = 0; i < batch.length; i++) {
                const recipe = batch[i];
                const globalIndex = batchStart + i;
                
                console.log(`レシピ ${globalIndex + 1}/${recipes.length} のページを生成中: ${recipe.title}`);
                
                // 進行状況を更新
                const recipeProgress = 60 + (globalIndex / recipes.length) * 30;
                updateProgressBar(recipeProgress);
                updateProgressInfo(`レシピページを生成中... (${globalIndex + 1}/${recipes.length}) ${recipe.title}`);
                
                // 最初のレシピ以外は新しいページを追加
                if (globalIndex > 0) {
                    console.log(`🍳 レシピ ${globalIndex + 1} のページ追加前 - 現在のページ数:`, doc.getNumberOfPages());
                    doc.addPage();
                    console.log(`🍳 レシピ ${globalIndex + 1} のページ追加後 - 現在のページ数:`, doc.getNumberOfPages());
                } else {
                    console.log(`🍳 最初のレシピ ${globalIndex + 1} - 現在のページ数:`, doc.getNumberOfPages());
                }
                
                await generateRecipePage(doc, recipe, globalIndex + 1, recipes.length);
                console.log(`🍳 レシピ ${globalIndex + 1} のページ生成完了 - 現在のページ数:`, doc.getNumberOfPages());
                
                // メモリ解放のため、少し待機
                if (i % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
            
            // バッチ間でメモリ解放
            console.log(`バッチ ${Math.floor(batchStart / BATCH_SIZE) + 1} 完了、メモリ解放中...`);
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // ガベージコレクションを促す
            if (window.gc) {
                window.gc();
            }
        }

        // PDF最終化
        updateProgressStep('step-recipes-generation', 'completed');
        updateProgressStep('step-pdf-finalization', 'active');
        updateProgressBar(90);
        updateProgressInfo('PDFファイルを最終化中...');

        // PDFをダウンロード
        const fileName = `レシピブック_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
        
        // 完了
        updateProgressStep('step-pdf-finalization', 'completed');
        updateProgressBar(100);
        showCompletionMessage();
        
        console.log('レシピブックPDF作成完了:', fileName);
        
        // 少し待ってからポップアップを閉じてサイトをリセット
        setTimeout(() => {
            hideProgressPopup();
            resetSite();
        }, 2000);
    };

    // レシピブック表紙生成（pdf-generator-v2.jsのテンプレートを使用）
    const generateRecipeBookCover = async (doc, recipes) => {
        try {
            console.log('📖 表紙生成開始 - 現在のページ数:', doc.getNumberOfPages());
            if (typeof generateRecipeBookCoverV2 === 'function') {
                console.log('generateRecipeBookCoverV2関数を呼び出し中...');
                await generateRecipeBookCoverV2(doc, recipes);
                console.log('📖 表紙生成完了 - 現在のページ数:', doc.getNumberOfPages());
            } else {
                console.error('generateRecipeBookCoverV2関数が見つかりません');
                // フォールバック: シンプルな表紙を生成
                doc.setFontSize(24);
                doc.text('レシピブック', 105, 100, { align: 'center' });
                doc.setFontSize(16);
                doc.text(`収録レシピ数: ${recipes.length}件`, 105, 120, { align: 'center' });
                doc.text(`作成日: ${new Date().toLocaleDateString('ja-JP')}`, 105, 140, { align: 'center' });
            }
        } catch (error) {
            console.error('レシピブック表紙生成エラー:', error);
        }
    };

    // 目次生成（pdf-generator-v2.jsのテンプレートを使用）
    const generateRecipeBookTOC = async (doc, recipes) => {
        try {
            console.log('📑 目次生成開始 - 現在のページ数:', doc.getNumberOfPages());
            if (typeof generateRecipeBookTOCV2 === 'function') {
                console.log('generateRecipeBookTOCV2関数を呼び出し中...');
                await generateRecipeBookTOCV2(doc, recipes);
                console.log('📑 目次生成完了 - 現在のページ数:', doc.getNumberOfPages());
            } else {
                console.error('generateRecipeBookTOCV2関数が見つかりません');
                // フォールバック: シンプルな目次を生成（2列表示）
                doc.setFontSize(16);
                doc.text('目次', 105, 30, { align: 'center' });
                doc.setFontSize(8);
                
                const halfLength = Math.ceil(recipes.length / 2);
                
                // 左列
                recipes.slice(0, halfLength).forEach((recipe, index) => {
                    doc.text(`${index + 1}. ${recipe.title}`, 20, 50 + (index * 8));
                });
                
                // 右列
                recipes.slice(halfLength).forEach((recipe, index) => {
                    doc.text(`${halfLength + index + 1}. ${recipe.title}`, 110, 50 + (index * 8));
                });
            }
        } catch (error) {
            console.error('目次生成エラー:', error);
        }
    };

    // 個別レシピページ生成（pdf-generator-v2.jsのテンプレートを使用）
    const generateRecipePage = async (doc, recipe, pageNumber, totalPages) => {
        console.log(`レシピページ生成開始: ${recipe.title} (${pageNumber}/${totalPages})`);
        
        // 材料データを解析（データベースから取得した配列形式）
        let ingredients = [];
        if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
            console.log('材料データ（生）:', recipe.ingredients);
            ingredients = recipe.ingredients.map(ing => ({
                item: ing.item || ing.item_translated || '',
                quantity: ing.quantity || '',
                unit: ing.unit || ing.unit_translated || ''
            }));
            console.log('解析された材料データ:', ingredients);
        } else {
            console.log('材料データが存在しません');
        }

        // 作り方データを解析（データベースから取得した配列形式）
        let steps = [];
        if (recipe.steps && Array.isArray(recipe.steps)) {
            console.log('作り方データ（生）:', recipe.steps);
            steps = recipe.steps.map(step => 
                step.instruction || step.instruction_translated || step.text || ''
            ).filter(step => step.trim() !== '');
            console.log('解析された作り方データ:', steps);
        } else {
            console.log('作り方データが存在しません');
        }

        // pdf-generator-v2.jsのgeneratePDFFromHTMLV2関数を使用
        try {
            await generatePDFFromHTMLV2(doc, recipe.title, ingredients, steps, recipe.notes, recipe.image_url);
            console.log(`レシピページ生成完了: ${recipe.title}`);
        } catch (error) {
            console.error(`レシピページ生成エラー: ${recipe.title}`, error);
            // エラーが発生した場合はシンプルなレシピページを生成
            doc.setFontSize(16);
            doc.text(recipe.title, 20, 30);
            doc.setFontSize(12);
            doc.text('材料:', 20, 50);
            if (ingredients.length > 0) {
                ingredients.forEach((ing, index) => {
                    doc.text(`${ing.quantity} ${ing.unit} ${ing.item}`, 30, 70 + (index * 10));
                });
            }
            doc.text('作り方:', 20, 70 + (ingredients.length * 10) + 20);
            if (steps.length > 0) {
                steps.forEach((step, index) => {
                    doc.text(`${index + 1}. ${step}`, 30, 70 + (ingredients.length * 10) + 40 + (index * 15));
                });
            }
        }
    };





    const setupTabs = () => {
        tabsContainer.addEventListener('click', (event) => {
            const tab = event.target.closest('.tab');
            if (tab) {
                currentTab = tab.dataset.tab;
                console.log(`🖱️ タブクリック: ${currentTab}`);
                updateActiveTab();
                updateView();
            }
        });
        updateActiveTab();
    };

    const updateActiveTab = () => {
        tabsContainer.querySelectorAll('.tab').forEach(t => {
            t.classList.toggle('is-active', t.dataset.tab === currentTab);
        });
    };

    const updateCategoryButtons = () => {
        categoryButtons = document.querySelectorAll('.category-btn');
        categoryButtons.forEach(btn => {
            const category = btn.dataset.category;
            btn.classList.toggle('active', category === currentCategoryFilter);
        });
    };


    const setupSearch = () => {
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                currentSearchTerm = e.target.value;
                searchClear.style.display = currentSearchTerm ? 'block' : 'none';
                updateView();
            });

            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    clearSearch();
                }
            });
        }

        if (searchClear) {
            searchClear.addEventListener('click', clearSearch);
        }
    };

    const clearSearch = () => {
        if (searchInput) {
            searchInput.value = '';
            currentSearchTerm = '';
            searchClear.style.display = 'none';
            updateView();
        }
    };

    const setupCategoryFilter = () => {
        // 既存のイベントリスナーを削除して重複を防ぐ
        const categoryFilter = document.querySelector('.category-filter');
        if (categoryFilter) {
            // 新しいイベントリスナーを設定（イベント委譲を使用）
            categoryFilter.removeEventListener('click', handleCategoryClick);
            categoryFilter.addEventListener('click', handleCategoryClick);
        }
        
        const currentButtons = document.querySelectorAll('.category-btn');
        console.log(`📋 カテゴリーボタン: ${currentButtons.length}個`);
    };


    // カテゴリーボタンクリックハンドラー（イベント委譲で動的ボタンにも対応）
    const handleCategoryClick = (e) => {
        if (e.target.classList.contains('category-btn')) {
            const btn = e.target;
            currentCategoryFilter = btn.dataset.category;
            console.log(`📂 カテゴリー選択: ${btn.textContent.trim()}`);
            
            const filteredRecipes = filterRecipes();
            console.log(`📊 結果: ${filteredRecipes.length}件`);
            
            updateView();
        }
    };


    const setupFavoriteToggle = () => {
        cardListEl.addEventListener('click', async (e) => {
            const favoriteBtn = e.target.closest('.favorite-btn');
            if (!favoriteBtn) return;

            e.stopPropagation();

            const recipeId = favoriteBtn.dataset.recipeId;
            const isFavorite = favoriteBtn.classList.contains('is-favorite');
            const card = favoriteBtn.closest('.recipe-card');
            const isBread = card.dataset.isBread === 'true';

            try {
                if (isBread) {
                    // パン用レシピのお気に入り処理
                    if (isFavorite) {
                        await sb.from('bread_favorites').delete()
                            .eq('bread_recipe_id', recipeId)
                            .eq('client_id', getClientId());
                    } else {
                        await sb.from('bread_favorites').insert({
                            bread_recipe_id: recipeId,
                            client_id: getClientId()
                        });
                    }
                } else {
                    // 通常レシピのお気に入り処理
                    if (isFavorite) {
                        await sb.from('favorites').delete()
                            .eq('recipe_id', recipeId)
                            .eq('client_id', getClientId());
                    } else {
                        await sb.from('favorites').insert({
                            recipe_id: recipeId,
                            client_id: getClientId()
                        });
                    }
                }

                // UIを更新
                favoriteRecipes = await fetchFavoriteRecipes();
                updateStats();
                updateView();

            } catch (error) {
                console.error('Failed to toggle favorite:', error);
                alert('お気に入り登録に失敗しました。データベースに bread_favorites テーブルが存在するか確認してください。');
            }
        });
    };

    // 動的カテゴリーの読み込み
    const loadDynamicCategories = async () => {
        try {
            // データベースからカスタムカテゴリーを取得
            const { data: customCategories, error } = await sb.from('categories').select('name').order('name');
            if (error) {
                // テーブルが存在しない場合はスキップ
                if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
                    return;
                }
                return;
            }
            
            if (customCategories && customCategories.length > 0) {
                const categoryFilter = document.querySelector('.category-filter');
                if (categoryFilter) {
                    let addedCount = 0;
                    customCategories.forEach(cat => {
                        // 既存のボタンと重複チェック
                        const existingBtn = Array.from(categoryFilter.querySelectorAll('.category-btn'))
                            .find(btn => btn.dataset.category === cat.name);
                        
                        if (!existingBtn) {
                            // 新しいカテゴリーボタンを作成
                            const newBtn = document.createElement('button');
                            newBtn.className = 'category-btn';
                            newBtn.dataset.category = cat.name;
                            newBtn.textContent = cat.name;
                            
                            // カテゴリーフィルターに追加
                            categoryFilter.appendChild(newBtn);
                            addedCount++;
                        }
                    });
                    
                    if (addedCount > 0) {
                        console.log(`📂 カスタムカテゴリー: ${addedCount}個追加`);
                    }
                }
            }
            
            // 新しく追加されたカテゴリーの通知をチェック
            const newCategoryData = localStorage.getItem('newCategoryAdded');
            if (newCategoryData) {
                const categoryInfo = JSON.parse(newCategoryData);
                // 5分以内に追加されたものは通知表示
                if (Date.now() - categoryInfo.timestamp < 5 * 60 * 1000) {
                    console.log('新しいカテゴリーが追加されました:', categoryInfo.name);
                }
                // 通知済みなので削除
                localStorage.removeItem('newCategoryAdded');
            }
            
            // 削除されたカテゴリーの通知をチェック
            const deletedCategoryData = localStorage.getItem('categoryDeleted');
            if (deletedCategoryData) {
                const categoryInfo = JSON.parse(deletedCategoryData);
                console.log('カテゴリーが削除されました:', categoryInfo.name);
                
                // 即座に画面からカテゴリーボタンを削除
                removeDeletedCategoryButton(categoryInfo.name);
                
                // 通知済みなので削除
                localStorage.removeItem('categoryDeleted');
            }
            
        } catch (error) {
            console.error('動的カテゴリー読み込みエラー:', error);
        }
    };

    // 削除されたカテゴリーボタンを画面から除去する関数
    const removeDeletedCategoryButton = (categoryName) => {
        console.log('カテゴリーボタン削除を実行:', categoryName);
        
        const categoryFilter = document.querySelector('.category-filter');
        if (categoryFilter) {
            // 複数の方法でボタンを検索・削除
            const buttonsToRemove = Array.from(categoryFilter.querySelectorAll('.category-btn'))
                .filter(btn => 
                    btn.dataset.category === categoryName || 
                    btn.textContent.trim() === categoryName
                );
            
            buttonsToRemove.forEach(btn => {
                btn.remove();
                console.log('カテゴリーボタンを削除しました:', categoryName);
            });
            
            // 削除されたカテゴリーが現在選択中の場合、"すべて"にリセット
            if (currentCategoryFilter === categoryName) {
                currentCategoryFilter = 'all';
                updateCategoryButtons();
                updateView();
                console.log('フィルターを"すべて"にリセットしました');
            } else {
                // ボタンの選択状態を更新
                updateCategoryButtons();
            }
            
            // ボタンが削除されたかを確認
            const remainingButtons = Array.from(categoryFilter.querySelectorAll('.category-btn'))
                .filter(btn => btn.dataset.category === categoryName);
            
            if (remainingButtons.length === 0) {
                console.log('カテゴリーボタンの削除完了:', categoryName);
            } else {
                console.warn('まだカテゴリーボタンが残っています:', categoryName, remainingButtons.length);
            }
        }
    };

    // ページ読み込み時にも削除通知をチェック
    const checkForDeletedCategories = () => {
        const deletedCategoryData = localStorage.getItem('categoryDeleted');
        if (deletedCategoryData) {
            try {
                const categoryInfo = JSON.parse(deletedCategoryData);
                console.log('ページ読み込み時にカテゴリー削除通知を検出:', categoryInfo.name);
                removeDeletedCategoryButton(categoryInfo.name);
                localStorage.removeItem('categoryDeleted');
            } catch (e) {
                console.error('削除通知の解析エラー:', e);
                localStorage.removeItem('categoryDeleted');
            }
        }
    };

    // イベントリスナーの設定
    if (newButtons) {
        newButtons.forEach(btn => btn.addEventListener('click', () => location.href = 'pages/recipe_edit.html'));
    }

    // 動的に生成される新規作成ボタン（イベント委譲）
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('js-new-empty') || e.target.classList.contains('js-new')) {
            location.href = 'pages/recipe_edit.html';
        }
        if (e.target.classList.contains('js-bread-recipes')) {
            location.href = 'pages/bread_recipe_list.html';
        }
    });


    const init = async () => {
        cardListEl.innerHTML = '<div class="loading-spinner"></div>';
        
        try {
            const [allResult, favResult, transResult, aiResult, urlResult] = await Promise.allSettled([
                fetchAllRecipes(), 
                fetchFavoriteRecipes(),
                fetchTranslatedRecipes(),
                fetchAIRecipes(),
                fetchURLRecipes()
            ]);

            if (allResult.status === 'rejected') {
                console.error('Failed to fetch all recipes:', allResult.reason);
            }
            if (favResult.status === 'rejected') {
                console.error('Failed to fetch favorites:', favResult.reason);
            }
            if (transResult.status === 'rejected') {
                console.error('Failed to fetch translated recipes:', transResult.reason);
            }
            if (aiResult.status === 'rejected') {
                console.error('Failed to fetch AI recipes:', aiResult.reason);
            }
            if (urlResult.status === 'rejected') {
                console.error('Failed to fetch URL recipes:', urlResult.reason);
            }

            allRecipes = allResult.status === 'fulfilled' ? allResult.value : [];
            favoriteRecipes = favResult.status === 'fulfilled' ? favResult.value : [];
            translatedRecipes = transResult.status === 'fulfilled' ? transResult.value : [];
            aiRecipes = aiResult.status === 'fulfilled' ? aiResult.value : [];
            urlRecipes = urlResult.status === 'fulfilled' ? urlResult.value : [];

            console.log(`✅ 初期化完了: 全レシピ=${allRecipes.length}件, お気に入り=${favoriteRecipes.length}件, 翻訳=${translatedRecipes.length}件,AI=${aiRecipes.length}件,URL=${urlRecipes.length}件`);
            updateStats();
            updateView();
            setupTabs();
            setupSearch();
            setupCategoryFilter();
            setupFavoriteToggle();
            setupBulkSelection();
            checkForDeletedCategories();
            await loadDynamicCategories();
        } catch (error) {
            console.error('Failed to initialize:', error);
            cardListEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h2>データの読み込みに失敗しました</h2>
                    <p>エラー: ${error.message}</p>
                    <button class="btn primary" onclick="location.reload()">
                        <i class="fas fa-redo"></i>
                        再読み込み
                    </button>
                </div>
            `;
        }
    };

    // グローバル関数として公開
    window.clearSearch = clearSearch;

    // ページの可視性変更時に削除通知をチェック
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            console.log('ページが表示されました - 削除通知をチェック');
            setTimeout(checkForDeletedCategories, 100);
        }
    });

    // フォーカス時にも削除通知をチェック
    window.addEventListener('focus', () => {
        console.log('ウィンドウにフォーカス - 削除通知をチェック');
        setTimeout(checkForDeletedCategories, 100);
    });

    // 一括選択機能のイベントリスナー設定
    const setupBulkSelection = () => {
        // 一括選択ボタン
        const bulkSelectBtn = document.querySelector('.js-bulk-select');
        if (bulkSelectBtn) {
            bulkSelectBtn.addEventListener('click', toggleBulkMode);
        }

        // レシピブック作成ボタン
        const bulkPdfBtn = document.querySelector('.js-bulk-pdf');
        if (bulkPdfBtn) {
            bulkPdfBtn.addEventListener('click', createRecipeBook);
        }

        // 一括選択UIのボタン
        const selectAllBtn = document.querySelector('.js-select-all');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', selectAllRecipes);
        }

        const deselectAllBtn = document.querySelector('.js-deselect-all');
        if (deselectAllBtn) {
            deselectAllBtn.addEventListener('click', deselectAllRecipes);
        }

        const createBookBtn = document.querySelector('.js-create-recipe-book');
        if (createBookBtn) {
            createBookBtn.addEventListener('click', createRecipeBook);
        }

        const bulkDeleteBtn = document.querySelector('.js-bulk-delete');
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', bulkDeleteRecipes);
        }

        const cancelBulkBtn = document.querySelector('.js-cancel-bulk');
        if (cancelBulkBtn) {
            cancelBulkBtn.addEventListener('click', toggleBulkMode);
        }

        // 削除確認モーダルのイベントリスナー
        const bulkDeleteModalClose = document.getElementById('bulk-delete-modal-close');
        if (bulkDeleteModalClose) {
            bulkDeleteModalClose.addEventListener('click', hideBulkDeleteModal);
        }

        const bulkDeleteCancel = document.getElementById('bulk-delete-cancel');
        if (bulkDeleteCancel) {
            bulkDeleteCancel.addEventListener('click', hideBulkDeleteModal);
        }

        const bulkDeleteConfirm = document.getElementById('bulk-delete-confirm');
        if (bulkDeleteConfirm) {
            bulkDeleteConfirm.addEventListener('click', executeBulkDelete);
        }

        // モーダル外クリックで閉じる
        const bulkDeleteModal = document.getElementById('bulk-delete-modal');
        if (bulkDeleteModal) {
            bulkDeleteModal.addEventListener('click', (e) => {
                if (e.target === bulkDeleteModal) {
                    hideBulkDeleteModal();
                }
            });
        }

        // レシピカードのクリックイベントをリファクタリング
        cardListEl.addEventListener('click', (e) => {
            const card = e.target.closest('.recipe-card');
            if (!card) return;

            // お気に入りボタンのクリックは、setupFavoriteToggleに任せる
            if (e.target.closest('.favorite-btn')) {
                return;
            }

            const recipeId = card.dataset.id;

            if (isBulkMode) {
                // 一括選択モード時は、選択/解除を行う
                e.preventDefault();
                toggleRecipeSelection(recipeId);
            } else {
                // 通常モード時は、レシピ詳細ページへ遷移
                e.preventDefault();
                if (card.dataset.isBread === 'true') {
                    // パン用レシピの場合
                    localStorage.setItem('selectedBreadRecipeId', recipeId);
                    window.location.href = 'pages/bread_recipe_list.html';
                } else {
                    // 通常のレシピの場合
                    location.href = `pages/recipe_view.html?id=${encodeURIComponent(recipeId)}`;
                }
            }
        });
    };

    // スクロールイベントリスナーで一括選択UIの粘着動作を制御
    let lastScrollTop = 0;
    let bulkUIOriginalPosition = null;
    
    window.addEventListener('scroll', () => {
        if (!isBulkMode) return;
        
        const bulkUI = document.querySelector('.bulk-selection-ui');
        if (!bulkUI) return;
        
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // 最初の位置を記録
        if (bulkUIOriginalPosition === null) {
            const rect = bulkUI.getBoundingClientRect();
            bulkUIOriginalPosition = scrollTop + rect.top;
        }
        
        // スクロール位置に応じてUIの動作を制御
        if (scrollTop >= bulkUIOriginalPosition) {
            // 固定位置に到達したらfixedに変更
            bulkUI.style.position = 'fixed';
            bulkUI.style.top = '0';
            bulkUI.style.left = '0';
            bulkUI.style.right = '0';
            bulkUI.style.width = '100%';
            bulkUI.classList.add('scrolled');
        } else {
            // 元の位置に戻るときはstickyに戻す
            bulkUI.style.position = 'sticky';
            bulkUI.style.left = '';
            bulkUI.style.right = '';
            bulkUI.style.width = '';
            bulkUI.classList.remove('scrolled');
        }
        
        lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
    }, { passive: true });
    
     // 一括モードを終了する時に位置をリセット
     const originalToggleBulkMode = toggleBulkMode;
     if (typeof toggleBulkMode !== 'undefined') {
         // 関数をオーバーライドする代わりに、イベントリスナーで制御
         const resetBulkUIPosition = () => {
             bulkUIOriginalPosition = null;
             const bulkUI = document.querySelector('.bulk-selection-ui');
             if (bulkUI && !isBulkMode) {
                 bulkUI.style.position = '';
                 bulkUI.style.top = '';
                 bulkUI.style.left = '';
                 bulkUI.style.right = '';
                 bulkUI.style.width = '';
                 bulkUI.classList.remove('scrolled');
             }
         };
         
         // 一括モードの状態変化を監視
         setInterval(() => {
             if (!isBulkMode && bulkUIOriginalPosition !== null) {
                 resetBulkUIPosition();
             }
         }, 100);
     }

    // 設定を移行
    console.log('🔧 設定の初期化を開始');
    Settings.migrateSettings();
    
    // 初期化後の設定を確認
    const initialSettings = Settings.get();
    console.log('📊 初期化後の設定:', {
        aiApi: initialSettings.aiApi,
        groqModel: initialSettings.groqModel,
        aiCreativeApi: initialSettings.aiCreativeApi,
        timestamp: new Date().toISOString()
    });
    
    console.log('✅ 設定の初期化完了');
    
    // 設定モーダルを初期化
    console.log('🔧 設定モーダルの初期化を開始');
    setupSettingsModal();
    console.log('✅ 設定モーダルの初期化完了');
    
    init();
});
