// Save our current training params before doing a thing
let params_loaded = false;
let training_started = false;
let closeBtn;
let modalShown = false;
let locked = false;
let listenersSet = false;
let timeouts = [];
let listeners = {};

function save_config() {
    let btn = gradioApp().getElementById("db_save_config");
    if (btn == null) return;
    let do_save = true;
    if (params_loaded === false) {
        do_save = confirm("Warning: Current UI Params have not been saved. Press 'OK' to save them now, or 'Cancel' to continue without saving.");
    }
    if (do_save === true) {
        btn.click();
        params_loaded = true;
    }
}

function toggleComponents(enable, disableAll) {
    const elements = ['DbTopRow', 'SettingsPanel'];
    if (disableAll) {
        console.log("Disabling all DB elements!");
        elements.push("ModelPanel")
        locked = true;
    }
    elements.forEach(element => {
        let elem = getRealElement(element);
        if (elem === null || elem === undefined) {
            console.log("Can't find element: ", element);
        } else {
            const labels = elem.getElementsByTagName('label');
            const inputs = elem.querySelectorAll("input, textarea, button");

            Array.from(labels).forEach(label => {
                if (enable) {
                    label.classList.remove('!cursor-not-allowed');
                } else {
                    label.classList.add('!cursor-not-allowed');
                }
            });

            Array.from(inputs).forEach(input => {
                if (input.id.indexOf("secret") === -1) {
                    input.disabled = !enable;
                }
            });
        }
    });
}

// Disconnect a gradio mutation observer, update the element value, and reconnect the observer?
function updateInputValue(elements, newValue) {
    const savedListeners = [];
    const savedObservers = [];

    elements.forEach((element) => {
        // Save any existing listeners and remove them
        const listeners = [];
        const events = ['change', 'input'];
        events.forEach((event) => {
            if (element['on' + event]) {
                listeners.push({
                    event,
                    listener: element['on' + event],
                });
                element['on' + event] = null;
            }
            const eventListeners = element.getEventListeners?.(event);
            if (eventListeners) {
                eventListeners.forEach(({listener}) => {
                    listeners.push({
                        event,
                        listener,
                    });
                    element.removeEventListener(event, listener);
                });
            }
        });
        savedListeners.push(listeners);

        // Save any existing MutationObservers and disconnect them
        const observer = new MutationObserver(() => {
        });
        if (observer && element.tagName === 'INPUT') {
            observer.observe(element, {
                attributes: true,
                attributeFilter: ['value'],
            });
            savedObservers.push(observer);
            observer.disconnect();
        } else {
            savedObservers.push(null);
        }

        // Update the value of the element
        element.value = newValue;
    });

    // Restore any saved listeners and MutationObservers
    savedListeners.forEach((listeners, i) => {
        const element = elements[i];
        listeners.forEach(({event, listener}) => {
            if (listener) {
                element.addEventListener(event, listener);
            }
        });
    });

    savedObservers.forEach((observer, i) => {
        const element = elements[i];
        if (observer) {
            observer.observe(element, {
                attributes: true,
                attributeFilter: ['value'],
            });
        }
    });
}


// Fix steps on sliders. God this is a lot of work for one stupid thing...
function handleNumberInputs() {
    const numberInputs = gradioApp().querySelectorAll('input[type="number"]');
    numberInputs.forEach((numberInput) => {
        const step = Number(numberInput.step) || 1;
        const parentDiv = numberInput.parentElement;
        const labelFor = parentDiv.querySelector('label');
        if (labelFor) {
            const tgt = labelFor.getAttribute("for");
            if (listeners[tgt]) return;
            const rangeInput = getRealElement(tgt);
            if (rangeInput && rangeInput.type === 'range') {
                let timeouts = [];
                listeners[tgt] = true;
                numberInput.oninput = () => {
                    if (timeouts[tgt]) {
                        clearTimeout(timeouts[tgt]);
                    }
                    timeouts[tgt] = setTimeout(() => {
                        let value = Number(numberInput.value) || 0;
                        const min = parseFloat(rangeInput.min) || 0;
                        const max = parseFloat(rangeInput.max) || 100;
                        if (value < min) {
                            value = min;
                        } else if (value > max) {
                            value = max;
                        }
                        const remainder = value % step;
                        if (remainder !== 0) {
                            value -= remainder;
                            if (remainder >= step / 2) {
                                value += step;
                            }
                        }
                        if (value !== numberInput.value) {
                            numberInput.value = value;
                        }
                    }, 500);
                };

            }
        }
    });
}


