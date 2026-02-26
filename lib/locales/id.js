(function (global) {
    global.FITLY_LOCALES = global.FITLY_LOCALES || {};
    global.FITLY_LOCALES.id = {
        // Header
        gems: 'gem',
        balance: 'Saldo',
        buy_gems: 'Beli Gem',

        // Sections
        model_section_title: 'Foto Model Seluruh Tubuh',
        model_add_photo: 'TAMBAH FOTO',
        model_fullbody_hint: 'Foto seluruh tubuh',
        your_photo: 'Foto Anda',
        upload_photo: 'Unggah',
        select_below: 'Pilih dari bawah atau unggah',
        saved_photos: 'Foto Tersimpan',
        clothing: 'Pakaian',
        paste_url: 'Tempel URL',
        right_click_hint: 'Klik kanan pada gambar pakaian untuk mencoba',
        recent_clothing: 'Baru Dicoba',
        clear_all: 'Hapus Semua',

        // Actions
        try_on_button: 'Coba Pakai',
        tries_remaining: 'percobaan tersisa',
        need_more_gems: 'Gem tidak cukup',
        results: 'Hasil',
        no_results: 'Belum ada hasil. Coba pakaian untuk melihat hasil.',
        copy_image: 'Salin gambar',
        open_product: 'Buka halaman produk',
        rename: 'Ganti nama',
        delete: 'Hapus',
        save_outfit: 'Simpan outfit',
        download: 'Unduh',
        share: 'Bagikan',

        // Loading
        processing: 'Membuat outfit...',
        loading_tip: 'AI sedang menganalisis jutaan piksel untuk menciptakan hasil yang sempurna!',
        finding_style: 'Mencari gaya yang sempurna...',
        ai_working: 'AI stylist sedang bekerja...',
        almost_done: 'Hampir selesai, terlihat cantik!',
        creating_look: 'Membuat tampilan Anda...',
        mixing_colors: 'Memadukan warna dengan indah...',

        // Success/Error
        success: 'Berhasil!',
        error_generic: 'Terjadi kesalahan. Silakan coba lagi.',
        error_insufficient_gems: 'Gem tidak cukup. Silakan beli lebih banyak.',
        error_network: 'Kesalahan jaringan. Periksa koneksi Anda.',

        // Auth
        login_to_try: 'Masuk untuk mencoba & menyimpan',
        continue_google: 'Lanjutkan dengan Google',
        not_logged_in: 'Belum masuk',
        opening_login: 'Membuka login {provider}...',
        login_success: 'Login berhasil! 🎉',
        login_error: 'Login gagal. Silakan coba lagi.',

        // Settings
        language: 'Bahasa',
        shortcuts: 'Pintasan',
        changed_to: 'Diubah ke Bahasa Indonesia',
        theme: 'Tema',
        dark: 'Gelap',
        light: 'Terang',

        // Gems packages
        starter_pack: 'Paket Pemula',
        pro_pack: 'Paket Pro',
        premium_pack: 'Paket Premium',
        popular: 'Populer',
        best_value: 'Nilai Terbaik',
        payment_note: 'Pembayaran aman via Stripe',

        // User models
        my_photos: 'Foto Saya',
        add_photo: 'Tambah Foto',
        set_default: 'Atur sebagai default',
        photo_added: 'Foto ditambahkan',
        photo_deleted: 'Foto dihapus',
        default_set: 'Diatur sebagai foto default',

        // Clothing history
        clothing_selected: 'Pakaian dipilih',
        clothing_saved: 'Disimpan ke koleksi!',
        quick_try: 'Coba cepat',
        has_product_link: 'Ada link produk',

        // Popups
        popup_opened: 'Popup dibuka',
        popup_closed: 'Popup ditutup',
        result_saved: 'Hasil disimpan!',
        copied_to_clipboard: 'Tersalin! Tempel ke WhatsApp dll',
        could_not_copy: 'Tidak dapat menyalin',

        // Time
        just_now: 'Baru saja',
        minutes_ago: '{count} menit yang lalu',
        hours_ago: '{count} jam yang lalu',
        days_ago: '{count} hari yang lalu',
        weeks_ago: '{count} minggu yang lalu',
        months_ago: '{count} bulan yang lalu',

        // Hover Button (Content Script)
        hover_btn: {
            try_on: 'Coba Pakai',
            add_wardrobe: 'Lemari',
            loading: 'Membuka...',
            adding: 'Menambahkan...',
            added: 'Ditambahkan!',
            tooltip_try: 'Coba pakai dengan Fitly',
            tooltip_wardrobe: 'Tambah ke lemari Fitly',
        },
    };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self));
