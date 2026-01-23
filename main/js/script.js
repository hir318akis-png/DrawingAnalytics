// APIキーの情報を読み込む
import { GEMINI_API_KEY } from './config.js';
// @google/genai ライブラリを読み込む
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// PDF.jsのバックグラウンド処理用ファイルを指定
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

$(document).ready(function () {
    const $dropArea = $('#drop-area');
    const $fileInput = $('#file-input');
    const $resultArea = $('#result-area');
    let selectedFile = null;

    // --- 1. ファイル取込処理（ドラッグ＆ドロップとクリック） ---

    // エリア内をクリックしたらファイル選択ダイアログを開く
    $dropArea.on('click', () => $fileInput.click());

    // ファイル入力自体がクリックされた時は、親(drop-area)に伝えない
    $fileInput.on('click', (e) => {
        e.stopPropagation(); // これが「連鎖を止める」命令です！
    });

    // ドラッグ中の視覚効果
    $dropArea.on('dragover', (e) => {
        e.preventDefault();
        $dropArea.addClass('highlight');
    });

    $dropArea.on('dragleave', () => $dropArea.removeClass('highlight'));

    // ドロップされた時の処理
    $dropArea.on('drop', (e) => {
        e.preventDefault();
        $dropArea.removeClass('highlight');
        const files = e.originalEvent.dataTransfer.files;
        handleFile(files[0]);
    });

    // 2. ファイル選択ダイアログでファイルが選ばれた時の処理
    $fileInput.on('change', (e) => {
        const file = e.target.files[0]; // 選択された1つ目のファイルを取得
        handleFile(file);               // 既存のPDF表示・バリデーション関数へ渡す
        $(e.target).val('');            // 【ポイント】同じファイルを連続で選択しても反応するように、入力をリセットしておく
    });

    // 取り込んだファイルがPDFかチェックし、表示処理へ回す関数
    function handleFile(file) {
        if (!file) return;

        if (file.type !== "application/pdf") {
            alert("PDFファイルのみ選択可能です。");
            return;
        }

        selectedFile = file;
        renderPDF(file); // PDFを表示させる関数を呼び出す
    }

    // --- 2. PDFを画像として表示する処理 ---
    async function renderPDF(file) {
const reader = new FileReader();
    reader.onload = async function () {
        const typedarray = new Uint8Array(this.result);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        const page = await pdf.getPage(1);

        const $container = $('#preview-container');
        
        // --- 改善ポイント：一度空にしてから描画する ---
        $container.fadeOut(200, async function() { // ふわっと消す
            const containerWidth = $container.width();
            const containerHeight = $container.height();
            const unscaledViewport = page.getViewport({ scale: 1.0 });
            const scale = Math.min(containerWidth / unscaledViewport.width, containerHeight / unscaledViewport.height) || 1.0;
            const viewport = page.getViewport({ scale: scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            // コンテナを空にしてCanvasを追加し、ふわっと出す
            $container.empty().append(canvas).fadeIn(300);
        });
    };
    reader.readAsArrayBuffer(file);    }

    // --- 3. 検図開始（Gemini API） ---
    $('#btn-start').on('click', async () => {
        if (!selectedFile) {
            alert("まずはPDFファイルを取り込んでください。");
            return;
        }

        // --- 【追加】解析開始時の処理 ---
        const $overlay = $('#loading-overlay');
        $overlay.removeClass('overlay-hidden'); // オーバーレイを表示
        $resultArea.html("<p>解析中... しばらくお待ちください。</p>");

        try {
            // APIキーの設定（※外部に漏らさないよう注意）
            const API_KEY = GEMINI_API_KEY;
            const genAI = new GoogleGenerativeAI(API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            // 送信用にBase64形式へ変換
            const base64Data = await toBase64(selectedFile);
            // ------------------------------------------------
            // 【後日編集エリア】プロンプトの指示内容
            // ------------------------------------------------
            const prompt = `
                # Role
                あなたは30年の経験を持つベテランの機械設計検図エンジニアです。
                設計者の作成した図面を細部まで精査し、不整合や潜在的なリスクを指摘してください。

                # Goals
                1. 図面内の異なる箇所に記載された寸法値の整合性確認
                2. 注記（一般注記・個別注記）の表現の統一と曖昧さの排除
                3. 過去の類似事例に基づく製造トラブルの予見とアドバイス

                # Input Data
                - [添付画像/PDF]: 設計図面

                # Checkpoints
                ### 1. 寸法値の整合性チェック
                - 正面図、平面図、断面図、および詳細図の間で、同じ部位を指す寸法値に食い違いがないか厳密に照合してください。
                - 合計寸法（外形）と、積み上げられた中間寸法の合計が一致しているか計算してください。

                ### 2. 注記・表現の整合性チェック
                - 語尾（「～のこと」「～とする」）の統一性を確認してください。
                - 読み手（加工現場）によって解釈が分かれる曖昧な表現（「適宜」「十分に」など）を特定し、具体的な数値や基準への書き換え案を提示してください。

                ### 3. 製造リスク・知見のアドバイス
                - 過去の類似した図面から、今回の設計で同様のトラブル（加工困難、干渉、強度不足、バリ取り不可など）が発生する可能性を指摘してください。
                - 形状的に「加工ツールが入らない」「逃げがない」といった、製作上の懸念点があれば列挙してください。

                # Output Format
                必ず以下のJSON形式のみで回答してください。余計な説明文は不要です。
                「検出した対象物を正確に囲む四角形をbox_2dとして出力してください。特に寸法値の食い違いがある場合は、その両方の箇所がわかるように別々のアイテムとして出力してください。」
                [
                    {
                        "category": "重大な不整合",   // ←表示用のカテゴリ名
                        "severity": "high",           // ←【追加】システム判定用レベル (high | medium | low のいずれか)
                        "text": "...",                // 指摘内容
                        "box_2d": [ymin, xmin, ymax, xmax] // 座標
                    }
                ]
                ※box_2dは、図面の左上を[0,0]、右下を[1000,1000]とした時の範囲を数値で入れてください。
                日本語で回答してください。
            `;

            // ------------------------------------------------
            // Geminiへ送信
            const result = await model.generateContent([
                prompt,
                { inlineData: { data: base64Data.split(',')[1], mimeType: "application/pdf" } }
            ]);
            

            // --- Geminiからの回答を受け取った後の処理（書き換え箇所） ---
            const response = await result.response;
            const responseText = response.text();

            let analysisResults = [];
            try {
                // 文字列の中から [ から始まり ] で終わる部分だけを抜き出す
                const startBracket = responseText.indexOf('[');
                const endBracket = responseText.lastIndexOf(']');
                
                if (startBracket !== -1 && endBracket !== -1) {
                    const jsonString = responseText.substring(startBracket, endBracket + 1);
                    analysisResults = JSON.parse(jsonString);
                } else {
                    throw new Error("解析結果の形式が正しくありませんでした。");
                }
            } catch (e) {
                console.error("JSON解析エラー:", e);
                $resultArea.html('<p style="color:red;">AIの回答を読み取れませんでした。もう一度お試しください。</p>');
                return; // ここで処理を中断
            }


            // 表示エリアを一度空にする
            $resultArea.empty();

            // 【追加】もし結果が空だった場合の表示
            if (!Array.isArray(analysisResults) || analysisResults.length === 0) {
                $resultArea.html('<p style="padding:20px;">指摘事項は見つかりませんでした。</p>');
            }

            analysisResults.forEach((item) => {
                // severityの値がもし無い場合は 'low' 扱いにする（エラー回避）
                const severityLevel = item.severity || 'low';

                // 1. 結果リストの要素を作る
                // 【ポイント】 severity-high などのクラスを動的に埋め込む
                const $div = $(`
                    <div class="result-item severity-${severityLevel}">
                        <span class="result-category">【${item.category}】</span>
                        <div class="result-text">${item.text}</div>
                    </div>
                `);

                // 2. 図面の上に置く「赤い枠」を作る
                const $highlight = $('<div class="highlight-box"></div>').appendTo('#preview-container');

                // 3. リストにマウスを乗せた時の動き
                $div.on('mouseenter', () => {
                    const canvas = $('#preview-container canvas')[0];
                    if (!canvas) return;

                    // 図面の実際の表示サイズを取得
                    const cw = canvas.clientWidth;
                    const ch = canvas.clientHeight;
                    
                    // 0-1000の座標をピクセルに変換
                    const top    = (item.box_2d[0] / 1000) * ch;
                    const left   = (item.box_2d[1] / 1000) * cw;
                    const height = ((item.box_2d[2] - item.box_2d[0]) / 1000) * ch;
                    const width  = ((item.box_2d[3] - item.box_2d[1]) / 1000) * cw;

                    // 赤い枠の位置をセットして表示
                    $highlight.css({
                        top: canvas.offsetTop + top,
                        left: canvas.offsetLeft + left,
                        width: width,
                        height: height,
                        display: 'block'
                    });
                });

                // 4. マウスを離した時に枠を消す
                $div.on('mouseleave', () => {
                    $highlight.hide();
                });

                $resultArea.append($div);
            });


        } catch (error) {
            console.error(error);
            $resultArea.text("エラーが発生しました: " + error.message);
        } finally {
        // --- 【追加】完了時（成功・失敗問わず）にオーバーレイを隠す ---
        $overlay.addClass('overlay-hidden');
        }
    });

    // --- 【追加】解析中に画面（オーバーレイ）をクリックした時の警告 ---
    $('#loading-overlay').on('click', () => {
        alert("現在AIが解析を行っています。完了までそのままお待ちください。");
    });



    $('#btn-save-pdf').on('click', function () {
        // 解析結果が空の場合は警告
        if ($resultArea.find('.result-placeholder').length > 0 || $resultArea.text() === "解析中...") {
            alert("保存する解析結果がありません。");
            return;
        }

        // PDF変換の設定
        const element = document.getElementById('export-area');
        const opt = {
            margin: 10,
            filename: '検図結果_' + new Date().getTime() + '.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 }, // 解像度を上げる
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        // PDF生成・実行
        html2pdf().set(opt).from(element).save();
    });


    // ファイルをBase64文字列に変換するための補助関数
    function toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    // // AIの回答からJSONを安全に取り出す関数
    // function safeParseJSON(text) {
    //     try {
    //         // 文字列の中から [ ] の範囲を抽出する
    //         const start = text.indexOf('[');
    //         const end = text.lastIndexOf(']');
    //         if (start === -1 || end === -1) throw new Error("JSON形式が見つかりませんでした。");
            
    //         const jsonStr = text.substring(start, end + 1);
    //         return JSON.parse(jsonStr);
    //     } catch (e) {
    //         console.error("Parse Error:", e);
    //         return null;
    //     }
    // }




    // --- 4. 終了処理 ---
    $('#btn-exit').on('click', () => {
        if (confirm("画面を閉じますか？（保存されていないデータは失われます）")) {
            window.close();
            // ブラウザのセキュリティ設定で閉じない場合のフォロー
            alert("ブラウザのタブを直接閉じてください。");
        }
    });
});