function check_save() {
    let do_save = true;
    if (params_loaded === false) {
        do_save = confirm("Warning: You are about to save model parameters that may be empty or from another model. This may erase or overwrite existing settings. If you still wish to continue, click 'OK'.");
    }
    if (do_save === true) {
        let filtered = filterArgs(arguments.length, arguments);
        let status = getRealElement("db_status");
        status.innerHTML = "Config saved."
        params_loaded = true;
        return filtered;
    } else {
        console.log("Saving canceled.")
        return null;
    }
}

function clear_loaded() {
    if (arguments[0] !== "") {
        toggleComponents(true, false);
        let hintRow = getRealElement("hint_row");
        hintRow.style.display = "none";
    }

    params_loaded = false;
    return filterArgs(1, arguments);
}

function update_params() {
    if (params_loaded === false) {
        params_loaded = true;
    }
    setTimeout(function () {
        let btn = gradioApp().getElementById("db_update_params");
        if (btn == null) return;
        btn.click();
    }, 500);
}

function getRealElement(selector) {
    let elem = gradioApp().getElementById(selector);
    if (elem) {
        let child = elem.querySelector('#' + selector);
        if (child) {
            return child;
        } else {
            return elem;
        }
    }
    return elem;
}

// Handler to start save config, progress bar, and filtering args.
function db_start(numArgs, save, startProgress, args) {
    if (save) save_config();
    if (startProgress) requestDbProgress();
    let items = ['db_status', 'db_prompt_list', 'db_gallery_prompt', "db_progressbar"];
    for (let elem in items) {
        let sel = items[elem];
        let outcomeDiv = getRealElement(sel);
        if (outcomeDiv) {
            outcomeDiv.innerHTML = '';
        }
    }


    return filterArgs(numArgs, args);
}

function db_start_sample() {
    return db_start(18, false, true, arguments);
}

function db_start_crop() {
    return db_start(5, false, true, arguments);
}

// Performance wizard
function db_start_pwizard() {
    return db_start(1, false, false, arguments);
}

// Training wizard
function db_start_twizard() {
    return db_start(1, true, false, arguments);
}

// Generate checkpoint
function db_start_checkpoint() {
    return db_start(1, true, true, arguments);
}

// Generate sample prompts
function db_start_prompts() {
    return db_start(1, true, false, arguments);
}

function db_start_logs() {
    return db_start(2, false, true, arguments);
}

// Debug bucketing
function db_start_buckets() {
    return db_start(3, true, true, arguments);
}

function db_start_load_params() {
    update_params();
    return db_start(1, false, false, arguments);
}

// Create new checkpoint
function db_start_create() {
    clear_loaded();
    return db_start(8, false, true, arguments);
}

// Train!
function db_start_train() {
    training_started = true;
    return db_start(2, true, true, arguments);
}

// Generate class images
function db_start_classes() {
    return db_start(2, true, true, arguments);
}

// Return only the number of arguments given as an input
function filterArgs(argsCount, arguments) {
    let args_out = [];
    if (arguments.length >= argsCount && argsCount !== 0) {
        for (let i = 0; i < argsCount; i++) {
            args_out.push(arguments[i]);
        }
    }
    return args_out;
}

