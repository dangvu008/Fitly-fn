(function (global) {
    global.FITLY_LOCALES = global.FITLY_LOCALES || {};
    global.FITLY_LOCALES.ko = {
        // Header
        gems: '젬',
        balance: '잔액',
        buy_gems: '젬 구매',

        // Sections
        model_section_title: '전신 모델 사진',
        model_add_photo: '사진 추가',
        model_fullbody_hint: '전신 사진',
        your_photo: '내 사진',
        upload_photo: '업로드',
        select_below: '아래에서 선택 또는 업로드',
        saved_photos: '저장된 사진',
        clothing: '옷',
        paste_url: 'URL 붙여넣기',
        right_click_hint: '옷 이미지를 우클릭하여 피팅',
        recent_clothing: '최근 피팅',
        clear_all: '모두 삭제',

        // Actions
        try_on_button: '피팅하기',
        tries_remaining: '회 남음',
        need_more_gems: '젬 부족',
        results: '결과',
        no_results: '아직 결과가 없습니다. 피팅해서 결과를 확인하세요.',
        copy_image: '이미지 복사',
        open_product: '상품 페이지 열기',
        rename: '이름 변경',
        delete: '삭제',
        save_outfit: '코디 저장',
        download: '다운로드',
        share: '공유',

        // Loading
        processing: '코디 생성 중...',
        loading_tip: 'AI가 수백만 픽셀을 분석하여 완벽한 결과를 만들고 있어요!',
        finding_style: '완벽한 스타일을 찾는 중...',
        ai_working: 'AI 스타일리스트가 마법을 부리는 중...',
        almost_done: '거의 완성! 멋져요!',
        creating_look: '당신의 룩을 만드는 중...',
        mixing_colors: '아름답게 색을 조합하는 중...',

        // Success/Error
        success: '피팅 성공!',
        error_generic: '오류가 발생했습니다. 다시 시도해 주세요.',
        error_insufficient_gems: '젬이 부족합니다. 구매해 주세요.',
        error_network: '네트워크 오류. 연결을 확인해 주세요.',

        // Auth
        login_to_try: '로그인하여 피팅 & 저장',
        continue_google: 'Google로 계속',
        not_logged_in: '로그인되지 않음',
        opening_login: '{provider} 로그인 열는 중...',
        login_success: '로그인 성공! 🎉',
        login_error: '로그인 실패. 다시 시도해 주세요.',

        // Settings
        language: '언어',
        shortcuts: '단축키',
        changed_to: '한국어로 변경되었습니다',
        theme: '테마',
        dark: '다크',
        light: '라이트',

        // Gems packages
        starter_pack: '스타터 팩',
        pro_pack: '프로 팩',
        premium_pack: '프리미엄 팩',
        popular: '인기',
        best_value: '최고 가성비',
        payment_note: 'Stripe로 안전한 결제',

        // User models
        my_photos: '내 사진',
        add_photo: '사진 추가',
        set_default: '기본으로 설정',
        photo_added: '사진이 추가되었습니다',
        photo_deleted: '사진이 삭제되었습니다',
        default_set: '기본 사진으로 설정되었습니다',

        // Clothing history
        clothing_selected: '옷이 선택되었습니다',
        clothing_saved: '컬렉션에 저장되었습니다!',
        quick_try: '빠른 피팅',
        has_product_link: '상품 링크 있음',

        // Popups
        popup_opened: '팝업이 열렸습니다',
        popup_closed: '팝업이 닫혔습니다',
        result_saved: '결과가 저장되었습니다!',
        copied_to_clipboard: '복사되었습니다! 카카오톡 등에 붙여넣기 하세요',
        could_not_copy: '복사할 수 없습니다',

        // Time
        just_now: '방금 전',
        minutes_ago: '{count}분 전',
        hours_ago: '{count}시간 전',
        days_ago: '{count}일 전',
        weeks_ago: '{count}주 전',
        months_ago: '{count}개월 전',

        // Hover Button (Content Script)
        hover_btn: {
            try_on: '피팅하기',
            add_wardrobe: '옷장',
            loading: '여는 중...',
            adding: '추가 중...',
            added: '추가됨!',
            tooltip_try: 'Fitly로 피팅하기',
            tooltip_wardrobe: 'Fitly 옷장에 추가',
        },
    };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self));
