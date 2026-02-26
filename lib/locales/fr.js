(function (global) {
    global.FITLY_LOCALES = global.FITLY_LOCALES || {};
    global.FITLY_LOCALES.fr = {
        // Header
        gems: 'gemmes',
        balance: 'Solde',
        buy_gems: 'Acheter des Gemmes',

        // Sections
        model_section_title: 'Photo modèle corps entier',
        model_add_photo: 'AJOUTER PHOTO',
        model_fullbody_hint: 'Photo corps entier',
        your_photo: 'Votre Photo',
        upload_photo: 'Télécharger',
        select_below: 'Sélectionnez ci-dessous ou téléchargez',
        saved_photos: 'Photos Enregistrées',
        clothing: 'Vêtement',
        paste_url: 'Coller URL',
        right_click_hint: 'Clic droit sur l\'image pour essayer',
        recent_clothing: 'Essayés Récemment',
        clear_all: 'Tout Effacer',

        // Actions
        try_on_button: 'Essayer',
        tries_remaining: 'essais restants',
        need_more_gems: 'Plus de gemmes nécessaires',
        results: 'Résultats',
        no_results: 'Pas encore de résultats. Essayez des vêtements pour voir les résultats.',
        copy_image: 'Copier l\'image',
        open_product: 'Ouvrir la page produit',
        rename: 'Renommer',
        delete: 'Supprimer',
        save_outfit: 'Enregistrer la tenue',
        download: 'Télécharger',
        share: 'Partager',

        // Loading
        processing: 'Création de votre tenue...',
        loading_tip: 'L\'IA analyse des millions de pixels pour créer le résultat parfait !',
        finding_style: 'Recherche du style parfait...',
        ai_working: 'Le styliste IA fait sa magie...',
        almost_done: 'Presque fini, ça a l\'air fabuleux !',
        creating_look: 'Création de votre look...',
        mixing_colors: 'Association harmonieuse des couleurs...',

        // Success/Error
        success: 'Essai réussi !',
        error_generic: 'Une erreur s\'est produite. Veuillez réessayer.',
        error_insufficient_gems: 'Gemmes insuffisantes. Veuillez en acheter.',
        error_network: 'Erreur réseau. Vérifiez votre connexion.',

        // Auth
        login_to_try: 'Connectez-vous pour essayer et sauvegarder',
        continue_google: 'Continuer avec Google',
        not_logged_in: 'Non connecté',
        opening_login: 'Ouverture de la connexion {provider}...',
        login_success: 'Connexion réussie ! 🎉',
        login_error: 'Échec de la connexion. Veuillez réessayer.',

        // Settings
        language: 'Langue',
        shortcuts: 'Raccourcis',
        changed_to: 'Changé en Français',
        theme: 'Thème',
        dark: 'Sombre',
        light: 'Clair',

        // Gems packages
        starter_pack: 'Pack Débutant',
        pro_pack: 'Pack Pro',
        premium_pack: 'Pack Premium',
        popular: 'Populaire',
        best_value: 'Meilleur Rapport',
        payment_note: 'Paiement sécurisé via Stripe',

        // User models
        my_photos: 'Mes Photos',
        add_photo: 'Ajouter Photo',
        set_default: 'Définir par défaut',
        photo_added: 'Photo ajoutée',
        photo_deleted: 'Photo supprimée',
        default_set: 'Définie comme photo par défaut',

        // Clothing history
        clothing_selected: 'Vêtement sélectionné',
        clothing_saved: 'Enregistré dans la collection !',
        quick_try: 'Essai rapide',
        has_product_link: 'A un lien produit',

        // Popups
        popup_opened: 'Popup ouvert',
        popup_closed: 'Popup fermé',
        result_saved: 'Résultat enregistré !',
        copied_to_clipboard: 'Copié ! Collez dans Messenger, etc.',
        could_not_copy: 'Impossible de copier',

        // Time
        just_now: 'À l\'instant',
        minutes_ago: 'il y a {count} minutes',
        hours_ago: 'il y a {count} heures',
        days_ago: 'il y a {count} jours',
        weeks_ago: 'il y a {count} semaines',
        months_ago: 'il y a {count} mois',

        // Hover Button (Content Script)
        hover_btn: {
            try_on: 'Essayer',
            add_wardrobe: 'Garde-robe',
            loading: 'Ouverture...',
            adding: 'Ajout...',
            added: 'Ajouté !',
            tooltip_try: 'Essayer avec Fitly',
            tooltip_wardrobe: 'Ajouter à la garde-robe Fitly',
        },
    };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self));