let db_titles = {
    "API密鑰": "用於保護 Web API。單擊右側的刷新按鈕以（重新）生成您的密鑰，單擊垃圾桶圖標將其刪除。",
    "應用水平翻轉": "隨機決定水平翻轉圖像。",
    "每批數量": "每個訓練步驟一次要處理多少圖像？",
    "緩存潛在的": "選中此框時，將緩存潛伏。緩存潛伏將使用更多 VRAM，但會提高訓練速度。",
    "取消": "取消訓練。",
    "中心裁剪": "如果圖像太大，請從中心裁剪它。",
    "分類批次大小": "一次要生成多少分類/正則化圖像。",
    "每個實例圖片的分類圖片數量": "每個實例圖像要使用多少分類圖像。",
    "分類提詞": "生成分類/正則化圖像的提示。有關更多信息，請參閱自述文件。",
    "分類名稱": "當使用 [filewords] 時，這是要在現有提示中使用/查找的類標識符。應該是一個單詞。",
    "分類CFG比例": "用於分類器/正則化圖像的無分類器指導量表。",
    "分類數據集目錄": "包含分類/正則化圖像的目錄。",
    "分類圖片反向提詞": "生成類圖像時使用的否定提示。可留空。",
    "分類步驟": "生成分類器/正則化圖像時使用的步驟數。",
    "凍結 CLIP 正規化層": "在訓練期間保持 CLIP 的規範化層凍結。高級用法，可能會提高模型性能和可編輯性。",
    "Clip 跳過": "使用文本編碼器後面第 n 層的輸出 (n>=1)",
    "概念列表": "概念 JSON 文件或 JSON 字符串的路徑。",
    "常數/線性起始因子": "將初始學習率設置為 main_lr * 此值。如果您的目標 LR 為 .000006 並將其設置為 .5，則調度程序將從 .000003 開始並增加直到達到 .000006。",
    "從huggingface創建": "從Huggingface.co導入模型，而不是使用本地檢查點。Hub模型必須包含擴散權重。",
    "創建模型": "創建一個新模型。",
    "創建": "已經創建了模型。",
    "自定義模型名稱": "保存 .ckpt 和 .pt 文件時使用的自定義名稱。子目錄也將以此命名。",
    "實例圖像數據目錄": "包含訓練圖像的目錄。",
    "除錯": "檢查實例和類圖像並報告沒有相應類圖像的任何實例圖像。",
    "Discord Webhook": "生成後將訓練樣本發送到 Discord 頻道。",
    "Existing Prompt Contents": "如果使用 [filewords]，這將告訴字符串生成器現有提示的格式。",
    "提取EMA權重": "如果 EMA 權重保存在模型中，這些將被提取而不是完整的 Unet。可能不需要訓練或微調。",
    "凍結 CLIP 正規化層": "在訓練期間保持 CLIP 的規範化層凍結。高級用法，可能會提高模型性能和可編輯性。",
    "產生CKPT": "在當前訓練級別生成一個CKPT。",
    "生成分類圖片": "在沒有訓練的情況下使用訓練設置創建分類圖像。",
    "使用 txt2img 生成分類圖": "使用源檢查點和 TXT2IMG 生成類圖像。",
    "Generate Classification Images to match Instance Resolutions": "而不是生成正方形類圖像，它們將以與類圖像相同的分辨率生成。",
    "生成圖形": "從訓練日誌中生成圖表，顯示訓練過程中的學習率和平均損失。",
    "生成樣本圖像": "使用當前保存的模型生成樣本圖像。",
    "產生樣本": "在下一個訓練週期後生成樣本。",
    "在訓練期間保存時生成 .ckpt 文件。": "啟用後，將在訓練進行時以指定的訓練週期生成CKPT。這也可以在訓練進行時使用“保存權重”按鈕控製手動生成。",
    "在訓練完成時生成 .ckpt 文件。": "啟用後，訓練成功完成後將生成一個CKPT。",
    "在訓練取消時生成 .ckpt 文件。": "啟用後，當用戶取消訓練時將生成一個CKPT。",    
    "生成附加網路的LoRA。(警告:如有使用LoRA擴充功能，此選項無效)": "啟用後，將在models\Lora目錄生成相容的lora.safetensors模型。與[lora擴充]不相容。",
    "在訓練期間保存時生成 lora。": "啟用後，將在訓練期間在每個指定的訓練週期生成 lora .pt 文件。這也會影響手動點擊“保存權重”按鈕時是否生成 .pt 文件。",
    "在訓練完成時生成 lora。": "啟用後，訓練完成後將生成 lora .pt 文件。",
    "在訓練取消時生成 lora。": "啟用後，當用戶取消訓練時，將生成 lora .pt 文件。",
    "梯度累積步數": "在進行反向傳播/更新之前累積的更新步驟數前。您應該嘗試將其設置為與您的批次大小相同。",
    "梯度檢查點": "這是一種通過清除某些層的激活並在向後傳遞期間重新計算它們來減少內存使用量的技術。實際上，這會以額外的計算時間來換取減少的內存使用量。",
    "圖形平滑步驟": "要平滑圖形數據的時間步長。較低的值表示圖形會更加崎嶇，但提供更多的信息，較高的值會使圖形變得更美觀，但略微不太準確。",
    "半精度模型": "啟用此功能以生成具有fp16精度的模型。結果是更小的檢查點，品質幾乎沒有損失。",
    "HuggingFace 憑證": "您的Huggingface憑證，用於複製文件。",
    "實例提詞": "描述主題的提示。使用[Filewords]解析圖像文件名/.txt，以將現有提示插入此處。",
    "實例名稱": "在使用[Filewords]時，這是獨特於您的主題的實例識別符。應為單個單詞。",
    "學習率演算法": "要使用的學習率調度器。除了'constant'外，所有調度器都使用提供的熱身時間。",
    "學習率預熱步數": "lr調度器中用於熱身的步數。LR將從0開始並在指定的步數內增加到此值。",
    "學習率": "模型學習的速率。默認值為2e-6。",
    "讀取設定": "加載模型的上次保存的訓練參數。",
    "Log Memory": "記錄當前GPU內存使用情況。",
    "LoRA 模型": "繼續微調或產生檢查點時要載入的Lora模型。",
    "使用 LoRA 擴充": "使用 ResNet 層來訓練 Lora 模型。這將始終提高質量和可編輯性，但會導致更大的文件。",
    "Lora UNET等級": "Lora UNET的等級（預設值為4）。等級越高，品質和可編輯性越好，但檔案大小也越大。等級越低，品質越低，檔案大小越小。不同值下的學習率有不同的工作方式。以高精度(fp32)保存的Lora會導致較大的Lora檔案。",
    "Lora Text Encoder等級": "Lora 文本編碼器的等級（預設為 4）。等級越高，品質越好，但文件大小越大。等級越低，牺牲品質，文件大小越小。在不同的等級下，學習率的運作方式也不同。以高精度 (fp32) 保存的 Lora 將導致更大的 Lora 文件。",
    "Lora Text Encoder學習率": "用於訓練Lora Text Encoder的學習速率。常規學習速率被忽略。",
    "Lora 文本權重": "在創建模型時應該將多少Lora權重應用於文本編碼器。",
    "Lora UNET學習率": "用於訓練Lora UNet的學習速率。常規學習速率被忽略。",
    "Lora 權重": "在創建檢查點時應該將多少Lora權重應用於UNet。",
    "最高解析度": "輸入圖片的解析度。當使用 bucketing時，這是圖片的最大尺寸。",
    "最大標記長度": "要讀取的最大提詞長度。您可能希望將其設置為75。",
    "Memory Attention": "要使用的記憶體注意力機制。'Xformers' 會提供比 flash_attention 更好的效能，但需要另外安裝。",
    "最小學習率": "學習率會隨時間降至的最小值。",
    "混合精度": "使用 FP16 或 BF16（如果可用）可以提高內存效能。當使用 'Xformers' 時必須使用。",
    "模型路徑": "在 huggingface 上的模型 URL。格式應為 '開發者/模型名稱'。",
    "模型": "要訓練的模型。",
    "名稱": "要創建的模型名稱。",
    "硬重置數量": "cosine_with_restarts 調度器中 lr 的硬重置次數。",
    "生成樣本的數量": "每個主題要生成的樣本數量。",
    "噪聲偏移": "此功能允許模型在訓練期間更詳細地學習亮度和對比度。該值控制效果的強度，0 表示禁用該功能。",
    "填充標記": "將輸入圖像的 token 長度填充到這個數量。建議這樣做。",
    "N階段後暫停": "訓練多少個 epoch 後暫停指定時間。如果您想讓 GPU 休息一下，這很有用。",
    "性能嚮導 (WIP)": "嘗試根據 VRAM 自動設置訓練參數。仍在開發中。",
    "多項式功率": "多項式調度器的指數因子。",
    "預訓練VAE名稱或路徑": "若要使用替代 VAE，可以指定包含 pytorch_model.bin 的目錄路徑。",
    "預覽提示": "生成用於訓練的提示數據的 JSON。",
    "先前損失權重": "先前損失權重。",
    "樣本CFG比例": "用於預覽圖像的分類器自由指導比例尺。",
    "樣本圖片提詞": "生成預覽圖像時要使用的提示。",
    "樣本反向提詞": "生成預覽圖像時要使用的反向提詞。",
    "樣本提詞文件": "用於樣本提示的txt文件的路徑。使用[filewords]或[name]在樣本提示中插入分類標記。",
    "樣本提詞": "生成樣本圖像時要使用的提示。",
    "樣本種子": "生成樣本時要使用的種子。設置為-1以在每次使用時使用隨機種子。",
    "樣本步數": "生成分類器/正規化圖像時要使用的步數。",
    "樣本提示": "用於生成“基準”圖像的提示，此圖像將與其他樣本一起創建以驗證模型的忠實度。",
    "樣本種子": "生成驗證樣本圖像時要使用的種子。不支援-1。",
    "保存檢查點到子目錄": "啟用時，將在所選檢查點文件夾的子目錄中保存檢查點。",
    "保存模型頻率（訓練週期）": "每N個訓練週期保存一個檢查點。",
    "保存模型頻率（訓練週期）": "每N個訓練週期儲存一個檢查點。必須能夠被批次數整除。",
    "保存預覽頻率（訓練週期）": "每N個訓練週期生成一次預覽圖像。",
    "保存預覽頻率（訓練週期）": "每N個訓練週期生成預覽圖像。必須能夠被批次數整除。",
    "儲存設定": "將當前訓練參數保存到模型配置文件中。",
    "儲存權重": "根據保存部分指定的方式，保存權重/檢查點/快照以在訓練期間進行保存。",
    "保存和測試Webhook": "保存當前輸入的webhook URL並向其發送測試消息。",
    "在訓練期間保存獨立的模型。": "啟用時，每個指定的訓練週期間隔都會保存擴散權重的階段。這使用更多HDD空間（很多），但允許從訓練中恢復，包括優化狀態。",
    "訓練完成後保存獨立的模型。": "啟用時，在訓練完成時會保存擴散權重的階段。這會使用更多HDD空間，但允許從訓練中恢復，包括優化狀態。",
    "當訓練被取消時保存獨立的模型。": "啟用時，當訓練被取消時，會保存擴散權重的階段。這會使用更多HDD空間，但允許從訓練中恢復，包括優化器狀態。",
    "將EMA權重保存到生成的模型中": "如果模型是使用 EMA weights 提取或訓練的，這些權重將被分別附加到模型上，以供稍後在訓練中使用。",
    "比例位置": "訓練百分比，在此百分比處應實現“最終”學習率。如果在100個訓練週期中將其設置為0.25，則最終LR將在第25個訓練週期達到。",
    "排程演算法:": "使用的模型排程器。僅適用於 2.0 之前的模型。",
    "將梯度設置為0的時候設置為無": "在進行反向傳遞時，梯度將設置為無，而不是創建一個新的空張量。這將稍微提高 VRAM。",
    "Shuffle After Epoch": "啟用後，將在第一個 epoch 後對數據集進行洗牌。這將啟用文本編碼器訓練和潛在緩存（更多 VRAM）。",
    "Shuffle After Epoch": "啟用後，將在第一個 epoch 後對數據集進行洗牌。這將啟用文本編碼器訓練和潛在緩存（更多 VRAM）。",
    "來源模型": "用於訓練的源檢查點。",
    "文本編碼器訓練步驟比率": "每個圖像（訓練週期）訓練文本編碼器的步數。將 0.5 設置為 50% 的 epoch。",
    "嚴格的提詞": "將以以下字符 [,;.!?] 分隔的實例提示解析，並在使用分詞器時防止拆分標記。如果您的提示被很多標記分隔，這將非常有用。",
    "分類/正則化圖片的總數": "要使用的分類/正則化圖像的總數。如果不存在圖像，將生成圖像。將其設置為 0 以禁用先前的保留。",
    "僅意象訓練": "使用 Imagic 進行訓練，而不是使用完整的 Dreambooth，這對於使用單個實例圖像進行訓練很有用。",
    "Train Text Encoder": "啟用此功能將提供更好的結果和可編輯性，但VRAM更高。",
    "訓練": "開始訓練。",
    "每張圖片的訓練步數（訓練週期）":"這是在每個實例圖像上執行的總訓練步數。",
    "訓練精靈（物品/風格）": "根據示例圖像的數量計算非人類主體的訓練參數並設置學習率。禁用先前保留功能。",
    "訓練精靈（人物）": "根據示例圖像的數量計算人類主體的訓練參數並設置學習率。啟用先前保留功能。",
    "解凍模型": "解凍模型層並允許進行更好的訓練，但更有可能增加 VRAM 的使用。",
    "使用8bit Adam": "啟用此功能可節省 VRAM。",
    "Use CPU Only (SLOW)": "Guess what - this will be incredibly slow, but it will work for < 8GB GPUs.",
    "使用概念列表": "從 JSON 文件或字符串訓練多個概念。",
    "使用EMA": "啟用此功能可提供更好的結果和編輯性，但成本更高的 VRAM。",
    "使用EMA權重進行推論": "啟用此功能將會將 EMA UNET 的權重儲存為「正常」模型的權重並忽略常規 UNET 的權重。",
    "Use Epoch Values for Save Frequency": "啟用此功能時，保存頻率是基於訓練週期。當禁用時，頻率是基於訓練步驟數的。",
    "使用 LoRA": "使用低秩適應進行快速文本到圖像擴散微調。使用較少的 VRAM，保存為 .pt 文件而不是完整的檢查點",
    "Use Lifetime Epochs When Saving": "When checked, will save preview images and checkpoints using lifetime epochs, versus current training epochs.",
    "Use Lifetime Steps When Saving": "When checked, will save preview images and checkpoints using lifetime steps, versus current training steps.",
}

