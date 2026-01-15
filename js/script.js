// HTMLがすべて読み込まれてから実行する、というおまじない
$(document).ready(function() {
    
    // 「ログインボタン」が押された時の処理
    $('#login-btn').on('click', function() {
        // ① 入力された文字を変数（箱）に保存する
        const userCode = $('#user-code').val();
        const password = $('#password').val();
        // エラーメッセージを表示する場所を捕まえておく
        const $error = $('#error-message');

        // 前回のチェックで表示されたメッセージを一旦消す
        $error.text('');

        // ② 入力チェック（バリデーション）
        // 担当者コードが空っぽだったら
        if (userCode === "") {
            $error.text('担当者コードを入力してください。');
            $('#user-code').focus(); // その入力欄にカーソルを移動
            return; // ここで処理を終了し、下の処理に進ませない
        }

        // パスワードが空っぽだったら
        if (password === "") {
            $error.text('パスワードを入力してください。');
            $('#password').focus(); // その入力欄にカーソルを移動
            return; // ここで処理を終了
        }

        // ③ 両方入力されていたらログイン成功の処理
        window.location.href = "main/main.html";
    });

    // 「終了ボタン」が押された時の処理
    $('#exit-btn').on('click', function() {
        // 確認ダイアログを表示し、OKなら実行
        if (confirm('画面を閉じてもよろしいですか？')) {
            // 現在のタブ（ウィンドウ）を閉じようとする命令
            window.close();
            
            // セキュリティ上、この命令で閉じないブラウザが多いので、
            // 閉じなかった場合の案内を出す
            alert('ブラウザのタブを閉じて終了してください。');
        }
    });
});