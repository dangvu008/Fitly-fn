(function (global) {
    global.FITLY_LOCALES = global.FITLY_LOCALES || {};
    global.FITLY_LOCALES.zh = {
        // Header
        gems: '宝石',
        balance: '余额',
        buy_gems: '购买宝石',

        // Sections
        model_section_title: '全身模特照片',
        model_add_photo: '添加照片',
        model_fullbody_hint: '全身照片',
        your_photo: '你的照片',
        upload_photo: '上传',
        select_below: '从下方选择或上传',
        saved_photos: '已保存的照片',
        clothing: '服装',
        paste_url: '粘贴链接',
        right_click_hint: '右键点击服装图片进行试穿',
        recent_clothing: '最近试穿',
        clear_all: '清空',

        // Actions
        try_on_button: '试穿',
        tries_remaining: '次剩余',
        need_more_gems: '宝石不足',
        results: '结果',
        no_results: '暂无结果。试穿衣服来查看结果。',
        copy_image: '复制图片',
        open_product: '打开商品页面',
        rename: '重命名',
        delete: '删除',
        save_outfit: '保存穿搭',
        download: '下载',
        share: '分享',

        // Loading
        processing: '正在生成搭配...',
        loading_tip: 'AI正在分析数百万像素以创建完美结果！',
        finding_style: '正在寻找完美风格...',
        ai_working: 'AI造型师正在施展魔法...',
        almost_done: '快好了，看起来很棒！',
        creating_look: '正在为您打造造型...',
        mixing_colors: '正在美丽地搭配颜色...',

        // Success/Error
        success: '试穿成功！',
        error_generic: '出现错误。请重试。',
        error_insufficient_gems: '宝石不足。请购买更多。',
        error_network: '网络错误。请检查连接。',

        // Auth
        login_to_try: '登录以试穿和保存',
        continue_google: '使用Google登录',
        not_logged_in: '未登录',
        opening_login: '正在打开{provider}登录...',
        login_success: '登录成功！🎉',
        login_error: '登录失败，请重试。',

        // Settings
        language: '语言',
        shortcuts: '快捷键',
        changed_to: '已切换到中文',
        theme: '主题',
        dark: '深色',
        light: '浅色',

        // Gems packages
        starter_pack: '入门套餐',
        pro_pack: '专业套餐',
        premium_pack: '高级套餐',
        popular: '热门',
        best_value: '最划算',
        payment_note: '通过Stripe安全支付',

        // User models
        my_photos: '我的照片',
        add_photo: '添加照片',
        set_default: '设为默认',
        photo_added: '已添加照片',
        photo_deleted: '已删除照片',
        default_set: '已设为默认照片',

        // Clothing history
        clothing_selected: '已选择服装',
        clothing_saved: '已保存到收藏！',
        quick_try: '快速试穿',
        has_product_link: '有商品链接',

        // Popups
        popup_opened: '已打开弹窗',
        popup_closed: '已关闭弹窗',
        result_saved: '已保存结果！',
        copied_to_clipboard: '已复制！可粘贴到微信等',
        could_not_copy: '无法复制',

        // Time
        just_now: '刚刚',
        minutes_ago: '{count}分钟前',
        hours_ago: '{count}小时前',
        days_ago: '{count}天前',
        weeks_ago: '{count}周前',
        months_ago: '{count}个月前',

        // Hover Button (Content Script)
        hover_btn: {
            try_on: '试穿',
            add_wardrobe: '衣柜',
            loading: '打开中...',
            adding: '添加中...',
            added: '已添加！',
            tooltip_try: '用Fitly试穿',
            tooltip_wardrobe: '添加到Fitly衣柜',
        },
    };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self));