// Do a thing when the UI updates
onUiUpdate(function () {
    let db_active = document.getElementById("db_active");
    if (db_active) {
        db_active.parentElement.style.display = "none";
    }

    let cm = getRealElement("change_modal");
    let cl = getRealElement("change_log");
    if (cm && cl) {
        if (cl.innerHTML !== "" && modalShown !== true) {
            modalShown = true;
            //cm.classList.add("active");
        }
    }

    let errors = getRealElement("launch_errors");
    if (errors !== null && errors !== undefined && !locked && errors.innerHTML !== "") {
        let hr = getRealElement("hint_row");
        hr.innerHTML = errors.innerHTML;
        toggleComponents(false, true);
    }

    if (closeBtn === null || closeBtn === undefined) {
        let cb = getRealElement("close_modal");
        closeBtn = cb;
        if (cb && cm) {
            toggleComponents(false, false);
            cb.addEventListener("click", function () {
                cm.classList.remove("active");
            });
        }
    }

    db_progressbar();

    gradioApp().querySelectorAll('span, button, select, p').forEach(function (span) {
        let tooltip = db_titles[span.textContent];
        if (span.disabled || span.classList.contains(".\\!cursor-not-allowed")) {
            tooltip = "Select or Create a Model."
        }

        if (!tooltip) {
            tooltip = db_titles[span.value];
        }

        if (!tooltip) {
            for (const c of span.classList) {
                if (c in db_titles) {
                    tooltip = db_titles[c];
                    break;
                }
            }
        }

        if (tooltip) {
            span.title = tooltip;
        }

    });

    gradioApp().querySelectorAll('select').forEach(function (select) {
        if (select.onchange != null) return;
        select.onchange = function () {
            select.title = db_titles[select.value] || "";
        }
    });

    gradioApp().querySelectorAll('.gallery-item').forEach(function (btn) {
        if (btn.onchange != null) return;
        btn.onchange = function () {
            // Dummy function, so we don't keep setting up the observer.
        }
        checkPrompts();
        const options = {
            attributes: true
        }

        function callback(mutationList, observer) {
            mutationList.forEach(function (mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    checkPrompts();
                }
            });
        }

        const observer = new MutationObserver(callback);
        observer.observe(btn, options);

    });
    try {
        handleNumberInputs();
    } catch (e) {
        console.log("Gotcha: ", e);
    }

});

