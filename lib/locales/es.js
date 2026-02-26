(function (global) {
    global.FITLY_LOCALES = global.FITLY_LOCALES || {};
    global.FITLY_LOCALES.es = {
        // Header
        gems: 'gemas',
        balance: 'Saldo',
        buy_gems: 'Comprar Gemas',

        // Sections
        model_section_title: 'Foto de cuerpo completo',
        model_add_photo: 'AGREGAR FOTO',
        model_fullbody_hint: 'Foto de cuerpo completo',
        your_photo: 'Tu Foto',
        upload_photo: 'Subir',
        select_below: 'Selecciona abajo o sube',
        saved_photos: 'Fotos Guardadas',
        clothing: 'Ropa',
        paste_url: 'Pegar URL',
        right_click_hint: 'Clic derecho en la imagen para probar',
        recent_clothing: 'Probado Recientemente',
        clear_all: 'Borrar Todo',

        // Actions
        try_on_button: 'Probar',
        tries_remaining: 'pruebas restantes',
        need_more_gems: 'Necesitas más gemas',
        results: 'Resultados',
        no_results: 'Aún no hay resultados. Prueba ropa para ver los resultados.',
        copy_image: 'Copiar imagen',
        open_product: 'Abrir página del producto',
        rename: 'Renombrar',
        delete: 'Eliminar',
        save_outfit: 'Guardar outfit',
        download: 'Descargar',
        share: 'Compartir',

        // Loading
        processing: 'Creando tu outfit...',
        loading_tip: '¡La IA está analizando millones de píxeles para crear el resultado perfecto!',
        finding_style: 'Buscando el estilo perfecto...',
        ai_working: 'El estilista AI está haciendo magia...',
        almost_done: '¡Casi listo, te ves fabuloso!',
        creating_look: 'Creando tu look...',
        mixing_colors: 'Combinando colores hermosamente...',

        // Success/Error
        success: '¡Prueba exitosa!',
        error_generic: 'Algo salió mal. Por favor, inténtalo de nuevo.',
        error_insufficient_gems: 'Gemas insuficientes. Por favor, compra más.',
        error_network: 'Error de red. Verifica tu conexión.',

        // Auth
        login_to_try: 'Inicia sesión para probar y guardar',
        continue_google: 'Continuar con Google',
        not_logged_in: 'No conectado',
        opening_login: 'Abriendo inicio de sesión con {provider}...',
        login_success: '¡Inicio de sesión exitoso! 🎉',
        login_error: 'Error al iniciar sesión. Inténtelo de nuevo.',

        // Settings
        language: 'Idioma',
        shortcuts: 'Atajos',
        changed_to: 'Cambiado a Español',
        theme: 'Tema',
        dark: 'Oscuro',
        light: 'Claro',

        // Gems packages
        starter_pack: 'Pack Inicial',
        pro_pack: 'Pack Pro',
        premium_pack: 'Pack Premium',
        popular: 'Popular',
        best_value: 'Mejor Valor',
        payment_note: 'Pago seguro vía Stripe',

        // User models
        my_photos: 'Mis Fotos',
        add_photo: 'Añadir Foto',
        set_default: 'Establecer como predeterminado',
        photo_added: 'Foto añadida',
        photo_deleted: 'Foto eliminada',
        default_set: 'Establecida como foto predeterminada',

        // Clothing history
        clothing_selected: 'Ropa seleccionada',
        clothing_saved: '¡Guardado en colección!',
        quick_try: 'Prueba rápida',
        has_product_link: 'Tiene enlace de producto',

        // Popups
        popup_opened: 'Popup abierto',
        popup_closed: 'Popup cerrado',
        result_saved: '¡Resultado guardado!',
        copied_to_clipboard: '¡Copiado! Pega en WhatsApp, etc.',
        could_not_copy: 'No se pudo copiar',

        // Time
        just_now: 'Ahora mismo',
        minutes_ago: 'hace {count} minutos',
        hours_ago: 'hace {count} horas',
        days_ago: 'hace {count} días',
        weeks_ago: 'hace {count} semanas',
        months_ago: 'hace {count} meses',

        // Hover Button (Content Script)
        hover_btn: {
            try_on: 'Probar',
            add_wardrobe: 'Armario',
            loading: 'Abriendo...',
            adding: 'Añadiendo...',
            added: '¡Añadido!',
            tooltip_try: 'Probar con Fitly',
            tooltip_wardrobe: 'Añadir al armario Fitly',
        },
    };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self));
