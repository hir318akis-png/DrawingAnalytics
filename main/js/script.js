// APIキーの情報を読み込む
import { GEMINI_API_KEY } from './config.js';
// @google/genai ライブラリを読み込む
import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

// PDF.jsのバックグラウンド処理用ファイルを指定
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

$(document).ready(function() {
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

        // 【ポイント】同じファイルを連続で選択しても反応するように、入力をリセットしておく
        $(e.target).val('');
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
        reader.onload = async function() {
            const typedarray = new Uint8Array(this.result);
            // PDFを読み込む
            const pdf = await pdfjsLib.getDocument(typedarray).promise;
            // 1ページ目を取得
            const page = await pdf.getPage(1);

            // プレビューエリアの表示可能サイズを取得
            const $container = $('#preview-container');
            const containerWidth = $container.width();
            const containerHeight = $container.height();

            // まずスケール1.0でPDF本来のサイズ情報を取得
            const unscaledViewport = page.getViewport({ scale: 1.0 });

            // 「コンテナの幅 / PDFの幅」と「コンテナの高さ / PDFの高さ」を比較し、
            // 小さい方の比率に合わせてスケールを決定する（枠内に収めるため）
            const scaleX = containerWidth / unscaledViewport.width;
            const scaleY = containerHeight / unscaledViewport.height;
            // 念のため、計算結果が正の値になるように担保しつつ、小さい方を採用
            const scale = Math.min(scaleX, scaleY) || 1.0;

            // 計算したスケールを適用してビューポートを作成
            const viewport = page.getViewport({ scale: scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // CanvasにPDFを描画（画像化）
            await page.render({ canvasContext: context, viewport: viewport }).promise;

            // 表示エリアをクリアしてCanvasを追加
            $('#preview-container').empty().append(canvas);
        };
        reader.readAsArrayBuffer(file);
    }

    // --- 3. 検図開始（Gemini API） ---
    $('#btn-start').on('click', async () => {
        if (!selectedFile) {
            alert("まずはPDFファイルを取り込んでください。");
            return;
        }

        $resultArea.html("<p>解析中... しばらくお待ちください。</p>");

        try {
            // APIキーの設定（※外部に漏らさないよう注意）
            const API_KEY = "GEMINI_API_KEY"; 
            const genAI = new GoogleGenerativeAI(API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            // 送信用にBase64形式へ変換
            const base64Data = await toBase64(selectedFile);
            
            // ------------------------------------------------
            // 【後日編集エリア】プロンプトの指示内容
            // ------------------------------------------------
            const prompt = "このPDF図面の内容を詳しく確認し、不備や特徴をリストアップしてください。";
            // ------------------------------------------------

            // Geminiへ送信
            const result = await model.generateContent([
                prompt,
                { inlineData: { data: base64Data.split(',')[1], mimeType: "application/pdf" } }
            ]);

            const response = await result.response;
            $resultArea.text(response.text()); // 解析結果を表示

        } catch (error) {
            console.error(error);
            $resultArea.text("エラーが発生しました: " + error.message);
        }
    });

    $('#btn-save-pdf').on('click', function() {
        // 解析結果が空の場合は警告
        if ($resultArea.find('.result-placeholder').length > 0 || $resultArea.text() === "解析中...") {
            alert("保存する解析結果がありません。");
            return;
        }

        // PDF変換の設定
        const element = document.getElementById('export-area');
        const opt = {
            margin:       10,
            filename:     '検図結果_' + new Date().getTime() + '.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 }, // 解像度を上げる
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
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

    // --- 4. 終了処理 ---
    $('#btn-exit').on('click', () => {
        if (confirm("画面を閉じますか？（保存されていないデータは失われます）")) {
            window.close();
            // ブラウザのセキュリティ設定で閉じない場合のフォロー
            alert("ブラウザのタブを直接閉じてください。");
        }
    });
});