function checkPrompts() {
    let prevSelectedIndex = selected_gallery_index();
    let desc_list = getRealElement("db_prompt_list");
    let des_box = getRealElement("db_gallery_prompt");
    let prompts = desc_list.innerHTML;
    if (prompts.includes("<br>")) {
        let prompt_list = prompts.split("<br>");
        if (prevSelectedIndex !== -1 && prevSelectedIndex < prompt_list.length) {
            des_box.innerHTML = prompt_list[prevSelectedIndex];
        }
    }
}

let progressTimeout = null;
let galleryObserver = null;
let gallerySet = false;

function db_progressbar() {
    // gradio 3.8's enlightened approach allows them to create two nested div elements inside each other with same id
    // every time you use gr.HTML(elem_id='xxx'), so we handle this here
    let progressbar = gradioApp().querySelector("#db_progressbar #db_progressbar");
    let progressbarParent;
    if (progressbar) {
        progressbarParent = gradioApp().querySelector("#db_progressbar");
    } else {
        progressbar = gradioApp().getElementById("db_progressbar");
        progressbarParent = null;
    }

    let galleryButtons = gradioApp().querySelectorAll('#db_gallery .gallery-item');
    let gallery = gradioApp().getElementById("db_gallery");

    if (gallery !== null && gallery !== undefined) {
        if (galleryButtons.length !== 0) {
            gallery.style.display = "block";
        } else {
            gallery.style.display = "none !important";
        }
    }
    // let skip = id_skip ? gradioApp().getElementById(id_skip) : null;
    let interrupt = gradioApp().getElementById("db_cancel");
    let gen_sample = gradioApp().getElementById("db_train_sample");
    let gen_ckpt = gradioApp().getElementById("db_gen_ckpt");
    let gen_ckpt_during = gradioApp().getElementById("db_gen_ckpt_during")
    let train = gradioApp().getElementById("db_train");

    if (progressbar && progressbar.offsetParent) {
        if (progressbar.innerText) {
            let newtitle = '[' + progressbar.innerText.trim() + '] Stable Diffusion';
            if (document.title !== newtitle) {
                document.title = newtitle;
            }
        } else {
            let newtitle = 'Stable Diffusion'
            if (document.title !== newtitle) {
                document.title = newtitle;
            }
        }
    }

    if (progressbar != null) {
        let mutationObserver = new MutationObserver(function (m) {
            if (progressTimeout) {
                return;
            }

            let progress_indicator = gradioApp().querySelector("#db_active input[type='checkbox']");
            let is_active = progress_indicator.checked;

            let progressDiv = gradioApp().querySelector(".progressDiv");
            if (progressbarParent && progressDiv) {
                progressbar.style.width = progressbarParent.clientWidth + "px";
                progressDiv.style.width = progressbarParent.clientWidth + "px";
            }

            let preview = gradioApp().getElementById("db_preview");
            let gallery = gradioApp().getElementById("db_gallery");

            if (preview != null && gallery != null) {
                preview.style.width = gallery.clientWidth + "px"
                preview.style.height = gallery.clientHeight + "px"

                //only watch gallery if there is a generation process going on
                checkDbGallery();

                if (is_active) {
                    progressTimeout = window.setTimeout(function () {
                        requestMoreDbProgress();
                    }, 500);
                } else {
                    training_started = false;
                    interrupt.style.display = "none";
                    gen_sample.style.display = "none";
                    gen_ckpt_during.style.display = "none";
                    gen_ckpt.style.display = "block";
                    train.style.display = "block";

                    //disconnect observer once generation finished, so user can close selected image if they want
                    if (galleryObserver) {
                        galleryObserver.disconnect();
                        galleryObserver = null;
                        gallerySet = false;
                    }
                }
            }

        });
        mutationObserver.observe(progressbar, {childList: true, subtree: true});
    }
}

