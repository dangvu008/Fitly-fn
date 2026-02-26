(function (global) {
    global.FITLY_LOCALES = global.FITLY_LOCALES || {};
    global.FITLY_LOCALES.ja = {
        // Header
        gems: 'ジェム',
        balance: '残高',
        buy_gems: 'ジェムを購入',

        // Sections
        model_section_title: '全身モデル写真',
        model_add_photo: '写真を追加',
        model_fullbody_hint: '全身写真',
        your_photo: 'あなたの写真',
        upload_photo: 'アップロード',
        select_below: '下から選択またはアップロード',
        saved_photos: '保存した写真',
        clothing: '服',
        paste_url: 'URLを貼り付け',
        right_click_hint: '服の画像を右クリックして試着',
        recent_clothing: '最近試着した服',
        clear_all: 'すべて削除',

        // Actions
        try_on_button: '試着する',
        tries_remaining: '回残り',
        need_more_gems: 'ジェムが不足',
        results: '結果',
        no_results: 'まだ結果がありません。試着して結果を確認してください。',
        copy_image: '画像をコピー',
        open_product: '商品ページを開く',
        rename: '名前を変更',
        delete: '削除',
        save_outfit: 'コーデを保存',
        download: 'ダウンロード',
        share: '共有',

        // Loading
        processing: 'コーディネートを作成中...',
        loading_tip: 'AIが数百万ピクセルを分析して完璧な結果を作成中！',
        finding_style: 'ぴったりのスタイルを探しています...',
        ai_working: 'AIスタイリストが魔法をかけています...',
        almost_done: 'もうすぐ完成、素敵です！',
        creating_look: 'あなたのルックを作成中...',
        mixing_colors: '美しく色を合わせています...',

        // Success/Error
        success: '試着成功！',
        error_generic: 'エラーが発生しました。もう一度お試しください。',
        error_insufficient_gems: 'ジェムが不足しています。購入してください。',
        error_network: 'ネットワークエラー。接続を確認してください。',

        // Auth
        login_to_try: 'ログインして試着・保存',
        continue_google: 'Googleで続行',
        not_logged_in: '未ログイン',
        opening_login: '{provider}ログインを開いています...',
        login_success: 'ログイン成功！🎉',
        login_error: 'ログインに失敗しました。もう一度お試しください。',

        // Settings
        language: '言語',
        shortcuts: 'ショートカット',
        changed_to: '日本語に変更しました',
        theme: 'テーマ',
        dark: 'ダーク',
        light: 'ライト',

        // Gems packages
        starter_pack: 'スターターパック',
        pro_pack: 'プロパック',
        premium_pack: 'プレミアムパック',
        popular: '人気',
        best_value: 'お得',
        payment_note: 'Stripeで安全にお支払い',

        // User models
        my_photos: 'マイ写真',
        add_photo: '写真を追加',
        set_default: 'デフォルトに設定',
        photo_added: '写真を追加しました',
        photo_deleted: '写真を削除しました',
        default_set: 'デフォルトの写真に設定しました',

        // Clothing history
        clothing_selected: '服を選択しました',
        clothing_saved: 'コレクションに保存しました！',
        quick_try: 'クイック試着',
        has_product_link: '商品リンクあり',

        // Popups
        popup_opened: 'ポップアップを開きました',
        popup_closed: 'ポップアップを閉じました',
        result_saved: '結果を保存しました！',
        copied_to_clipboard: 'コピーしました！LINEなどに貼り付けできます',
        could_not_copy: 'コピーできませんでした',

        // Time
        just_now: 'たった今',
        minutes_ago: '{count}分前',
        hours_ago: '{count}時間前',
        days_ago: '{count}日前',
        weeks_ago: '{count}週間前',
        months_ago: '{count}ヶ月前',

        // Hover Button (Content Script)
        hover_btn: {
            try_on: '試着する',
            add_wardrobe: 'クローゼット',
            loading: '開いています...',
            adding: '追加中...',
            added: '追加しました！',
            tooltip_try: 'Fitlyで試着する',
            tooltip_wardrobe: 'Fitlyクローゼットに追加',
        },
    };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self));