function checkDbGallery() {
    if (gallerySet) return;
    let gallery = gradioApp().getElementById("db_gallery");
    // if gallery has no change, no need to setting up observer again.
    if (gallery) {
        if (galleryObserver) {
            galleryObserver.disconnect();
        }
        // Get the last selected item in the gallery.
        let prevSelectedIndex = selected_gallery_index();

        // Make things clickable?
        galleryObserver = new MutationObserver(function () {
            let galleryButtons = gradioApp().querySelectorAll('#db_gallery .gallery-item');
            let galleryBtnSelected = gradioApp().querySelector('#db_gallery .gallery-item.\\!ring-2');
            let gallery = gradioApp().getElementById("db_gallery");
            if (galleryButtons.length !== 0) {
                gallery.style.display = "block";
            } else {
                gallery.style.display = "none !important";
            }

            if (prevSelectedIndex !== -1 && galleryButtons.length > prevSelectedIndex && !galleryBtnSelected) {
                // automatically re-open previously selected index (if exists)
                let activeElement = gradioApp().activeElement;
                let scrollX = window.scrollX;
                let scrollY = window.scrollY;

                galleryButtons[prevSelectedIndex].click();

                // When the gallery button is clicked, it gains focus and scrolls itself into view
                // We need to scroll back to the previous position
                setTimeout(function () {
                    window.scrollTo(scrollX, scrollY);
                }, 50);

                if (activeElement) {
                    setTimeout(function () {
                        activeElement.focus({
                            preventScroll: true // Refocus the element that was focused before the gallery was opened without scrolling to it
                        })
                    }, 1);
                }
            }
        })
        galleryObserver.observe(gallery, {childList: true, subtree: false});
        gallerySet = true;

    }
}

function requestDbProgress() {
    let btn = gradioApp().getElementById("db_check_progress_initial");
    if (btn == null) {
        console.log("Can't find da button!.")
        return;
    }
    btn.click();
    db_progressbar();
}

function requestMoreDbProgress() {
    let btn = gradioApp().getElementById("db_check_progress");
    if (btn == null) {
        console.log("Check progress button is null!");
        return;
    }
    btn.click();
    progressTimeout = null;
    let progressDiv = gradioApp().querySelectorAll('#db_progress_span').length > 0;
    // TODO: Eventually implement other skip/cancel buttons.
    // let skip = id_skip ? gradioApp().getElementById("db_skip") : null;
    let interrupt = gradioApp().getElementById("db_cancel");
    let train = gradioApp().getElementById("db_train");
    let gen_sample = gradioApp().getElementById("db_train_sample");
    let gen_ckpt = gradioApp().getElementById("db_gen_ckpt");
    let gen_ckpt_during = gradioApp().getElementById("db_gen_ckpt_during");
    if (progressDiv && interrupt && train && gen_sample) {
        if (training_started) {
            gen_sample.style.display = "block";
            train.style.display = "none";
            interrupt.style.display = "block";
            gen_ckpt.style.display = "none";
            gen_ckpt_during.style.display = "block";
        } else {
            train.style.display = "none";
            interrupt.style.display = "block";
            gen_ckpt.style.display = "none";
        }
    }
}
