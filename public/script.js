// script.js - JavaScript pour Gestion Commerciale Pro - VERSION CORRIGÉE

// Configuration Firebase
const firebaseConfig = {
    apiKey: "AIzaSyC7LPKCvT_m-9zTXuA4u1t9cbnh5e1FiV8",
    authDomain: "dynamogs.firebaseapp.com",
    projectId: "dynamogs",
    storageBucket: "dynamogs.firebasestorage.app",
    messagingSenderId: "120022177074",
    appId: "1:120022177074:web:c05ec1862922b985ac332b",
    measurementId: "G-9H4HTCMFGK"
};

// Initialisation Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Variables globales
let currentUser = null;
let currentEditId = null;
let clients = [];
let products = [];
let quotes = [];
let invoices = [];
let orders = [];
let deliveries = [];
let transactions = [];
let payments = [];

// Paramètres par défaut SEULEMENT pour les nouveaux comptes
const DEFAULT_COMPANY_SETTINGS = {
    name: '',
    siret: '',
    address: '',
    phone: '',
    email: '',
    website: '',
    logo: null,
    stamp: null,
    taxRate: 20,
    currency: 'dhs',
    paymentTerms: '',
    defaultNotes: ''
};

// Paramètres actuels de l'entreprise (préservés entre les sessions)
let companySettings = { ...DEFAULT_COMPANY_SETTINGS };

// Variables pour les graphiques
let salesChart = null;
let clientChart = null;
let invoiceStatusChart = null;

/**
 * Génère le prochain numéro de document séquentiel pour une année donnée.
 */
function getNextDocumentNumber(prefix, documents) {
    const currentYear = new Date().getFullYear();
    const yearPrefix = `${prefix}${currentYear}`;

    const yearDocuments = documents.filter(doc => doc.number && doc.number.startsWith(yearPrefix));

    let maxNum = 0;
    if (yearDocuments.length > 0) {
        maxNum = yearDocuments.reduce((max, doc) => {
            const numPart = parseInt(doc.number.substring(yearPrefix.length), 10);
            return numPart > max ? numPart : max;
        }, 0);
    }

    const nextNum = maxNum + 1;
    return `${yearPrefix}${String(nextNum).padStart(4, '0')}`;
}

// Fonction pour convertir un nombre en lettres (français) - VERSION AMÉLIORÉE
function numberToWords(num) {
    if (num === 0) return 'zéro';

    const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
    const teens = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
    const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
    const scales = ['', 'mille', 'million', 'milliard'];

    function convertGroup(n) {
        let result = '';
        const hundreds = Math.floor(n / 100);
        const remainder = n % 100;

        if (hundreds > 0) {
            result += (hundreds > 1 ? units[hundreds] + ' ' : '') + 'cent';
            if (remainder === 0 && hundreds > 1) {
                result += 's';
            }
        }

        if (remainder > 0) {
            if (result) result += ' ';

            if (remainder < 10) {
                result += units[remainder];
            } else if (remainder < 20) {
                result += teens[remainder - 10];
            } else if (remainder < 70) {
                const ten = Math.floor(remainder / 10);
                const unit = remainder % 10;
                result += tens[ten];
                if (unit === 1) {
                    result += ' et un';
                } else if (unit > 0) {
                    result += '-' + units[unit];
                }
            } else if (remainder < 80) { // 70-79
                result += 'soixante' + (remainder === 71 ? ' et onze' : '-' + teens[remainder - 70]);
            } else { // 80-99
                result += 'quatre-vingt' + (remainder === 80 ? 's' : '-' + (remainder < 90 ? units[remainder - 80] : teens[remainder - 90]));
            }
        }
        return result;
    }

    const parts = [];
    let scaleIndex = 0;

    while (num > 0) {
        const group = num % 1000;
        if (group > 0) {
            let groupText = convertGroup(group);
            if (scaleIndex > 0) {
                if (scaleIndex === 1 && group === 1) { // pour 'mille', not 'un mille'
                    groupText = scales[scaleIndex];
                } else {
                    // "mille" is invariable, does not take an 's'.
                    groupText += ' ' + scales[scaleIndex] + (group > 1 && scaleIndex > 1 ? 's' : '');
                }
            }
            parts.unshift(groupText);
        }
        num = Math.floor(num / 1000);
        scaleIndex++;
    }
    return parts.join(' ');
}

// Gestion de l'authentification
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        document.getElementById('userEmail').textContent = user.email;
        
        destroyAllCharts();
        loadData();
        initializeNavigation();
    } else {
        destroyAllCharts();
        document.getElementById('authContainer').style.display = 'flex';
        document.getElementById('mainApp').style.display = 'none';
    }
});

function destroyAllCharts() {
    if (salesChart) {
        salesChart.destroy();
        salesChart = null;
    }
    if (clientChart) {
        clientChart.destroy();
        clientChart = null;
    }
    if (invoiceStatusChart) {
        invoiceStatusChart.destroy();
        invoiceStatusChart = null;
    }
}

function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
}

async function login(event) {
    if (event) event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        showAlert('Connexion réussie !', 'success');
    } catch (error) {
        showAlert('Erreur de connexion: ' + error.message, 'error');
    }
}

async function register(event) {
    if (event) event.preventDefault();
    
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const companyName = document.getElementById('companyName').value;
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        
        await db.collection('companies').doc(userCredential.user.uid).set({
            name: companyName,
            email: email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showAlert('Compte créé avec succès !', 'success');
    } catch (error) {
        showAlert('Erreur lors de la création: ' + error.message, 'error');
    }
}

function logout() {
    auth.signOut();
}


// Navigation entre modules - VERSION CORRIGÉE
function showModule(moduleId, clickedButton = null) {
    // Cacher tous les modules
    document.querySelectorAll('.module').forEach(module => {
        module.classList.remove('active');
    });
    
    // Retirer la classe active de tous les boutons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Afficher le module sélectionné avec animation
    const targetModule = document.getElementById(moduleId);
    if (!targetModule) {
        console.error(`Module ${moduleId} introuvable`);
        return;
    }
    
    targetModule.classList.add('active');
    
    // Ajouter la classe active au bouton cliqué
    setTimeout(() => {
        if (clickedButton) {
            clickedButton.classList.add('active');
        } else {
            // Fallback: trouver le bouton correspondant par l'attribut data-module
            const targetBtn = document.querySelector(`[data-module="${moduleId}"]`);
            if (targetBtn) {
                targetBtn.classList.add('active');
            }
        }
    }, 50);
    
    // Animation de transition douce
    targetModule.style.opacity = '0';
    targetModule.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        targetModule.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        targetModule.style.opacity = '1';
        targetModule.style.transform = 'translateY(0)';
    }, 10);
    
    // Effet de vibration subtile pour le feedback utilisateur
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
    
    // Scroll vers le haut en douceur
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
    
    // Logique spécifique par module
    switch(moduleId) {
        case 'dashboard':
            updateDashboard();
            break;
        case 'clients':
            displayClients();
            break;
        case 'quotes':
            displayQuotes();
            break;
        case 'invoices':
            displayInvoices();
            break;
        case 'orders':
            displayOrders();
            break;
        case 'deliveries':
            displayDeliveries();
            break;
        case 'transactions':
            displayTransactions();
            break;
        case 'payments':
            displayPayments();
            break;
        case 'stock':
            displayStock();
            break;
        case 'settings':
            loadCompanySettings();
            break;
    }
}

// Initialiser la navigation
function initializeNavigation() {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
        const moduleId = btn.getAttribute('data-module');
        
        if (moduleId) {
            btn.addEventListener('click', function(event) {
                event.preventDefault();
                showModule(moduleId, this);
            });
        }
    });

    // Initialiser les effets du navbar
    initializeNavbarEffects();
}

// Initialiser les effets du navbar
function initializeNavbarEffects() {
    // Effet de particules au survol
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('mouseenter', function(e) {
            const rect = this.getBoundingClientRect();
            const particle = document.createElement('div');
            particle.className = 'nav-particle';
            particle.style.cssText = `
                position: absolute;
                width: 4px;
                height: 4px;
                background: rgba(255, 255, 255, 0.8);
                border-radius: 50%;
                pointer-events: none;
                z-index: 1000;
                left: ${e.clientX}px;
                top: ${e.clientY}px;
                animation: particleFloat 1s ease-out forwards;
            `;
            
            document.body.appendChild(particle);
            
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, 1000);
        });
    });
}

// Gestion des alertes
function showAlert(message, type) {
    const alertId = type === 'success' ? 'alertSuccess' : 'alertError';
    const alertElement = document.getElementById(alertId);
    alertElement.textContent = message;
    alertElement.style.display = 'block';
    
    setTimeout(() => {
        alertElement.style.display = 'none';
    }, 5000);
}

// Fonction pour les notifications discrètes de sauvegarde automatique
function showAutoSaveNotification(message) {
    // Créer une notification discrète
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        font-size: 14px;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Animation d'apparition
    setTimeout(() => {
        notification.style.opacity = '1';
    }, 100);
    
    // Suppression automatique
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 2000);
}

// Chargement des données
async function loadData() {
    if (!currentUser) return;
    
    try {
        const clientsSnapshot = await db.collection('companies').doc(currentUser.uid).collection('clients').get();
        clients = clientsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        const productsSnapshot = await db.collection('companies').doc(currentUser.uid).collection('products').get();
        products = productsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        const quotesSnapshot = await db.collection('companies').doc(currentUser.uid).collection('quotes').get();
        quotes = quotesSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        const invoicesSnapshot = await db.collection('companies').doc(currentUser.uid).collection('invoices').get();
        invoices = invoicesSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        const ordersSnapshot = await db.collection('companies').doc(currentUser.uid).collection('orders').get();
        orders = ordersSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        const deliveriesSnapshot = await db.collection('companies').doc(currentUser.uid).collection('deliveries').get();
        deliveries = deliveriesSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        const transactionsSnapshot = await db.collection('companies').doc(currentUser.uid).collection('transactions').get();
        transactions = transactionsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        const paymentsSnapshot = await db.collection('companies').doc(currentUser.uid).collection('payments').get();
        payments = paymentsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        // Charger les paramètres de l'entreprise
        await loadCompanySettings();
        
        updateDashboard();
        populateAllSelects();
        
    } catch (error) {
        showAlert('Erreur lors du chargement des données', 'error');
        console.error(error);
    }
}

// Initialisation des paramètres pour les nouveaux comptes SEULEMENT
async function initializeNewAccountSettings() {
    if (!currentUser) return;
    
    try {
        const settingsDoc = await db.collection('companies').doc(currentUser.uid).get();
        
        if (!settingsDoc.exists) {
            // C'est un nouveau compte - initialiser avec les paramètres par défaut
            console.log('🆕 Nouveau compte détecté - Initialisation des paramètres par défaut');
            
            const initialSettings = {
                ...DEFAULT_COMPANY_SETTINGS,
                email: currentUser.email, // Utiliser l'email de connexion
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection('companies').doc(currentUser.uid).set(initialSettings);
            companySettings = { ...initialSettings };
            
            showAlert('🎉 Bienvenue ! Vos paramètres par défaut ont été initialisés', 'success');
        }
    } catch (error) {
        console.error('Erreur lors de l\'initialisation des paramètres:', error);
    }
}

// Gestion des paramètres d'entreprise - VERSION PERSISTANTE
async function loadCompanySettings() {
    if (!currentUser) return;
    
    try {
        // D'abord, initialiser les paramètres pour les nouveaux comptes
        await initializeNewAccountSettings();
        
        const settingsDoc = await db.collection('companies').doc(currentUser.uid).get();
        if (settingsDoc.exists) {
            const data = settingsDoc.data();
            
            // CONSERVER les paramètres existants, ne jamais les écraser
            companySettings = {
                name: data.name !== undefined ? data.name : companySettings.name,
                siret: data.siret !== undefined ? data.siret : companySettings.siret,
                address: data.address !== undefined ? data.address : companySettings.address,
                phone: data.phone !== undefined ? data.phone : companySettings.phone,
                email: data.email !== undefined ? data.email : companySettings.email,
                website: data.website !== undefined ? data.website : companySettings.website,
                logo: data.logo !== undefined ? data.logo : companySettings.logo,
                stamp: data.stamp !== undefined ? data.stamp : companySettings.stamp,
                taxRate: data.taxRate !== undefined ? data.taxRate : companySettings.taxRate,
                currency: data.currency !== undefined ? data.currency : companySettings.currency,
                paymentTerms: data.paymentTerms !== undefined ? data.paymentTerms : companySettings.paymentTerms,
                defaultNotes: data.defaultNotes !== undefined ? data.defaultNotes : companySettings.defaultNotes
            };
            
            console.log('✅ Paramètres de l\'entreprise chargés depuis la base de données');
        }
        
        // Mettre à jour les champs du formulaire
        updateSettingsFormFields();
        
    } catch (error) {
        console.error('Erreur lors du chargement des paramètres:', error);
        showAlert('Erreur lors du chargement des paramètres', 'error');
    }
}

// Fonction pour mettre à jour les champs du formulaire avec les données chargées
function updateSettingsFormFields() {
    const fieldMappings = [
        { id: 'companyNameSettings', value: companySettings.name },
        { id: 'companySiret', value: companySettings.siret },
        { id: 'companyAddress', value: companySettings.address },
        { id: 'companyPhone', value: companySettings.phone },
        { id: 'companyEmail', value: companySettings.email },
        { id: 'companyWebsite', value: companySettings.website },
        { id: 'defaultTaxRate', value: companySettings.taxRate },
        { id: 'defaultCurrency', value: companySettings.currency },
        { id: 'defaultPaymentTerms', value: companySettings.paymentTerms },
        { id: 'defaultNotes', value: companySettings.defaultNotes }
    ];
    
    fieldMappings.forEach(mapping => {
        const field = document.getElementById(mapping.id);
        if (field && mapping.value !== undefined && mapping.value !== null) {
            field.value = mapping.value;
            
            // Ajouter un indicateur visuel de synchronisation
            field.style.borderLeft = '3px solid #28a745';
            setTimeout(() => {
                if (field.style) {
                    field.style.borderLeft = '';
                }
            }, 2000);
        }
    });
    
    // Afficher les images si elles existent
    if (companySettings.logo) {
        displayImagePreview('logo', companySettings.logo);
    }
    if (companySettings.stamp) {
        displayImagePreview('stamp', companySettings.stamp);
    }
    
    console.log('📋 Formulaires mis à jour avec les données sauvegardées');
}

// Fonction de sauvegarde améliorée qui préserve les données existantes
async function saveCompanySettings() {
    if (!currentUser) return;
    
    try {
        // Ajouter un timestamp de dernière modification
        const settingsToSave = {
            ...companySettings,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Utiliser merge: true pour préserver les données existantes non modifiées
        await db.collection('companies').doc(currentUser.uid).set(settingsToSave, { merge: true });
        showAlert('💾 Paramètres sauvegardés avec succès', 'success');
        console.log('✅ Paramètres de l\'entreprise sauvegardés');
    } catch (error) {
        showAlert('❌ Erreur lors de la sauvegarde', 'error');
        console.error('Erreur sauvegarde:', error);
    }
}

// Fonction pour sauvegarder SEULEMENT les champs modifiés
async function saveCompanyField(fieldName, value) {
    if (!currentUser) return;
    
    try {
        const updateData = {
            [fieldName]: value,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        companySettings[fieldName] = value;
        
        await db.collection('companies').doc(currentUser.uid).update(updateData);
        console.log(`✅ Champ ${fieldName} sauvegardé automatiquement:`, value);
    } catch (error) {
        console.error(`❌ Erreur lors de la sauvegarde du champ ${fieldName}:`, error);
        // Si le document n'existe pas, le créer
        if (error.code === 'not-found') {
            console.log('Document inexistant, création en cours...');
            await saveCompanySettings();
        } else {
            showAlert(`Erreur lors de la sauvegarde de ${fieldName}`, 'error');
        }
    }
}

// Gestion des images (logo et cachet)
function setupImageUpload() {
    const logoInput = document.getElementById('logoInput');
    const stampInput = document.getElementById('stampInput');
    
    if (logoInput) logoInput.addEventListener('change', (e) => handleImageUpload(e, 'logo'));
    if (stampInput) stampInput.addEventListener('change', (e) => handleImageUpload(e, 'stamp'));
    
    // Gestion du drag & drop
    setupDragAndDrop('logoUploadArea', logoInput);
    setupDragAndDrop('stampUploadArea', stampInput);
}

function setupDragAndDrop(areaId, inputElement) {
    const area = document.getElementById(areaId);
    if (!area || !inputElement) return;
    
    area.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.classList.add('dragover');
    });
    
    area.addEventListener('dragleave', () => {
        area.classList.remove('dragover');
    });
    
    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            inputElement.files = files;
            handleImageUpload({ target: inputElement }, areaId.includes('logo') ? 'logo' : 'stamp');
        }
    });
}

function handleImageUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Vérification de la taille (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
        showAlert('La taille du fichier ne doit pas dépasser 2MB', 'error');
        return;
    }
    
    // Vérification du type
    if (!file.type.startsWith('image/')) {
        showAlert('Veuillez sélectionner un fichier image', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result;
        companySettings[type] = base64;
        displayImagePreview(type, base64);
        saveCompanySettings(); // Sauvegarde automatique
    };
    reader.readAsDataURL(file);
}

function displayImagePreview(type, base64) {
    const previewId = type + 'Preview';
    const previewElement = document.getElementById(previewId);
    
    if (previewElement) {
        previewElement.innerHTML = `
            <img src="${base64}" alt="${type}" class="preview-image">
            <p class="file-info">${type === 'logo' ? 'Logo chargé' : 'Cachet chargé'}</p>
            <button class="remove-file" onclick="removeImage('${type}')">🗑️ Supprimer</button>
        `;
    }
}

function removeImage(type) {
    companySettings[type] = null;
    const previewId = type + 'Preview';
    const previewElement = document.getElementById(previewId);
    
    if (previewElement) {
        previewElement.innerHTML = `
            <p>📁 Cliquez ici pour ajouter votre ${type === 'logo' ? 'logo' : 'cachet'}</p>
            <p class="file-info">Format recommandé: PNG, JPG (max 2MB)</p>
        `;
    }
    
    saveCompanySettings(); // Sauvegarde automatique
    showAlert(`${type === 'logo' ? 'Logo' : 'Cachet'} supprimé`, 'success');
}

// Fonctions d'export/import améliorées
function exportAllData() {
    const data = {
        company: companySettings,
        clients: clients,
        products: products,
        quotes: quotes,
        invoices: invoices,
        orders: orders,
        deliveries: deliveries,
        transactions: transactions,
        payments: payments,
        exportDate: new Date().toISOString(),
        version: '2.0'
    };
    
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `export_complet_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showAlert('Export complet réalisé avec succès', 'success');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);
                    
                    if (data.version && data.company) {
                        if (confirm('Êtes-vous sûr de vouloir importer ces données ? Cela remplacera toutes les données actuelles.')) {
                            importFullData(data);
                        }
                    } else {
                        showAlert('Format de fichier invalide', 'error');
                    }
                } catch (error) {
                    showAlert('Erreur lors de la lecture du fichier', 'error');
                }
            };
            reader.readAsText(file);
        }
    };
    input.click();
}

async function importFullData(data) {
    try {
        // Importer les paramètres de l'entreprise
        companySettings = data.company;
        await saveCompanySettings();
        
        // Vider les collections existantes et importer les nouvelles données
        // (Code similaire à l'ancien importDataToFirebase mais avec les nouvelles données)
        
        await loadData();
        showAlert('Import réalisé avec succès', 'success');
    } catch (error) {
        showAlert('Erreur lors de l\'import des données', 'error');
        console.error(error);
    }
}

function resetSettings() {
    if (confirm('⚠️ ATTENTION ⚠️\n\nÊtes-vous sûr de vouloir réinitialiser TOUS les paramètres de l\'entreprise ?\n\nCette action supprimera :\n- Toutes les informations de l\'entreprise\n- Le logo et le cachet\n- Les préférences de documents\n\nCette action est IRRÉVERSIBLE !')) {
        if (confirm('Dernière confirmation :\n\nVoulez-vous vraiment TOUT effacer ?')) {
            // Réinitialisation complète
            companySettings = {
                name: '',
                siret: '',
                address: '',
                phone: '',
                email: '',
                website: '',
                logo: null,
                stamp: null,
                taxRate: 20,
                currency: 'dhs',
                paymentTerms: '',
                defaultNotes: ''
            };
            
            // Sauvegarder la réinitialisation
            saveCompanySettings();
            
            // Vider les champs du formulaire
            updateSettingsFormFields();
            
            // Réinitialiser les previews des images
            const logoPreview = document.getElementById('logoPreview');
            const stampPreview = document.getElementById('stampPreview');
            
            if (logoPreview) {
                logoPreview.innerHTML = `
                    <p>📁 Cliquez ici pour ajouter votre logo</p>
                    <p class="file-info">Format recommandé: PNG, JPG (max 2MB)</p>
                `;
            }
            
            if (stampPreview) {
                stampPreview.innerHTML = `
                    <p>📁 Cliquez ici pour ajouter votre cachet</p>
                    <p class="file-info">Format recommandé: PNG avec fond transparent (max 2MB)</p>
                `;
            }
            
            showAlert('Tous les paramètres ont été réinitialisés', 'success');
        }
    }
}

// Variables globales pour les filtres
let dashboardFilters = {
    dateStart: null,
    dateEnd: null,
    clientId: null,
    paymentStatus: null,
    documentType: null,
    minAmount: null,
    maxAmount: null
};

// Mise à jour du tableau de bord avec filtres
function updateDashboard() {
    populateFilterSelects();
    applyDashboardFilters();
}

// Peupler les selects des filtres
function populateFilterSelects() {
    const clientSelect = document.getElementById('filterClient');
    if (clientSelect) {
        clientSelect.innerHTML = '<option value="">Tous les clients</option>';
        
        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            clientSelect.appendChild(option);
        });
    }
}

// Appliquer les filtres du tableau de bord
function applyDashboardFilters() {
    // Récupérer les valeurs des filtres
    const filterDateStart = document.getElementById('filterDateStart');
    const filterDateEnd = document.getElementById('filterDateEnd');
    const filterClient = document.getElementById('filterClient');
    const filterPaymentStatus = document.getElementById('filterPaymentStatus');
    const filterDocumentType = document.getElementById('filterDocumentType');
    const filterMinAmount = document.getElementById('filterMinAmount');
    const filterMaxAmount = document.getElementById('filterMaxAmount');
    
    dashboardFilters.dateStart = filterDateStart ? filterDateStart.value || null : null;
    dashboardFilters.dateEnd = filterDateEnd ? filterDateEnd.value || null : null;
    dashboardFilters.clientId = filterClient ? filterClient.value || null : null;
    dashboardFilters.paymentStatus = filterPaymentStatus ? filterPaymentStatus.value || null : null;
    dashboardFilters.documentType = filterDocumentType ? filterDocumentType.value || null : null;
    dashboardFilters.minAmount = filterMinAmount ? parseFloat(filterMinAmount.value) || null : null;
    dashboardFilters.maxAmount = filterMaxAmount ? parseFloat(filterMaxAmount.value) || null : null;
    
    // Filtrer les données
    const filteredData = getFilteredData();
    
    // Mettre à jour les statistiques
    updateFilteredStats(filteredData);
    
    // Mettre à jour les graphiques
    updateFilteredCharts(filteredData);
    
    // Mettre à jour les activités récentes
    displayFilteredRecentActivities(filteredData);
    
    // Vérifier les alertes de stock (toujours affiché)
    checkStockAlerts();
}

// Obtenir les données filtrées
function getFilteredData() {
    let filteredQuotes = [...quotes];
    let filteredInvoices = [...invoices];
    let filteredOrders = [...orders];
    let filteredDeliveries = [...deliveries];
    let filteredPayments = [...payments];
    
    // Filtrer par date
    if (dashboardFilters.dateStart || dashboardFilters.dateEnd) {
        const startDate = dashboardFilters.dateStart ? new Date(dashboardFilters.dateStart) : new Date('1900-01-01');
        const endDate = dashboardFilters.dateEnd ? new Date(dashboardFilters.dateEnd) : new Date('2100-12-31');
        
        filteredQuotes = filteredQuotes.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= startDate && itemDate <= endDate;
        });
        
        filteredInvoices = filteredInvoices.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= startDate && itemDate <= endDate;
        });
        
        filteredOrders = filteredOrders.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= startDate && itemDate <= endDate;
        });
        
        filteredDeliveries = filteredDeliveries.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= startDate && itemDate <= endDate;
        });
        
        filteredPayments = filteredPayments.filter(item => {
            const itemDate = new Date(item.date);
            return itemDate >= startDate && itemDate <= endDate;
        });
    }
    
    // Filtrer par client
    if (dashboardFilters.clientId) {
        filteredQuotes = filteredQuotes.filter(item => item.clientId === dashboardFilters.clientId);
        filteredInvoices = filteredInvoices.filter(item => item.clientId === dashboardFilters.clientId);
        filteredDeliveries = filteredDeliveries.filter(item => item.clientId === dashboardFilters.clientId);
        filteredOrders = filteredOrders.filter(item => item.supplierId === dashboardFilters.clientId);
        filteredPayments = filteredPayments.filter(item => item.partnerId === dashboardFilters.clientId);
    }
    
    // Filtrer par statut de paiement (factures seulement)
    if (dashboardFilters.paymentStatus) {
        filteredInvoices = filteredInvoices.filter(invoice => {
            const status = invoice.paymentStatus || calculateInvoicePaymentStatus(invoice);
            return status === dashboardFilters.paymentStatus;
        });
    }
    
    // Filtrer par montant
    if (dashboardFilters.minAmount !== null || dashboardFilters.maxAmount !== null) {
        const minAmount = dashboardFilters.minAmount || 0;
        const maxAmount = dashboardFilters.maxAmount || Infinity;
        
        filteredQuotes = filteredQuotes.filter(item => 
            item.totalTTC >= minAmount && item.totalTTC <= maxAmount
        );
        filteredInvoices = filteredInvoices.filter(item => 
            item.totalTTC >= minAmount && item.totalTTC <= maxAmount
        );
        filteredOrders = filteredOrders.filter(item => 
            item.totalTTC >= minAmount && item.totalTTC <= maxAmount
        );
        filteredPayments = filteredPayments.filter(item => 
            item.amount >= minAmount && item.amount <= maxAmount
        );
    }
    
    // Filtrer par type de document
    if (dashboardFilters.documentType) {
        switch (dashboardFilters.documentType) {
            case 'quotes':
                filteredInvoices = [];
                filteredOrders = [];
                filteredDeliveries = [];
                filteredPayments = [];
                break;
            case 'invoices':
                filteredQuotes = [];
                filteredOrders = [];
                filteredDeliveries = [];
                break;
            case 'orders':
                filteredQuotes = [];
                filteredInvoices = [];
                filteredDeliveries = [];
                filteredPayments = [];
                break;
            case 'deliveries':
                filteredQuotes = [];
                filteredInvoices = [];
                filteredOrders = [];
                filteredPayments = [];
                break;
        }
    }
    
    return {
        quotes: filteredQuotes,
        invoices: filteredInvoices,
        orders: filteredOrders,
        deliveries: filteredDeliveries,
        payments: filteredPayments
    };
}

// Mettre à jour les statistiques filtrées
function updateFilteredStats(filteredData) {
    const uniqueClients = new Set();
    
    // Compter les clients uniques
    filteredData.quotes.forEach(q => q.clientId && uniqueClients.add(q.clientId));
    filteredData.invoices.forEach(i => i.clientId && uniqueClients.add(i.clientId));
    filteredData.orders.forEach(o => o.supplierId && uniqueClients.add(o.supplierId));
    filteredData.deliveries.forEach(d => d.clientId && uniqueClients.add(d.clientId));
    
    // Calculer le chiffre d'affaires filtré
    const revenue = filteredData.invoices.reduce((sum, invoice) => sum + (invoice.totalTTC || 0), 0);
    
    // Mettre à jour les éléments
    const totalClientsElement = document.getElementById('totalClients');
    const totalQuotesElement = document.getElementById('totalQuotes');
    const totalInvoicesElement = document.getElementById('totalInvoices');
    const totalRevenueElement = document.getElementById('totalRevenue');
    
    if (totalClientsElement) totalClientsElement.textContent = uniqueClients.size;
    if (totalQuotesElement) totalQuotesElement.textContent = filteredData.quotes.length;
    if (totalInvoicesElement) totalInvoicesElement.textContent = filteredData.invoices.length;
    if (totalRevenueElement) totalRevenueElement.textContent = revenue.toFixed(2) + ' dhs';
}

// Mettre à jour les graphiques filtrés
function updateFilteredCharts(filteredData) {
    updateFilteredSalesChart(filteredData.invoices);
    updateFilteredClientChart(filteredData.invoices);
    updateFilteredInvoiceStatusChart(filteredData.invoices);
}

function updateFilteredSalesChart(filteredInvoices) {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;
    
    if (salesChart) {
        salesChart.destroy();
    }
    
    const months = [];
    const salesData = [];
    
    // Déterminer la plage de dates
    let startDate, endDate;
    if (dashboardFilters.dateStart || dashboardFilters.dateEnd) {
        startDate = dashboardFilters.dateStart ? new Date(dashboardFilters.dateStart) : new Date('1900-01-01');
        endDate = dashboardFilters.dateEnd ? new Date(dashboardFilters.dateEnd) : new Date();
    } else {
        endDate = new Date();
        startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 5, 1);
    }
    
    // Générer les données par mois
    const monthsDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 + endDate.getMonth() - startDate.getMonth();
    const monthsToShow = Math.min(monthsDiff + 1, 12); // Maximum 12 mois
    
    for (let i = monthsToShow - 1; i >= 0; i--) {
        const date = new Date(endDate.getFullYear(), endDate.getMonth() - i, 1);
        const monthName = date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
        months.push(monthName);
        
        const monthSales = filteredInvoices
            .filter(invoice => {
                const invoiceDate = new Date(invoice.date);
                return invoiceDate.getMonth() === date.getMonth() && 
                       invoiceDate.getFullYear() === date.getFullYear();
            })
            .reduce((sum, invoice) => sum + invoice.totalTTC, 0);
        
        salesData.push(monthSales);
    }
    
    salesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Ventes (dhs)',
                data: salesData,
                borderColor: 'rgb(102, 126, 234)',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + ' dhs';
                        }
                    }
                }
            }
        }
    });
}

function updateFilteredClientChart(filteredInvoices) {
    const ctx = document.getElementById('clientChart');
    if (!ctx) return;
    
    if (clientChart) {
        clientChart.destroy();
    }
    
    const clientRevenues = {};
    filteredInvoices.forEach(invoice => {
        const client = clients.find(c => c.id === invoice.clientId);
        const clientName = client ? client.name : 'Client supprimé';
        clientRevenues[clientName] = (clientRevenues[clientName] || 0) + invoice.totalTTC;
    });
    
    const sortedClients = Object.entries(clientRevenues)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    if (sortedClients.length === 0) {
        return;
    }
    
    clientChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sortedClients.map(([name]) => name),
            datasets: [{
                data: sortedClients.map(([, revenue]) => revenue),
                backgroundColor: [
                    '#667eea',
                    '#764ba2',
                    '#f093fb',
                    '#f5576c',
                    '#4facfe'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function updateFilteredInvoiceStatusChart(filteredInvoices) {
    const ctx = document.getElementById('invoiceStatusChart');
    if (!ctx) return;
    
    if (invoiceStatusChart) {
        invoiceStatusChart.destroy();
    }
    
    const statusCount = {
        'payee': 0,
        'impayee': 0,
        'partiellement-payee': 0
    };
    
    filteredInvoices.forEach(invoice => {
        const status = invoice.paymentStatus || calculateInvoicePaymentStatus(invoice);
        statusCount[status] = (statusCount[status] || 0) + 1;
    });
    
    invoiceStatusChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Payées', 'Impayées', 'Partiellement payées'],
            datasets: [{
                label: 'Nombre de factures',
                data: [statusCount.payee, statusCount.impayee, statusCount['partiellement-payee']],
                backgroundColor: ['#28a745', '#dc3545', '#ffc107']
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// Afficher les activités récentes filtrées
function displayFilteredRecentActivities(filteredData) {
    const container = document.querySelector('#recentActivities .activity-list');
    if (!container) return;
    
    const activities = [];
    
    filteredData.quotes.slice(-3).forEach(quote => {
        const client = clients.find(c => c.id === quote.clientId);
        activities.push({
            type: 'quote',
            icon: '📋',
            title: `Devis ${quote.number}`,
            subtitle: `Client: ${client ? client.name : 'N/A'}`,
            time: new Date(quote.date).toLocaleDateString('fr-FR'),
            date: new Date(quote.date)
        });
    });
    
    filteredData.invoices.slice(-3).forEach(invoice => {
        const client = clients.find(c => c.id === invoice.clientId);
        activities.push({
            type: 'invoice',
            icon: '🧾',
            title: `Facture ${invoice.number}`,
            subtitle: `Client: ${client ? client.name : 'N/A'}`,
            time: new Date(invoice.date).toLocaleDateString('fr-FR'),
            date: new Date(invoice.date)
        });
    });
    
    filteredData.payments.slice(-2).forEach(payment => {
        const partner = clients.find(c => c.id === payment.partnerId);
        activities.push({
            type: 'payment',
            icon: '💳',
            title: `Paiement ${payment.amount.toFixed(2)} dhs`,
            subtitle: `${partner ? partner.name : 'N/A'}`,
            time: new Date(payment.date).toLocaleDateString('fr-FR'),
            date: new Date(payment.date)
        });
    });

    filteredData.deliveries.slice(-2).forEach(delivery => {
        const client = clients.find(c => c.id === delivery.clientId);
        activities.push({
            type: 'delivery',
            icon: '🚚',
            title: `Livraison ${delivery.number}`,
            subtitle: `Client: ${client ? client.name : 'N/A'}`,
            time: new Date(delivery.date).toLocaleDateString('fr-FR'),
            date: new Date(delivery.date)
        });
    });
    
    activities.sort((a, b) => b.date - a.date);
    
    if (activities.length === 0) {
        container.innerHTML = '<div class="empty-state">Aucune activité récente pour les filtres sélectionnés</div>';
        return;
    }
    
    container.innerHTML = activities.slice(0, 8).map(activity => `
        <div class="activity-item">
            <div class="activity-icon ${activity.type}">${activity.icon}</div>
            <div class="activity-content">
                <div class="activity-title">${activity.title}</div>
                <div class="activity-subtitle">${activity.subtitle}</div>
            </div>
            <div class="activity-time">${activity.time}</div>
        </div>
    `).join('');
}

// Réinitialiser les filtres du tableau de bord
function resetDashboardFilters() {
    const filterDateStart = document.getElementById('filterDateStart');
    const filterDateEnd = document.getElementById('filterDateEnd');
    const filterClient = document.getElementById('filterClient');
    const filterPaymentStatus = document.getElementById('filterPaymentStatus');
    const filterDocumentType = document.getElementById('filterDocumentType');
    const filterMinAmount = document.getElementById('filterMinAmount');
    const filterMaxAmount = document.getElementById('filterMaxAmount');
    
    if (filterDateStart) filterDateStart.value = '';
    if (filterDateEnd) filterDateEnd.value = '';
    if (filterClient) filterClient.value = '';
    if (filterPaymentStatus) filterPaymentStatus.value = '';
    if (filterDocumentType) filterDocumentType.value = '';
    if (filterMinAmount) filterMinAmount.value = '';
    if (filterMaxAmount) filterMaxAmount.value = '';
    
    // Réinitialiser l'objet des filtres
    dashboardFilters = {
        dateStart: null,
        dateEnd: null,
        clientId: null,
        paymentStatus: null,
        documentType: null,
        minAmount: null,
        maxAmount: null
    };
    
    // Rafraîchir le tableau de bord
    applyDashboardFilters();
}

function checkStockAlerts() {
    const lowStockProducts = products.filter(p => p.stock <= p.alertThreshold);
    const alertPanel = document.getElementById('stockAlerts');
    const alertContainer = document.getElementById('lowStockItems');
    
    if (alertPanel && alertContainer) {
        if (lowStockProducts.length > 0) {
            alertPanel.style.display = 'block';
            alertContainer.innerHTML = lowStockProducts.map(product => 
                `<div class="alert-item">
                    <strong>${product.name}</strong> - Stock: ${product.stock} (Seuil: ${product.alertThreshold})
                </div>`
            ).join('');
        } else {
            alertPanel.style.display = 'none';
        }
    }
}

function updateSalesChart() {
    updateFilteredSalesChart(invoices);
}

function updateClientChart() {
    updateFilteredClientChart(invoices);
}

function updateInvoiceStatusChart() {
    updateFilteredInvoiceStatusChart(invoices);
}

function displayRecentActivities() {
    const allData = {
        quotes: quotes,
        invoices: invoices,
        orders: orders,
        deliveries: deliveries,
        payments: payments
    };
    displayFilteredRecentActivities(allData);
}

// Fonctions de gestion des statuts de paiement et de livraison
function calculateInvoicePaymentStatus(invoice) {
    const relatedPayments = payments.filter(p => p.invoiceId === invoice.id);
    const totalPaid = relatedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    
    if (totalPaid === 0) {
        return 'impayee';
    } else if (totalPaid >= invoice.totalTTC) {
        return 'payee';
    } else {
        return 'partiellement-payee';
    }
}

function calculateInvoiceDeliveryStatus(invoice) {
    const relatedDeliveries = deliveries.filter(d => d.invoiceId === invoice.id);
    
    if (relatedDeliveries.length === 0) {
        return 'non-livree';
    }
    
    const allDelivered = relatedDeliveries.every(d => d.status === 'livree');
    const someDelivered = relatedDeliveries.some(d => d.status === 'livree');
    
    if (allDelivered) {
        return 'livree';
    } else if (someDelivered) {
        return 'partiellement-livree';
    } else {
        return 'expedie';
    }
}

async function updateInvoiceStatuses() {
    for (const invoice of invoices) {
        const paymentStatus = calculateInvoicePaymentStatus(invoice);
        const deliveryStatus = calculateInvoiceDeliveryStatus(invoice);
        
        if (invoice.paymentStatus !== paymentStatus || invoice.deliveryStatus !== deliveryStatus) {
            invoice.paymentStatus = paymentStatus;
            invoice.deliveryStatus = deliveryStatus;
            
            try {
                await db.collection('companies').doc(currentUser.uid)
                          .collection('invoices').doc(invoice.id)
                          .update({
                              paymentStatus: paymentStatus,
                              deliveryStatus: deliveryStatus
                          });
            } catch (error) {
                console.error('Erreur mise à jour statut facture:', error);
            }
        }
    }
}

function markInvoiceAsPaid(invoiceId) {
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return;
    
    // Créer un paiement automatique pour le montant restant
    const relatedPayments = payments.filter(p => p.invoiceId === invoiceId);
    const totalPaid = relatedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const remainingAmount = invoice.totalTTC - totalPaid;
    
    if (remainingAmount > 0) {
        openPaymentModal();
        const paymentAmount = document.getElementById('paymentAmount');
        const paymentInvoice = document.getElementById('paymentInvoice');
        const paymentPartner = document.getElementById('paymentPartner');
        const paymentType = document.getElementById('paymentType');
        const paymentDate = document.getElementById('paymentDate');
        
        if (paymentAmount) paymentAmount.value = remainingAmount.toFixed(2);
        if (paymentInvoice) paymentInvoice.value = invoiceId;
        if (paymentPartner) paymentPartner.value = invoice.clientId;
        if (paymentType) paymentType.value = 'recu';
        if (paymentDate) paymentDate.value = new Date().toISOString().split('T')[0];
    }
}

function markInvoiceAsDelivered(invoiceId) {
    const invoice = invoices.find(i => i.id === invoiceId);
    if (!invoice) return;
    
    // Créer une livraison automatique
    openDeliveryModal();
    
    const deliveryInvoice = document.getElementById('deliveryInvoice');
    const deliveryClient = document.getElementById('deliveryClient');
    const deliveryStatus = document.getElementById('deliveryStatus');
    const deliveryDate = document.getElementById('deliveryDate');
    
    if (deliveryInvoice) deliveryInvoice.value = invoiceId;
    if (deliveryClient) deliveryClient.value = invoice.clientId;
    if (deliveryStatus) deliveryStatus.value = 'livree';
    if (deliveryDate) deliveryDate.value = new Date().toISOString().split('T')[0];
    
    // Copier les lignes de la facture
    const container = document.getElementById('deliveryLines');
    if (container) {
        container.innerHTML = '';
        
        invoice.lines.forEach(line => {
            const newLine = document.createElement('div');
            newLine.className = 'line-item';
            newLine.innerHTML = `
                <input type="text" placeholder="Description" class="line-description" value="${line.description}">
                <input type="number" placeholder="Qté livrée" class="line-quantity" step="0.01" value="${line.quantity}">
                <input type="text" placeholder="Référence" class="line-reference" value="">
                <button type="button" onclick="removeLine(this)">🗑️</button>
            `;
            container.appendChild(newLine);
        });
    }
}

// Affichage des devis avec statuts de validité
function displayQuotes() {
    const tbody = document.getElementById('quotesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (quotes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="icon">📋</div>Aucun devis créé</td></tr>';
        return;
    }
    
    quotes.forEach(quote => {
        const client = clients.find(c => c.id === quote.clientId);
        const validityDisplay = quote.validityDate ? 
            new Date(quote.validityDate).toLocaleDateString('fr-FR') : 
            '-';
        
        // Vérifier si le devis est expiré
        const isExpired = quote.validityDate && new Date(quote.validityDate) < new Date();
        const validityClass = isExpired ? 'status-danger' : '';
        
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${quote.number}</td>
            <td>${client ? client.name : 'Client supprimé'}</td>
            <td>${new Date(quote.date).toLocaleDateString('fr-FR')}</td>
            <td><span class="${validityClass}">${validityDisplay}${isExpired ? ' (Expiré)' : ''}</span></td>
            <td>${quote.totalTTC.toFixed(2)} dhs</td>
            <td><span class="status-${quote.status}">${quote.status}</span></td>
            <td class="btn-group">
                <button class="btn btn-secondary" onclick="editQuote('${quote.id}')" title="Modifier">✏️</button>
                <button class="btn btn-success" onclick="generatePDF('quote', '${quote.id}')" title="Générer PDF">📄</button>
                ${quote.status === 'accepte' ? `
                    <button class="btn btn-success" onclick="convertQuoteToInvoice('${quote.id}')" title="Convertir en facture">🧾</button>
                    <button class="btn btn-success" onclick="convertQuoteToDelivery('${quote.id}')" title="Convertir en BL">🚚</button>
                ` : ''}
                <button class="btn btn-danger" onclick="deleteQuote('${quote.id}')" title="Supprimer">🗑️</button>
            </td>
        `;
    });
}

// Affichage des factures avec statuts de paiement et livraison
function displayInvoices() {
    const tbody = document.getElementById('invoicesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (invoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty-state"><div class="icon">🧾</div>Aucune facture créée</td></tr>';
        return;
    }
    
    invoices.forEach(invoice => {
        const client = clients.find(c => c.id === invoice.clientId);
        const paymentStatus = invoice.paymentStatus || calculateInvoicePaymentStatus(invoice);
        const deliveryStatus = invoice.deliveryStatus || calculateInvoiceDeliveryStatus(invoice);
        
        const dueDisplay = invoice.paymentDueDate ? 
            new Date(invoice.paymentDueDate).toLocaleDateString('fr-FR') : 
            'Immédiat';
        
        // Vérifier si la facture est en retard de paiement
        const isOverdue = invoice.paymentDueDate && 
            new Date(invoice.paymentDueDate) < new Date() && 
            paymentStatus !== 'payee';
        const dueClass = isOverdue ? 'status-danger' : '';
        
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${invoice.number}</td>
            <td>${client ? client.name : 'Client supprimé'}</td>
            <td>${new Date(invoice.date).toLocaleDateString('fr-FR')}</td>
            <td><span class="${dueClass}">${dueDisplay}${isOverdue ? ' (Retard)' : ''}</span></td>
            <td>${invoice.totalTTC.toFixed(2)} dhs</td>
            <td>
                <span class="payment-status-badge ${paymentStatus === 'payee' ? 'paid' : paymentStatus === 'partiellement-payee' ? 'partial' : 'unpaid'}">
                    ${paymentStatus === 'payee' ? '✓ Payée' : paymentStatus === 'partiellement-payee' ? '⚠ Partielle' : '✗ Impayée'}
                </span>
            </td>
            <td>
                <span class="delivery-status-badge ${deliveryStatus === 'livree' ? 'delivered' : deliveryStatus === 'expedie' ? 'shipped' : 'not-delivered'}">
                    ${deliveryStatus === 'livree' ? '✓ Livrée' : deliveryStatus === 'expedie' ? '📦 Expédiée' : '✗ Non livrée'}
                </span>
            </td>
            <td class="btn-group">
                <button class="btn btn-secondary" onclick="editInvoice('${invoice.id}')" title="Modifier">✏️</button>
                <button class="btn btn-success" onclick="generatePDF('invoice', '${invoice.id}')" title="Générer PDF">📄</button>
                ${paymentStatus !== 'payee' ? `<button class="btn btn-warning" onclick="markInvoiceAsPaid('${invoice.id}')" title="Marquer comme payée">💳</button>` : ''}
                ${deliveryStatus !== 'livree' ? `<button class="btn btn-info" onclick="markInvoiceAsDelivered('${invoice.id}')" title="Marquer comme livrée">🚚</button>` : ''}
                <button class="btn btn-danger" onclick="deleteInvoice('${invoice.id}')" title="Supprimer">🗑️</button>
            </td>
        `;
    });
}

// Affichage des paiements avec factures liées
function displayPayments() {
    const tbody = document.getElementById('paymentsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (payments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="icon">💳</div>Aucun paiement enregistré</td></tr>';
        return;
    }
    
    payments.forEach(payment => {
        const partner = clients.find(c => c.id === payment.partnerId);
        const linkedInvoice = payment.invoiceId ? invoices.find(i => i.id === payment.invoiceId) : null;
        const row = tbody.insertRow();
        const typeClass = payment.type === 'recu' ? 'success' : 'warning';
        
        row.innerHTML = `
            <td>${new Date(payment.date).toLocaleDateString('fr-FR')}</td>
            <td>${partner ? partner.name : 'N/A'}</td>
            <td>${payment.amount.toFixed(2)} dhs</td>
            <td><span class="status-${typeClass}">${payment.method}</span></td>
            <td>${linkedInvoice ? `<span class="status-info">${linkedInvoice.number}</span>` : '-'}</td>
            <td>${payment.reference || '-'}</td>
            <td class="btn-group">
                <button class="btn btn-secondary" onclick="editPayment('${payment.id}')" title="Modifier">✏️</button>
                <button class="btn btn-danger" onclick="deletePayment('${payment.id}')" title="Supprimer">🗑️</button>
            </td>
        `;
    });
}

// Affichage des livraisons avec statuts
function displayDeliveries() {
    const tbody = document.getElementById('deliveriesTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (deliveries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="icon">🚚</div>Aucun bon de livraison créé</td></tr>';
        return;
    }
    
    deliveries.forEach(delivery => {
        const client = clients.find(c => c.id === delivery.clientId);
        const row = tbody.insertRow();
        
        row.innerHTML = `
            <td>${delivery.number}</td>
            <td>${client ? client.name : 'Client supprimé'}</td>
            <td>${new Date(delivery.date).toLocaleDateString('fr-FR')}</td>
            <td>${delivery.lines.length} article(s)</td>
            <td>
                <span class="status-${delivery.status}">${delivery.status}</span>
                <div class="status-actions">
                    ${delivery.status !== 'livree' ? `
                        <button class="btn btn-success" onclick="updateDeliveryStatus('${delivery.id}', 'livree')" title="Marquer comme livrée">✓</button>
                    ` : ''}
                    ${delivery.status === 'non-livree' ? `
                        <button class="btn btn-info" onclick="updateDeliveryStatus('${delivery.id}', 'expedie')" title="Marquer comme expédiée">📦</button>
                    ` : ''}
                </div>
            </td>
            <td class="btn-group">
                <button class="btn btn-secondary" onclick="editDelivery('${delivery.id}')" title="Modifier">✏️</button>
                <button class="btn btn-success" onclick="generatePDF('delivery', '${delivery.id}')" title="Générer PDF">📄</button>
                <button class="btn btn-danger" onclick="deleteDelivery('${delivery.id}')" title="Supprimer">🗑️</button>
            </td>
        `;
    });
}

// Mise à jour du statut de livraison
async function updateDeliveryStatus(deliveryId, newStatus) {
    try {
        await db.collection('companies').doc(currentUser.uid)
                  .collection('deliveries').doc(deliveryId)
                  .update({ status: newStatus });
        
        const delivery = deliveries.find(d => d.id === deliveryId);
        if (delivery) {
            delivery.status = newStatus;
        }
        
        displayDeliveries();
        updateInvoiceStatuses();
        displayInvoices();
        
        showAlert(`Statut de livraison mis à jour: ${newStatus}`, 'success');
    } catch (error) {
        showAlert('Erreur lors de la mise à jour du statut', 'error');
    }
}

// Gestion des clients
function displayClients() {
    const tbody = document.getElementById('clientsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (clients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state"><div class="icon">👥</div>Aucun client ou fournisseur enregistré</td></tr>';
        return;
    }
    
    clients.forEach(client => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${client.name}</td>
            <td>${client.email || ''}</td>
            <td>${client.phone || ''}</td>
            <td><span class="status-${client.type}">${client.type}</span></td>
            <td class="btn-group">
                <button class="btn btn-secondary" onclick="editClient('${client.id}')" title="Modifier">✏️</button>
                <button class="btn btn-danger" onclick="deleteClient('${client.id}')" title="Supprimer">🗑️</button>
            </td>
        `;
    });
}

function openClientModal(clientId = null) {
    currentEditId = clientId;
    const modal = document.getElementById('clientModal');
    
    if (clientId) {
        const client = clients.find(c => c.id === clientId);
        if (client) {
            const clientName = document.getElementById('clientName');
            const clientType = document.getElementById('clientType');
            const clientEmail = document.getElementById('clientEmail');
            const clientPhone = document.getElementById('clientPhone');
            const clientAddress = document.getElementById('clientAddress');
            const clientSiret = document.getElementById('clientSiret');
            const clientVat = document.getElementById('clientVat');
            
            if (clientName) clientName.value = client.name;
            if (clientType) clientType.value = client.type;
            if (clientEmail) clientEmail.value = client.email || '';
            if (clientPhone) clientPhone.value = client.phone || '';
            if (clientAddress) clientAddress.value = client.address || '';
            if (clientSiret) clientSiret.value = client.siret || '';
            if (clientVat) clientVat.value = client.vat || '';
        }
    } else {
        const clientForm = document.getElementById('clientForm');
        if (clientForm) clientForm.reset();
    }
    
    if (modal) modal.style.display = 'block';
}

function editClient(clientId) {
    openClientModal(clientId);
}

async function deleteClient(clientId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce client ?')) {
        try {
            await db.collection('companies').doc(currentUser.uid).collection('clients').doc(clientId).delete();
            clients = clients.filter(c => c.id !== clientId);
            displayClients();
            showAlert('Client supprimé avec succès', 'success');
        } catch (error) {
            showAlert('Erreur lors de la suppression', 'error');
        }
    }
}

function openQuoteModal(quoteId = null) {
    currentEditId = quoteId;
    const modal = document.getElementById('quoteModal');
    const quoteForm = document.getElementById('quoteForm');
    
    if (quoteForm) quoteForm.reset();
    
    if (quoteId) {
        // TODO: Logique d'édition
    } else {
        const quoteNumber = getNextDocumentNumber('DEV', quotes);
        const quoteNumberField = document.getElementById('quoteNumber');
        const quoteDateField = document.getElementById('quoteDate');
        const quoteValidityField = document.getElementById('quoteValidity');
        const customValidityGroup = document.getElementById('customValidityGroup');
        const quoteValidityDateField = document.getElementById('quoteValidityDate');
        
        if (quoteNumberField) quoteNumberField.value = quoteNumber;
        if (quoteDateField) quoteDateField.valueAsDate = new Date();
        
        // Réinitialiser la validité par défaut
        if (quoteValidityField) quoteValidityField.value = '30';
        if (customValidityGroup) customValidityGroup.style.display = 'none';
        
        // Calculer la date de validité par défaut (30 jours)
        const validityDate = new Date();
        validityDate.setDate(validityDate.getDate() + 30);
        if (quoteValidityDateField) quoteValidityDateField.value = validityDate.toISOString().split('T')[0];
        
        resetQuoteLines();
    }
    
    if (modal) modal.style.display = 'block';
}

function addQuoteLine() {
    const container = document.getElementById('quoteLines');
    if (!container) return;
    
    const newLine = document.createElement('div');
    newLine.className = 'line-item';
    newLine.innerHTML = `
        <input type="text" placeholder="Description" class="line-description">
        <input type="number" placeholder="Qté" class="line-quantity" step="0.01">
        <input type="number" placeholder="Prix unitaire" class="line-price" step="0.01">
        <input type="number" placeholder="Total" class="line-total" readonly>
        <button type="button" onclick="removeLine(this)">🗑️</button>
    `;
    container.appendChild(newLine);
    
    const quantityInput = newLine.querySelector('.line-quantity');
    const priceInput = newLine.querySelector('.line-price');
    
    if (quantityInput) quantityInput.addEventListener('input', () => calculateAllTotals('quote'));
    if (priceInput) priceInput.addEventListener('input', () => calculateAllTotals('quote'));
}

function removeLine(button) {
    const form = button.closest('form');
    let formId = 'quote'; // valeur par défaut
    
    if (form) {
        formId = form.id.replace('Form','');
    }
    
    button.parentElement.remove();
    calculateAllTotals(formId);
}

function calculateAllTotals(prefix) {
    const lines = document.querySelectorAll(`#${prefix}Lines .line-item`);
    let subtotal = 0;
    
    lines.forEach(line => {
        const quantity = parseFloat(line.querySelector('.line-quantity').value) || 0;
        const price = parseFloat(line.querySelector('.line-price').value) || 0;
        const total = quantity * price;
        const totalField = line.querySelector('.line-total');
        if (totalField) totalField.value = total.toFixed(2);
        subtotal += total;
    });
    
    const taxRate = companySettings.taxRate / 100; // Utiliser le taux configuré
    const tax = subtotal * taxRate;
    const totalTTC = subtotal + tax;
    const currency = companySettings.currency || 'dhs';
    
    const subtotalElement = document.getElementById(`${prefix}Subtotal`);
    const taxElement = document.getElementById(`${prefix}Tax`);
    const totalElement = document.getElementById(`${prefix}Total`);
    
    if (subtotalElement) subtotalElement.textContent = subtotal.toFixed(2) + ' ' + currency;
    if (taxElement) taxElement.textContent = tax.toFixed(2) + ' ' + currency;
    if (totalElement) totalElement.textContent = totalTTC.toFixed(2) + ' ' + currency;
}

function resetQuoteLines() {
    const container = document.getElementById('quoteLines');
    if (container) {
        container.innerHTML = ``;
        addQuoteLine();
        calculateAllTotals('quote');
    }
}

// Conversion de documents
function convertQuoteToInvoice(quoteId) {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    
    openInvoiceModal();
    
    const invoiceNumber = getNextDocumentNumber('FAC', invoices);
    const invoiceNumberField = document.getElementById('invoiceNumber');
    const invoiceClientField = document.getElementById('invoiceClient');
    const fromQuoteField = document.getElementById('fromQuote');
    
    if (invoiceNumberField) invoiceNumberField.value = invoiceNumber;
    if (invoiceClientField) invoiceClientField.value = quote.clientId;
    if (fromQuoteField) {
        fromQuoteField.value = quoteId;
        fromQuoteField.dispatchEvent(new Event('change'));
    }
    
    showAlert('Devis chargé dans la nouvelle facture', 'success');
}

function convertQuoteToDelivery(quoteId) {
    const quote = quotes.find(q => q.id === quoteId);
    if (!quote) return;
    
    openDeliveryModal();
    
    const deliveryNumber = getNextDocumentNumber('BL', deliveries);
    const deliveryNumberField = document.getElementById('deliveryNumber');
    const deliveryClientField = document.getElementById('deliveryClient');
    
    if (deliveryNumberField) deliveryNumberField.value = deliveryNumber;
    if (deliveryClientField) deliveryClientField.value = quote.clientId;
    
    const container = document.getElementById('deliveryLines');
    if (container) {
        container.innerHTML = '';
        
        quote.lines.forEach(line => {
            const newLine = document.createElement('div');
            newLine.className = 'line-item';
            newLine.innerHTML = `
                <input type="text" placeholder="Description" class="line-description" value="${line.description}">
                <input type="number" placeholder="Qté livrée" class="line-quantity" step="0.01" value="${line.quantity}">
                <input type="text" placeholder="Référence" class="line-reference" value="">
                <button type="button" onclick="removeLine(this)">🗑️</button>
            `;
            container.appendChild(newLine);
        });
    }
    
    showAlert('Devis chargé dans le nouveau bon de livraison', 'success');
}

// Gestion des bons de commande
function displayOrders() {
    const tbody = document.getElementById('ordersTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="icon">📦</div>Aucun bon de commande créé</td></tr>';
        return;
    }
    
    orders.forEach(order => {
        const supplier = clients.find(c => c.id === order.supplierId);
        const validityDisplay = order.validityDate ? 
            new Date(order.validityDate).toLocaleDateString('fr-FR') : 
            '-';
        
        // Vérifier si le bon de commande est expiré
        const isExpired = order.validityDate && new Date(order.validityDate) < new Date();
        const validityClass = isExpired ? 'status-danger' : '';
        
        const row = tbody.insertRow();
        
        row.innerHTML = `
            <td>${order.number}</td>
            <td>${supplier ? supplier.name : 'Fournisseur supprimé'}</td>
            <td>${new Date(order.date).toLocaleDateString('fr-FR')}</td>
            <td><span class="${validityClass}">${validityDisplay}${isExpired ? ' (Expiré)' : ''}</span></td>
            <td>${order.totalTTC.toFixed(2)} dhs</td>
            <td><span class="status-${order.status}">${order.status}</span></td>
            <td class="btn-group">
                <button class="btn btn-secondary" onclick="editOrder('${order.id}')" title="Modifier">✏️</button>
                <button class="btn btn-success" onclick="generatePDF('order', '${order.id}')" title="Générer PDF">📄</button>
                <button class="btn btn-danger" onclick="deleteOrder('${order.id}')" title="Supprimer">🗑️</button>
            </td>
        `;
    });
}

function openOrderModal(orderId = null) {
    currentEditId = orderId;
    const modal = document.getElementById('orderModal');
    const orderForm = document.getElementById('orderForm');
    
    if (orderForm) orderForm.reset();
    
    if (orderId) {
        // TODO: Logique d'édition
    } else {
        const orderNumber = getNextDocumentNumber('BC', orders);
        const orderNumberField = document.getElementById('orderNumber');
        const orderDateField = document.getElementById('orderDate');
        const orderValidityField = document.getElementById('orderValidity');
        const customOrderValidityGroup = document.getElementById('customOrderValidityGroup');
        const orderValidityDateField = document.getElementById('orderValidityDate');
        
        if (orderNumberField) orderNumberField.value = orderNumber;
        if (orderDateField) orderDateField.valueAsDate = new Date();
        
        // Réinitialiser la validité par défaut
        if (orderValidityField) orderValidityField.value = '30';
        if (customOrderValidityGroup) customOrderValidityGroup.style.display = 'none';
        
        // Calculer la date de validité par défaut (30 jours)
        const validityDate = new Date();
        validityDate.setDate(validityDate.getDate() + 30);
        if (orderValidityDateField) orderValidityDateField.value = validityDate.toISOString().split('T')[0];
        
        resetOrderLines();
        populateSupplierSelect();
    }
    
    if (modal) modal.style.display = 'block';
}

function populateSupplierSelect() {
    const supplierSelect = document.getElementById('orderSupplier');
    if (!supplierSelect) return;
    
    supplierSelect.innerHTML = '<option value="">Sélectionner un fournisseur</option>';
    
    clients.filter(c => c.type === 'fournisseur' || c.type === 'les-deux').forEach(supplier => {
        const option = document.createElement('option');
        option.value = supplier.id;
        option.textContent = supplier.name;
        supplierSelect.appendChild(option);
    });
}

function addOrderLine() {
    const container = document.getElementById('orderLines');
    if (!container) return;
    
    const newLine = document.createElement('div');
    newLine.className = 'line-item';
    newLine.innerHTML = `
        <input type="text" placeholder="Description" class="line-description">
        <input type="number" placeholder="Qté" class="line-quantity" step="0.01">
        <input type="number" placeholder="Prix unitaire" class="line-price" step="0.01">
        <input type="number" placeholder="Total" class="line-total" readonly>
        <button type="button" onclick="removeLine(this)">🗑️</button>
    `;
    container.appendChild(newLine);
    
    const quantityInput = newLine.querySelector('.line-quantity');
    const priceInput = newLine.querySelector('.line-price');
    
    if (quantityInput) quantityInput.addEventListener('input', () => calculateAllTotals('order'));
    if (priceInput) priceInput.addEventListener('input', () => calculateAllTotals('order'));
}

function resetOrderLines() {
    const container = document.getElementById('orderLines');
    if (container) {
        container.innerHTML = ``;
        addOrderLine();
        calculateAllTotals('order');
    }
}

function openInvoiceModal(invoiceId = null) {
    currentEditId = invoiceId;
    const modal = document.getElementById('invoiceModal');
    const invoiceForm = document.getElementById('invoiceForm');
    
    if (invoiceForm) invoiceForm.reset();
    
    if (invoiceId) {
        // TODO: Logique d'édition
    } else {
        const invoiceNumber = getNextDocumentNumber('FAC', invoices);
        const invoiceNumberField = document.getElementById('invoiceNumber');
        const invoiceDateField = document.getElementById('invoiceDate');
        const invoicePaymentDueField = document.getElementById('invoicePaymentDue');
        const customPaymentDueGroup = document.getElementById('customPaymentDueGroup');
        const invoicePaymentDueDateField = document.getElementById('invoicePaymentDueDate');
        
        if (invoiceNumberField) invoiceNumberField.value = invoiceNumber;
        if (invoiceDateField) invoiceDateField.valueAsDate = new Date();
        
        // Réinitialiser l'échéance par défaut
        if (invoicePaymentDueField) invoicePaymentDueField.value = '30';
        if (customPaymentDueGroup) customPaymentDueGroup.style.display = 'none';
        
        // Calculer la date d'échéance par défaut (30 jours)
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        if (invoicePaymentDueDateField) invoicePaymentDueDateField.value = dueDate.toISOString().split('T')[0];
        
        resetInvoiceLines();
        populateQuoteSelect();
    }
    
    if (modal) modal.style.display = 'block';
}

function populateQuoteSelect() {
    const quoteSelect = document.getElementById('fromQuote');
    if (!quoteSelect) return;
    
    quoteSelect.innerHTML = '<option value="">Nouvelle facture</option>';
    
    quotes.filter(q => q.status === 'accepte').forEach(quote => {
        const client = clients.find(c => c.id === quote.clientId);
        const option = document.createElement('option');
        option.value = quote.id;
        option.textContent = `${quote.number} - ${client ? client.name : 'N/A'} - ${quote.totalTTC.toFixed(2)} dhs`;
        quoteSelect.appendChild(option);
    });
}

function addInvoiceLine() {
    const container = document.getElementById('invoiceLines');
    if (!container) return;
    
    const newLine = document.createElement('div');
    newLine.className = 'line-item';
    newLine.innerHTML = `
        <input type="text" placeholder="Description" class="line-description">
        <input type="number" placeholder="Qté" class="line-quantity" step="0.01">
        <input type="number" placeholder="Prix unitaire" class="line-price" step="0.01">
        <input type="number" placeholder="Total" class="line-total" readonly>
        <button type="button" onclick="removeLine(this)">🗑️</button>
    `;
    container.appendChild(newLine);
    
    const quantityInput = newLine.querySelector('.line-quantity');
    const priceInput = newLine.querySelector('.line-price');
    
    if (quantityInput) quantityInput.addEventListener('input', () => calculateAllTotals('invoice'));
    if (priceInput) priceInput.addEventListener('input', () => calculateAllTotals('invoice'));
}

function resetInvoiceLines() {
    const container = document.getElementById('invoiceLines');
    if (container) {
        container.innerHTML = ``;
        addInvoiceLine();
        calculateAllTotals('invoice');
    }
}

function openDeliveryModal(deliveryId = null) {
    currentEditId = deliveryId;
    const modal = document.getElementById('deliveryModal');
    const deliveryForm = document.getElementById('deliveryForm');
    
    if (deliveryForm) deliveryForm.reset();
    
    if (deliveryId) {
        // TODO: Logique d'édition
    } else {
        const deliveryNumber = getNextDocumentNumber('BL', deliveries);
        const deliveryNumberField = document.getElementById('deliveryNumber');
        const deliveryDateField = document.getElementById('deliveryDate');
        
        if (deliveryNumberField) deliveryNumberField.value = deliveryNumber;
        if (deliveryDateField) deliveryDateField.valueAsDate = new Date();
        
        resetDeliveryLines();
        populateInvoiceSelect();
    }
    
    if (modal) modal.style.display = 'block';
}

function populateInvoiceSelect() {
    const invoiceSelect = document.getElementById('deliveryInvoice');
    if (!invoiceSelect) return;
    
    invoiceSelect.innerHTML = '<option value="">Aucune facture liée</option>';
    
    invoices.forEach(invoice => {
        const client = clients.find(c => c.id === invoice.clientId);
        const option = document.createElement('option');
        option.value = invoice.id;
        option.textContent = `${invoice.number} - ${client ? client.name : 'N/A'} - ${invoice.totalTTC.toFixed(2)} dhs`;
        invoiceSelect.appendChild(option);
    });
}

function addDeliveryLine() {
    const container = document.getElementById('deliveryLines');
    if (!container) return;
    
    const newLine = document.createElement('div');
    newLine.className = 'line-item';
    newLine.innerHTML = `
        <input type="text" placeholder="Description" class="line-description">
        <input type="number" placeholder="Qté livrée" class="line-quantity" step="0.01">
        <input type="text" placeholder="Référence" class="line-reference">
        <button type="button" onclick="removeLine(this)">🗑️</button>
    `;
    container.appendChild(newLine);
}

function resetDeliveryLines() {
    const container = document.getElementById('deliveryLines');
    if (container) {
        container.innerHTML = ``;
        addDeliveryLine();
    }
}

function openPaymentModal(paymentId = null) {
    currentEditId = paymentId;
    const modal = document.getElementById('paymentModal');
    const paymentForm = document.getElementById('paymentForm');
    
    if (!paymentId) {
        const paymentDateField = document.getElementById('paymentDate');
        if (paymentDateField) paymentDateField.value = new Date().toISOString().split('T')[0];
        if (paymentForm) paymentForm.reset();
        populatePaymentPartners();
        populatePaymentInvoices();
    }
    
    if (modal) modal.style.display = 'block';
}

function populatePaymentPartners() {
    const partnerSelect = document.getElementById('paymentPartner');
    if (!partnerSelect) return;
    
    partnerSelect.innerHTML = '<option value="">Sélectionner</option>';
    
    clients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        partnerSelect.appendChild(option);
    });
}

function populatePaymentInvoices() {
    const invoiceSelect = document.getElementById('paymentInvoice');
    if (!invoiceSelect) return;
    
    invoiceSelect.innerHTML = '<option value="">Aucune facture liée</option>';
    
    // Afficher seulement les factures impayées ou partiellement payées
    invoices.filter(invoice => {
        const status = calculateInvoicePaymentStatus(invoice);
        return status === 'impayee' || status === 'partiellement-payee';
    }).forEach(invoice => {
        const client = clients.find(c => c.id === invoice.clientId);
        const option = document.createElement('option');
        option.value = invoice.id;
        option.textContent = `${invoice.number} - ${client ? client.name : 'N/A'} - ${invoice.totalTTC.toFixed(2)} dhs`;
        invoiceSelect.appendChild(option);
    });
}

// Gestion des produits avec alertes de stock
function displayStock() {
    const tbody = document.getElementById('stockTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="icon">📦</div>Aucun produit enregistré</td></tr>';
        return;
    }
    
    products.forEach(product => {
        const row = tbody.insertRow();
        const isLowStock = product.stock <= product.alertThreshold;
        const stockClass = isLowStock ? 'low-stock' : '';
        
        row.innerHTML = `
            <td>${product.reference}</td>
            <td>${product.name}</td>
            <td class="${stockClass}">${product.stock} ${isLowStock ? '⚠️' : ''}</td>
            <td>${product.alertThreshold}</td>
            <td>${product.buyPrice ? product.buyPrice.toFixed(2) + ' dhs' : ''}</td>
            <td>${product.sellPrice ? product.sellPrice.toFixed(2) + ' dhs' : ''}</td>
            <td class="btn-group">
                <button class="btn btn-secondary" onclick="editProduct('${product.id}')" title="Modifier">✏️</button>
                <button class="btn btn-danger" onclick="deleteProduct('${product.id}')" title="Supprimer">🗑️</button>
            </td>
        `;
    });
}

function openProductModal(productId = null) {
    currentEditId = productId;
    const modal = document.getElementById('productModal');
    
    if (productId) {
        const product = products.find(p => p.id === productId);
        if (product) {
            const productRefField = document.getElementById('productRef');
            const productNameField = document.getElementById('productName');
            const productBuyPriceField = document.getElementById('productBuyPrice');
            const productSellPriceField = document.getElementById('productSellPrice');
            const productStockField = document.getElementById('productStock');
            const productAlertField = document.getElementById('productAlert');
            const productDescriptionField = document.getElementById('productDescription');
            
            if (productRefField) productRefField.value = product.reference;
            if (productNameField) productNameField.value = product.name;
            if (productBuyPriceField) productBuyPriceField.value = product.buyPrice || '';
            if (productSellPriceField) productSellPriceField.value = product.sellPrice || '';
            if (productStockField) productStockField.value = product.stock;
            if (productAlertField) productAlertField.value = product.alertThreshold;
            if (productDescriptionField) productDescriptionField.value = product.description || '';
        }
    } else {
        const productForm = document.getElementById('productForm');
        if (productForm) productForm.reset();
        
        const productStockField = document.getElementById('productStock');
        const productAlertField = document.getElementById('productAlert');
        
        if (productStockField) productStockField.value = 0;
        if (productAlertField) productAlertField.value = 5;
    }
    
    if (modal) modal.style.display = 'block';
}

function editProduct(productId) {
    openProductModal(productId);
}

async function deleteProduct(productId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce produit ?')) {
        try {
            await db.collection('companies').doc(currentUser.uid).collection('products').doc(productId).delete();
            products = products.filter(p => p.id !== productId);
            displayStock();
            showAlert('Produit supprimé avec succès', 'success');
        } catch (error) {
            showAlert('Erreur lors de la suppression', 'error');
        }
    }
}

// Gestion des transactions
function displayTransactions() {
    const tbody = document.getElementById('transactionsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="icon">💰</div>Aucune transaction enregistrée</td></tr>';
        return;
    }
    
    transactions.forEach(transaction => {
        const partner = clients.find(c => c.id === transaction.partnerId);
        const product = products.find(p => p.id === transaction.productId);
        let margin = '-';
        
        if (transaction.type === 'vente' && product && product.buyPrice) {
            const marginAmount = (transaction.price - product.buyPrice) * transaction.quantity;
            const marginPercent = ((transaction.price - product.buyPrice) / product.buyPrice * 100).toFixed(1);
            margin = `${marginAmount.toFixed(2)} dhs (${marginPercent}%)`;
        }
        
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${new Date(transaction.date).toLocaleDateString('fr-FR')}</td>
            <td><span class="status-${transaction.type}">${transaction.type}</span></td>
            <td>${partner ? partner.name : 'N/A'}</td>
            <td>${transaction.total.toFixed(2)} dhs</td>
            <td>${margin}</td>
            <td class="btn-group">
                <button class="btn btn-secondary" onclick="editTransaction('${transaction.id}')" title="Modifier">✏️</button>
                <button class="btn btn-danger" onclick="deleteTransaction('${transaction.id}')" title="Supprimer">🗑️</button>
            </td>
        `;
    });
}

function openTransactionModal(transactionId = null) {
    currentEditId = transactionId;
    const modal = document.getElementById('transactionModal');
    
    if (!transactionId) {
        const transactionDateField = document.getElementById('transactionDate');
        const transactionForm = document.getElementById('transactionForm');
        
        if (transactionDateField) transactionDateField.value = new Date().toISOString().split('T')[0];
        if (transactionForm) transactionForm.reset();
        updateTransactionForm();
    }
    
    if (modal) modal.style.display = 'block';
}

function updateTransactionForm() {
    const typeField = document.getElementById('transactionType');
    const partnerLabel = document.getElementById('partnerLabel');
    const partnerSelect = document.getElementById('transactionPartner');
    
    if (!typeField || !partnerLabel || !partnerSelect) return;
    
    const type = typeField.value;
    partnerLabel.textContent = type === 'vente' ? 'Client *' : 'Fournisseur *';
    partnerSelect.innerHTML = '<option value="">Sélectionner</option>';
    
    const filteredClients = clients.filter(c => 
        type === 'vente' ? (c.type === 'client' || c.type === 'les-deux') : 
                           (c.type === 'fournisseur' || c.type === 'les-deux')
    );
    
    filteredClients.forEach(client => {
        const option = document.createElement('option');
        option.value = client.id;
        option.textContent = client.name;
        partnerSelect.appendChild(option);
    });
}

// Gestion des modals
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
    currentEditId = null;
}

// Peupler tous les selects
function populateAllSelects() {
    populateClientSelects();
    populateProductSelects();
}

function populateClientSelects() {
    const selects = ['quoteClient', 'invoiceClient', 'deliveryClient'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">Sélectionner un client</option>';
            
            clients.filter(c => c.type === 'client' || c.type === 'les-deux').forEach(client => {
                const option = document.createElement('option');
                option.value = client.id;
                option.textContent = client.name;
                select.appendChild(option);
            });
        }
    });
}

function populateProductSelects() {
    const productSelect = document.getElementById('transactionProduct');
    if (productSelect) {
        productSelect.innerHTML = '<option value="">Sélectionner un produit</option>';
        
        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = `${product.reference} - ${product.name}`;
            productSelect.appendChild(option);
        });
    }
}

// Recherche
function searchClients() {
    const search = document.getElementById('clientSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#clientsTableBody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
}

function searchQuotes() {
    const search = document.getElementById('quoteSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#quotesTableBody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
}

function searchInvoices() {
    const search = document.getElementById('invoiceSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#invoicesTableBody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
}

function searchStock() {
    const search = document.getElementById('stockSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#stockTableBody tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(search) ? '' : 'none';
    });
}

// Fonctions d'édition et de suppression
function editClient(clientId) {
    openClientModal(clientId);
}

function editQuote(quoteId) {
    openQuoteModal(quoteId);
}

function editInvoice(invoiceId) {
    openInvoiceModal(invoiceId);
}

function editOrder(orderId) {
    openOrderModal(orderId);
}

function editDelivery(deliveryId) {
    openDeliveryModal(deliveryId);
}

function editTransaction(transactionId) {
    openTransactionModal(transactionId);
}

function editPayment(paymentId) {
    openPaymentModal(paymentId);
}

function editProduct(productId) {
    openProductModal(productId);
}

// Fonctions de suppression
async function deleteQuote(quoteId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce devis ?')) {
        try {
            await db.collection('companies').doc(currentUser.uid).collection('quotes').doc(quoteId).delete();
            quotes = quotes.filter(q => q.id !== quoteId);
            displayQuotes();
            updateDashboard();
            showAlert('Devis supprimé avec succès', 'success');
        } catch (error) {
            showAlert('Erreur lors de la suppression', 'error');
        }
    }
}

async function deleteInvoice(invoiceId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette facture ?')) {
        try {
            await db.collection('companies').doc(currentUser.uid).collection('invoices').doc(invoiceId).delete();
            invoices = invoices.filter(i => i.id !== invoiceId);
            displayInvoices();
            updateDashboard();
            showAlert('Facture supprimée avec succès', 'success');
        } catch (error) {
            showAlert('Erreur lors de la suppression', 'error');
        }
    }
}

async function deleteOrder(orderId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce bon de commande ?')) {
        try {
            await db.collection('companies').doc(currentUser.uid).collection('orders').doc(orderId).delete();
            orders = orders.filter(o => o.id !== orderId);
            displayOrders();
            showAlert('Bon de commande supprimé avec succès', 'success');
        } catch (error) {
            showAlert('Erreur lors de la suppression', 'error');
        }
    }
}

async function deleteDelivery(deliveryId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce bon de livraison ?')) {
        try {
            await db.collection('companies').doc(currentUser.uid).collection('deliveries').doc(deliveryId).delete();
            deliveries = deliveries.filter(d => d.id !== deliveryId);
            displayDeliveries();
            showAlert('Bon de livraison supprimé avec succès', 'success');
        } catch (error) {
            showAlert('Erreur lors de la suppression', 'error');
        }
    }
}

async function deleteTransaction(transactionId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette transaction ?')) {
        try {
            await db.collection('companies').doc(currentUser.uid).collection('transactions').doc(transactionId).delete();
            transactions = transactions.filter(t => t.id !== transactionId);
            displayTransactions();
            showAlert('Transaction supprimée avec succès', 'success');
        } catch (error) {
            showAlert('Erreur lors de la suppression', 'error');
        }
    }
}

async function deletePayment(paymentId) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce paiement ?')) {
        try {
            await db.collection('companies').doc(currentUser.uid).collection('payments').doc(paymentId).delete();
            payments = payments.filter(p => p.id !== paymentId);
            displayPayments();
            updateInvoiceStatuses();
            displayInvoices();
            showAlert('Paiement supprimé avec succès', 'success');
        } catch (error) {
            showAlert('Erreur lors de la suppression', 'error');
        }
    }
}

// **NOUVELLE FONCTION PDF AVEC DESIGN AMÉLIORÉ**
function generatePDF(type, id) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    let documentData, partner, title;
    
    // Couleurs du thème
    const primaryColor = '#2d3e50'; // Bleu nuit
    const secondaryColor = '#3498db'; // Bleu clair
    const lightGray = '#f8f9f9';
    const darkGray = '#34495e';
    const textColor = '#2c3e50';

    switch(type) {
        case 'quote':
            documentData = quotes.find(q => q.id === id);
            partner = clients.find(c => c.id === documentData.clientId);
            title = 'DEVIS';
            break;
        case 'invoice':
            documentData = invoices.find(i => i.id === id);
            partner = clients.find(c => c.id === documentData.clientId);
            title = 'FACTURE';
            break;
        case 'order':
            documentData = orders.find(o => o.id === id);
            partner = clients.find(c => c.id === documentData.supplierId);
            title = 'BON DE COMMANDE';
            break;
        case 'delivery':
            documentData = deliveries.find(d => d.id === id);
            partner = clients.find(c => c.id === documentData.clientId);
            title = 'BON DE LIVRAISON';
            break;
    }
    
    if (!documentData) {
        showAlert('Document non trouvé', 'error');
        return;
    }

    // === En-tête ===
    doc.setFillColor('#ffffff'); // Couleur blanche
    doc.rect(0, 0, 210, 25, 'F'); // Bandeau en haut

    if (companySettings.logo) {
        try {
            doc.addImage(companySettings.logo, 'PNG', 15, 5, 30, 15);
        } catch (error) {
            console.error('Erreur ajout logo:', error);
        }
    }

    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor('#000000'); // Texte noir
    if (companySettings.name) {
        doc.text(companySettings.name, 200, 15, { align: 'right' });
    }

    // === Titre du document ===
    doc.setFontSize(26);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(primaryColor);
    doc.text(title, 20, 45);
    
    doc.setDrawColor(secondaryColor);
    doc.setLineWidth(0.5);
    doc.line(20, 50, 90, 50);

    // === Informations Document et Client ===
    // Infos client/fournisseur (à gauche)
    const partnerLabel = type === 'order' ? 'ADRESSÉ À :' : 'CLIENT :';
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(darkGray);
    doc.text(partnerLabel, 20, 65);
    doc.setFont(undefined, 'normal');
    if (partner) {
        doc.text(partner.name, 20, 72);
        if (partner.address) {
            const addressLines = doc.splitTextToSize(partner.address, 70);
            doc.text(addressLines, 20, 78);
        }
    }

    // Infos document (à droite)
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(primaryColor);
    doc.text(`N° :`, 130, 65);
    doc.setFont(undefined, 'normal');
    doc.text(`${documentData.number}`, 150, 65);

    doc.setFont(undefined, 'bold');
    doc.text(`Date :`, 130, 72);
    doc.setFont(undefined, 'normal');
    doc.text(`${new Date(documentData.date).toLocaleDateString('fr-FR')}`, 150, 72);

    if ((type === 'quote' || type === 'order') && documentData.validityDate) {
        doc.setFont(undefined, 'bold');
        doc.text(`Validité :`, 130, 79);
        doc.setFont(undefined, 'normal');
        doc.text(`${new Date(documentData.validityDate).toLocaleDateString('fr-FR')}`, 150, 79);
    }
    if (type === 'invoice' && documentData.paymentDueDate) {
        doc.setFont(undefined, 'bold');
        doc.text(`Échéance :`, 130, 79);
        doc.setFont(undefined, 'normal');
        doc.text(` ${new Date(documentData.paymentDueDate).toLocaleDateString('fr-FR')}`, 150, 79);
    }

    // === Tableau des articles ===
    let tableStartY = 100;
    doc.setFontSize(10);

    const tableHeaders = (type !== 'delivery') 
        ? ['Description', 'Qté', 'Prix U.', 'Total']
        : ['Description', 'Qté livrée', 'Référence'];
    const colWidths = (type !== 'delivery') 
        ? [90, 20, 30, 30] 
        : [110, 30, 30];

    // En-têtes du tableau
    doc.setFillColor(darkGray);
    doc.setTextColor('#ffffff');
    doc.setFont(undefined, 'bold');
    doc.rect(20, tableStartY, 170, 10, 'F');
    let xPos = 22;
    tableHeaders.forEach((header, i) => {
        doc.text(header, xPos, tableStartY + 7);
        xPos += colWidths[i];
    });

    // Lignes d'articles
    let currentY = tableStartY + 10;
    doc.setFont(undefined, 'normal');
    doc.setTextColor(textColor);

    documentData.lines.forEach((line, index) => {
        if (currentY > 260) {
            doc.addPage();
            currentY = 20;
            // Redessiner l'en-tête du tableau sur la nouvelle page
            doc.setFillColor(darkGray);
            doc.setTextColor('#ffffff');
            doc.setFont(undefined, 'bold');
            doc.rect(20, currentY, 170, 10, 'F');
            let nxPos = 22;
            tableHeaders.forEach((header, i) => {
                doc.text(header, nxPos, currentY + 7);
                nxPos += colWidths[i];
            });
            currentY += 10;
        }

        // Alternance de couleur de fond (zebra-striping)
        if (index % 2 === 1) {
            doc.setFillColor(lightGray);
            doc.rect(20, currentY, 170, 8, 'F');
        }

        // Contenu des cellules
        let xCell = 22;
        doc.text(doc.splitTextToSize(line.description, colWidths[0] - 5), xCell, currentY + 5.5);
        xCell += colWidths[0];

        if (type !== 'delivery') {
            doc.text(line.quantity.toString(), xCell + (colWidths[1]/2), currentY + 5.5, { align: 'center' });
            xCell += colWidths[1];
            doc.text(line.price.toFixed(2), xCell + (colWidths[2]/2), currentY + 5.5, { align: 'center' });
            xCell += colWidths[2];
            doc.text(line.total.toFixed(2), xCell + colWidths[3] - 5, currentY + 5.5, { align: 'right' });
        } else {
            doc.text(line.quantity.toString(), xCell + (colWidths[1]/2), currentY + 5.5, { align: 'center' });
            xCell += colWidths[1];
            doc.text(line.reference || '', xCell + 2, currentY + 5.5);
        }
        
        currentY += 8;
    });
    
    // Cadre autour du tableau
    doc.setDrawColor(darkGray);
    doc.rect(20, tableStartY, 170, currentY - tableStartY);


    // === Section Totaux (sauf pour BL) ===
    if (type !== 'delivery') {
        let totalsY = currentY + 10;
        const totalXLabel = 140;
        const totalXValue = 190;
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        
        doc.text('Total HT :', totalXLabel, totalsY, { align: 'right' });
        doc.text(`${documentData.subtotal.toFixed(2)} ${companySettings.currency}`, totalXValue, totalsY, { align: 'right' });
        totalsY += 7;
        
        doc.text(`TVA (${companySettings.taxRate}%) :`, totalXLabel, totalsY, { align: 'right' });
        doc.text(`${documentData.tax.toFixed(2)} ${companySettings.currency}`, totalXValue, totalsY, { align: 'right' });
        totalsY += 7;

        doc.setDrawColor(darkGray);
        doc.line(130, totalsY, 190, totalsY);
        totalsY += 2;
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(primaryColor);
        doc.text('Total TTC :', totalXLabel, totalsY + 5, { align: 'right' });
        doc.text(`${documentData.totalTTC.toFixed(2)} ${companySettings.currency}`, totalXValue, totalsY + 5, { align: 'right' });
        
        // Arrêté en lettres
        let arretY = totalsY + 20;
        doc.setFontSize(9);
        doc.setFont(undefined, 'italic');
        doc.setTextColor(darkGray);
        
        const totalInteger = Math.floor(documentData.totalTTC);
        const totalCents = Math.round((documentData.totalTTC - totalInteger) * 100);
        const totalInWords = numberToWords(totalInteger);
        const centsInWords = totalCents > 0 ? ` et ${numberToWords(totalCents)} centimes` : '';
        
        let arretPrefix = 'Arrêté la présente';
        let docTypeWord = title.toLowerCase();
        if (type === 'quote' || type === 'order') {
            arretPrefix = 'Arrêté le présent';
            if (type === 'order') docTypeWord = 'bon de commande';
        }

        const arretText = `${arretPrefix} ${docTypeWord} à la somme de ${totalInWords}${centsInWords} ${companySettings.currency || 'DHS'} TTC.`;
        const arretLines = doc.splitTextToSize(arretText, 170);
        doc.text(arretLines, 20, arretY);
    }
    
    // === Pied de page et Signature ===
    let footerY = 275;
    
    // Cachet et signature
    if (companySettings.stamp) {
        try {
            doc.setFontSize(9);
            doc.setFont(undefined, 'italic');
            doc.setTextColor(darkGray);
            doc.text('Signé et Cachet', 173, footerY - 45, {align: 'center'});
            doc.addImage(companySettings.stamp, 'PNG', 155, footerY - 40, 35, 25);
        } catch (error) {
            console.error('Erreur ajout cachet:', error);
        }
    }
    
    // Notes et conditions
    const notes = documentData.notes || companySettings.defaultNotes || companySettings.paymentTerms;
    if (notes) {
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(darkGray);
        const notesLines = doc.splitTextToSize(`Notes : ${notes}`, 120);
        doc.text(notesLines, 20, footerY - 15);
    }

    // Ligne de pied de page
    doc.setDrawColor(secondaryColor);
    doc.setLineWidth(0.5);
    doc.line(10, footerY, 200, footerY);

    // Infos pied de page
    doc.setFontSize(8);
    doc.setTextColor(darkGray);
    if (companySettings.website) {
        doc.text(companySettings.website, 105, footerY + 5, { align: 'center' });
    }
    doc.text(`Page 1 sur 1`, 200, footerY + 5, { align: 'right' });

    // Télécharger le PDF
    const filename = `${title}_${documentData.number}.pdf`;
    doc.save(filename);
}

// Gestionnaires d'événements pour les formulaires
document.addEventListener('DOMContentLoaded', function() {
    const today = new Date().toISOString().split('T')[0];
    const dateInputs = ['quoteDate', 'invoiceDate', 'orderDate', 'deliveryDate', 'transactionDate', 'paymentDate'];
    
    dateInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = today;
        }
    });
    
    // Initialiser les dates de filtres par défaut (dernier mois)
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    const filterDateStart = document.getElementById('filterDateStart');
    const filterDateEnd = document.getElementById('filterDateEnd');
    
    if (filterDateStart && filterDateEnd) {
        filterDateStart.value = startOfMonth.toISOString().split('T')[0];
        filterDateEnd.value = today;
    }
    
    // Initialiser les fonctionnalités d'upload d'images
    setupImageUpload();
    
    // Animation de particules CSS
    const particleStyle = document.createElement('style');
    particleStyle.textContent = `
        @keyframes particleFloat {
            0% {
                opacity: 1;
                transform: scale(1) translateY(0);
            }
            100% {
                opacity: 0;
                transform: scale(0.5) translateY(-30px);
            }
        }
    `;
    document.head.appendChild(particleStyle);
    
    // Conversion de devis en facture
    const fromQuote = document.getElementById('fromQuote');
    if (fromQuote) {
        fromQuote.addEventListener('change', function() {
            const quoteId = this.value;
            if (quoteId) {
                const quote = quotes.find(q => q.id === quoteId);
                if (quote) {
                    const invoiceClientField = document.getElementById('invoiceClient');
                    if (invoiceClientField) invoiceClientField.value = quote.clientId;
                    
                    const container = document.getElementById('invoiceLines');
                    if (container) {
                        container.innerHTML = '';
                        
                        quote.lines.forEach(line => {
                            const newLine = document.createElement('div');
                            newLine.className = 'line-item';
                            newLine.innerHTML = `
                                <input type="text" placeholder="Description" class="line-description" value="${line.description}">
                                <input type="number" placeholder="Qté" class="line-quantity" step="0.01" value="${line.quantity}">
                                <input type="number" placeholder="Prix unitaire" class="line-price" step="0.01" value="${line.price}">
                                <input type="number" placeholder="Total" class="line-total" readonly value="${line.total}">
                                <button type="button" onclick="removeLine(this)">🗑️</button>
                            `;
                            container.appendChild(newLine);
                            
                            const quantityInput = newLine.querySelector('.line-quantity');
                            const priceInput = newLine.querySelector('.line-price');
                            
                            if (quantityInput) quantityInput.addEventListener('input', () => calculateAllTotals('invoice'));
                            if (priceInput) priceInput.addEventListener('input', () => calculateAllTotals('invoice'));
                        });
                        
                        calculateAllTotals('invoice');
                    }
                }
            } else {
                resetInvoiceLines();
            }
        });
    }
    
    // Gestion des champs de validité personnalisés
    const quoteValidity = document.getElementById('quoteValidity');
    if (quoteValidity) {
        quoteValidity.addEventListener('change', function() {
            const customGroup = document.getElementById('customValidityGroup');
            const quoteValidityDateField = document.getElementById('quoteValidityDate');
            
            if (this.value === 'custom') {
                if (customGroup) customGroup.style.display = 'block';
            } else {
                if (customGroup) customGroup.style.display = 'none';
                // Calculer automatiquement la date de validité
                const days = parseInt(this.value);
                const validityDate = new Date();
                validityDate.setDate(validityDate.getDate() + days);
                if (quoteValidityDateField) quoteValidityDateField.value = validityDate.toISOString().split('T')[0];
            }
        });
    }
    
    const invoicePaymentDue = document.getElementById('invoicePaymentDue');
    if (invoicePaymentDue) {
        invoicePaymentDue.addEventListener('change', function() {
            const customGroup = document.getElementById('customPaymentDueGroup');
            const invoicePaymentDueDateField = document.getElementById('invoicePaymentDueDate');
            
            if (this.value === 'custom') {
                if (customGroup) customGroup.style.display = 'block';
            } else {
                if (customGroup) customGroup.style.display = 'none';
                // Calculer automatiquement la date d'échéance
                const days = parseInt(this.value);
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + days);
                if (invoicePaymentDueDateField) invoicePaymentDueDateField.value = dueDate.toISOString().split('T')[0];
            }
        });
    }
    
    const orderValidity = document.getElementById('orderValidity');
    if (orderValidity) {
        orderValidity.addEventListener('change', function() {
            const customGroup = document.getElementById('customOrderValidityGroup');
            const orderValidityDateField = document.getElementById('orderValidityDate');
            
            if (this.value === 'custom') {
                if (customGroup) customGroup.style.display = 'block';
            } else {
                if (customGroup) customGroup.style.display = 'none';
                // Calculer automatiquement la date de validité
                const days = parseInt(this.value);
                const validityDate = new Date();
                validityDate.setDate(validityDate.getDate() + days);
                if (orderValidityDateField) orderValidityDateField.value = validityDate.toISOString().split('T')[0];
            }
        });
    }
    
    // Gestionnaires pour les formulaires d'authentification
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    if (loginForm) loginForm.addEventListener('submit', login);
    if (registerForm) registerForm.addEventListener('submit', register);
    
    // Gestionnaire pour le formulaire des informations d'entreprise
    const companyInfoForm = document.getElementById('companyInfoForm');
    if (companyInfoForm) {
        companyInfoForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const companyNameField = document.getElementById('companyNameSettings');
            const companySiretField = document.getElementById('companySiret');
            const companyAddressField = document.getElementById('companyAddress');
            const companyPhoneField = document.getElementById('companyPhone');
            const companyEmailField = document.getElementById('companyEmail');
            const companyWebsiteField = document.getElementById('companyWebsite');
            
            if (companyNameField) companySettings.name = companyNameField.value;
            if (companySiretField) companySettings.siret = companySiretField.value;
            if (companyAddressField) companySettings.address = companyAddressField.value;
            if (companyPhoneField) companySettings.phone = companyPhoneField.value;
            if (companyEmailField) companySettings.email = companyEmailField.value;
            if (companyWebsiteField) companySettings.website = companyWebsiteField.value;
            
            await saveCompanySettings();
        });
        
        // Sauvegarde automatique des champs d'informations de l'entreprise
        const companyFields = [
            { id: 'companyNameSettings', key: 'name' },
            { id: 'companySiret', key: 'siret' },
            { id: 'companyAddress', key: 'address' },
            { id: 'companyPhone', key: 'phone' },
            { id: 'companyEmail', key: 'email' },
            { id: 'companyWebsite', key: 'website' }
        ];
        
        companyFields.forEach(field => {
            const element = document.getElementById(field.id);
            if (element) {
                element.addEventListener('blur', function() {
                    if (this.value !== companySettings[field.key]) {
                        saveCompanyField(field.key, this.value);
                        showAutoSaveNotification('💾 Informations sauvegardées');
                    }
                });
            }
        });
    }
    
    // Gestionnaire pour les préférences de documents
    const documentPreferencesForm = document.getElementById('documentPreferencesForm');
    if (documentPreferencesForm) {
        documentPreferencesForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const defaultTaxRateField = document.getElementById('defaultTaxRate');
            const defaultCurrencyField = document.getElementById('defaultCurrency');
            const defaultPaymentTermsField = document.getElementById('defaultPaymentTerms');
            const defaultNotesField = document.getElementById('defaultNotes');
            
            if (defaultTaxRateField) companySettings.taxRate = parseFloat(defaultTaxRateField.value) || 20;
            if (defaultCurrencyField) companySettings.currency = defaultCurrencyField.value;
            if (defaultPaymentTermsField) companySettings.paymentTerms = defaultPaymentTermsField.value;
            if (defaultNotesField) companySettings.defaultNotes = defaultNotesField.value;
            
            await saveCompanySettings();
        });
        
        // Sauvegarde automatique des préférences de documents
        const preferenceFields = [
            { id: 'defaultTaxRate', key: 'taxRate', type: 'number' },
            { id: 'defaultCurrency', key: 'currency' },
            { id: 'defaultPaymentTerms', key: 'paymentTerms' },
            { id: 'defaultNotes', key: 'defaultNotes' }
        ];
        
        preferenceFields.forEach(field => {
            const element = document.getElementById(field.id);
            if (element) {
                element.addEventListener('change', function() {
                    let newValue = this.value;
                    if (field.type === 'number') {
                        newValue = parseFloat(newValue) || 20;
                    }
                    
                    if (newValue !== companySettings[field.key]) {
                        saveCompanyField(field.key, newValue);
                        showAutoSaveNotification('💾 Préférence sauvegardée');
                    }
                });
            }
        });
    }

    // Gestionnaires pour tous les formulaires
    const clientForm = document.getElementById('clientForm');
    if (clientForm) {
        clientForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const clientData = {
                name: document.getElementById('clientName').value,
                type: document.getElementById('clientType').value,
                email: document.getElementById('clientEmail').value,
                phone: document.getElementById('clientPhone').value,
                address: document.getElementById('clientAddress').value,
                siret: document.getElementById('clientSiret').value,
                vat: document.getElementById('clientVat').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            try {
                if (currentEditId) {
                    await db.collection('companies').doc(currentUser.uid).collection('clients').doc(currentEditId).update(clientData);
                    const index = clients.findIndex(c => c.id === currentEditId);
                    clients[index] = {...clients[index], ...clientData};
                } else {
                    clientData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    const docRef = await db.collection('companies').doc(currentUser.uid).collection('clients').add(clientData);
                    clients.push({id: docRef.id, ...clientData});
                }
                
                closeModal('clientModal');
                displayClients();
                populateClientSelects();
                showAlert('Client enregistré avec succès', 'success');
                
            } catch (error) {
                showAlert('Erreur lors de l\'enregistrement', 'error');
                console.error(error);
            }
        });
    }

    const productForm = document.getElementById('productForm');
    if (productForm) {
        productForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const productData = {
                reference: document.getElementById('productRef').value,
                name: document.getElementById('productName').value,
                buyPrice: parseFloat(document.getElementById('productBuyPrice').value) || 0,
                sellPrice: parseFloat(document.getElementById('productSellPrice').value) || 0,
                stock: parseInt(document.getElementById('productStock').value) || 0,
                alertThreshold: parseInt(document.getElementById('productAlert').value) || 5,
                description: document.getElementById('productDescription').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            try {
                if (currentEditId) {
                    await db.collection('companies').doc(currentUser.uid).collection('products').doc(currentEditId).update(productData);
                    const index = products.findIndex(p => p.id === currentEditId);
                    products[index] = {...products[index], ...productData};
                } else {
                    productData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    const docRef = await db.collection('companies').doc(currentUser.uid).collection('products').add(productData);
                    products.push({id: docRef.id, ...productData});
                }
                
                closeModal('productModal');
                displayStock();
                showAlert('Produit enregistré avec succès', 'success');
                
            } catch (error) {
                showAlert('Erreur lors de l\'enregistrement', 'error');
                console.error(error);
            }
        });
    }

    const quoteForm = document.getElementById('quoteForm');
    if (quoteForm) {
        quoteForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const lines = [];
            document.querySelectorAll('#quoteLines .line-item').forEach(line => {
                const description = line.querySelector('.line-description').value;
                const quantity = parseFloat(line.querySelector('.line-quantity').value) || 0;
                const price = parseFloat(line.querySelector('.line-price').value) || 0;
                const total = parseFloat(line.querySelector('.line-total').value) || 0;
                
                if (description && quantity > 0 && price > 0) {
                    lines.push({description, quantity, price, total});
                }
            });
            
            if (lines.length === 0) {
                showAlert('Veuillez ajouter au moins une ligne valide', 'error');
                return;
            }
            
            const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
            const taxRate = companySettings.taxRate / 100;
            const tax = subtotal * taxRate;
            const totalTTC = subtotal + tax;
            
            // Calculer la date de validité
            let validityDate = null;
            const validityType = document.getElementById('quoteValidity').value;
            if (validityType === 'custom') {
                validityDate = document.getElementById('quoteValidityDate').value;
            } else {
                const days = parseInt(validityType);
                const validity = new Date();
                validity.setDate(validity.getDate() + days);
                validityDate = validity.toISOString().split('T')[0];
            }
            
            const quoteData = {
                number: document.getElementById('quoteNumber').value,
                date: document.getElementById('quoteDate').value,
                clientId: document.getElementById('quoteClient').value,
                validityDate: validityDate,
                lines: lines,
                subtotal: subtotal,
                tax: tax,
                totalTTC: totalTTC,
                status: 'en-attente',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            try {
                if (currentEditId) {
                    await db.collection('companies').doc(currentUser.uid).collection('quotes').doc(currentEditId).update(quoteData);
                    const index = quotes.findIndex(q => q.id === currentEditId);
                    quotes[index] = {...quotes[index], ...quoteData};
                } else {
                    quoteData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    const docRef = await db.collection('companies').doc(currentUser.uid).collection('quotes').add(quoteData);
                    quotes.push({id: docRef.id, ...quoteData});
                }
                
                closeModal('quoteModal');
                displayQuotes();
                updateDashboard();
                showAlert('Devis enregistré avec succès', 'success');
                
            } catch (error) {
                showAlert('Erreur lors de l\'enregistrement', 'error');
                console.error(error);
            }
        });
    }

    const invoiceForm = document.getElementById('invoiceForm');
    if (invoiceForm) {
        invoiceForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const lines = [];
            document.querySelectorAll('#invoiceLines .line-item').forEach(line => {
                const description = line.querySelector('.line-description').value;
                const quantity = parseFloat(line.querySelector('.line-quantity').value) || 0;
                const price = parseFloat(line.querySelector('.line-price').value) || 0;
                const total = parseFloat(line.querySelector('.line-total').value) || 0;
                
                if (description && quantity > 0 && price > 0) {
                    lines.push({description, quantity, price, total});
                }
            });
            
            if (lines.length === 0) {
                showAlert('Veuillez ajouter au moins une ligne valide', 'error');
                return;
            }
            
            const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
            const taxRate = companySettings.taxRate / 100;
            const tax = subtotal * taxRate;
            const totalTTC = subtotal + tax;
            
            // Calculer la date d'échéance de paiement
            let paymentDueDate = null;
            const paymentDueType = document.getElementById('invoicePaymentDue').value;
            if (paymentDueType === 'custom') {
                paymentDueDate = document.getElementById('invoicePaymentDueDate').value;
            } else if (paymentDueType !== '0') {
                const days = parseInt(paymentDueType);
                const dueDate = new Date(document.getElementById('invoiceDate').value);
                dueDate.setDate(dueDate.getDate() + days);
                paymentDueDate = dueDate.toISOString().split('T')[0];
            }
            
            const invoiceData = {
                number: document.getElementById('invoiceNumber').value,
                date: document.getElementById('invoiceDate').value,
                clientId: document.getElementById('invoiceClient').value,
                type: document.getElementById('invoiceType').value,
                paymentDueDate: paymentDueDate,
                lines: lines,
                subtotal: subtotal,
                tax: tax,
                totalTTC: totalTTC,
                paymentStatus: 'impayee',
                deliveryStatus: 'non-livree',
                fromQuoteId: document.getElementById('fromQuote').value || null,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            try {
                if (currentEditId) {
                    await db.collection('companies').doc(currentUser.uid).collection('invoices').doc(currentEditId).update(invoiceData);
                    const index = invoices.findIndex(i => i.id === currentEditId);
                    invoices[index] = {...invoices[index], ...invoiceData};
                } else {
                    invoiceData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    const docRef = await db.collection('companies').doc(currentUser.uid).collection('invoices').add(invoiceData);
                    invoices.push({id: docRef.id, ...invoiceData});
                }
                
                closeModal('invoiceModal');
                displayInvoices();
                updateDashboard();
                showAlert('Facture enregistrée avec succès', 'success');
                
            } catch (error) {
                showAlert('Erreur lors de l\'enregistrement', 'error');
                console.error(error);
            }
        });
    }

    const paymentForm = document.getElementById('paymentForm');
    if (paymentForm) {
        paymentForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const paymentData = {
                type: document.getElementById('paymentType').value,
                date: document.getElementById('paymentDate').value,
                partnerId: document.getElementById('paymentPartner').value,
                amount: parseFloat(document.getElementById('paymentAmount').value),
                method: document.getElementById('paymentMethod').value,
                reference: document.getElementById('paymentReference').value,
                invoiceId: document.getElementById('paymentInvoice').value || null,
                notes: document.getElementById('paymentNotes').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            try {
                if (currentEditId) {
                    await db.collection('companies').doc(currentUser.uid).collection('payments').doc(currentEditId).update(paymentData);
                    const index = payments.findIndex(p => p.id === currentEditId);
                    payments[index] = {...payments[index], ...paymentData};
                } else {
                    paymentData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    const docRef = await db.collection('companies').doc(currentUser.uid).collection('payments').add(paymentData);
                    payments.push({id: docRef.id, ...paymentData});
                }
                
                closeModal('paymentModal');
                displayPayments();
                
                // Mettre à jour les statuts des factures
                updateInvoiceStatuses();
                displayInvoices();
                
                showAlert('Paiement enregistré avec succès', 'success');
                
            } catch (error) {
                showAlert('Erreur lors de l\'enregistrement', 'error');
                console.error(error);
            }
        });
    }

    const deliveryForm = document.getElementById('deliveryForm');
    if (deliveryForm) {
        deliveryForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const lines = [];
            document.querySelectorAll('#deliveryLines .line-item').forEach(line => {
                const description = line.querySelector('.line-description').value;
                const quantity = parseFloat(line.querySelector('.line-quantity').value) || 0;
                const reference = line.querySelector('.line-reference').value;
                
                if (description && quantity > 0) {
                    lines.push({description, quantity, reference});
                }
            });
            
            if (lines.length === 0) {
                showAlert('Veuillez ajouter au moins une ligne valide', 'error');
                return;
            }
            
            const deliveryData = {
                number: document.getElementById('deliveryNumber').value,
                date: document.getElementById('deliveryDate').value,
                clientId: document.getElementById('deliveryClient').value,
                status: document.getElementById('deliveryStatus').value,
                lines: lines,
                notes: document.getElementById('deliveryNotes').value,
                invoiceId: document.getElementById('deliveryInvoice').value || null,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            try {
                if (currentEditId) {
                    await db.collection('companies').doc(currentUser.uid).collection('deliveries').doc(currentEditId).update(deliveryData);
                    const index = deliveries.findIndex(d => d.id === currentEditId);
                    deliveries[index] = {...deliveries[index], ...deliveryData};
                } else {
                    deliveryData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    const docRef = await db.collection('companies').doc(currentUser.uid).collection('deliveries').add(deliveryData);
                    deliveries.push({id: docRef.id, ...deliveryData});
                }
                
                closeModal('deliveryModal');
                displayDeliveries();
                
                // Mettre à jour les statuts des factures
                updateInvoiceStatuses();
                displayInvoices();
                
                showAlert('Bon de livraison enregistré avec succès', 'success');
                
            } catch (error) {
                showAlert('Erreur lors de l\'enregistrement', 'error');
                console.error(error);
            }
        });
    }

    const orderForm = document.getElementById('orderForm');
    if (orderForm) {
        orderForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const lines = [];
            document.querySelectorAll('#orderLines .line-item').forEach(line => {
                const description = line.querySelector('.line-description').value;
                const quantity = parseFloat(line.querySelector('.line-quantity').value) || 0;
                const price = parseFloat(line.querySelector('.line-price').value) || 0;
                const total = parseFloat(line.querySelector('.line-total').value) || 0;
                
                if (description && quantity > 0 && price > 0) {
                    lines.push({description, quantity, price, total});
                }
            });
            
            if (lines.length === 0) {
                showAlert('Veuillez ajouter au moins une ligne valide', 'error');
                return;
            }
            
            const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
            const taxRate = companySettings.taxRate / 100;
            const tax = subtotal * taxRate;
            const totalTTC = subtotal + tax;
            
            // Calculer la date de validité
            let validityDate = null;
            const validityType = document.getElementById('orderValidity').value;
            if (validityType === 'custom') {
                validityDate = document.getElementById('orderValidityDate').value;
            } else {
                const days = parseInt(validityType);
                const validity = new Date();
                validity.setDate(validity.getDate() + days);
                validityDate = validity.toISOString().split('T')[0];
            }
            
            const orderData = {
                number: document.getElementById('orderNumber').value,
                date: document.getElementById('orderDate').value,
                supplierId: document.getElementById('orderSupplier').value,
                deliveryDate: document.getElementById('orderDeliveryDate').value,
                validityDate: validityDate,
                lines: lines,
                subtotal: subtotal,
                tax: tax,
                totalTTC: totalTTC,
                status: 'en-attente',
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            try {
                if (currentEditId) {
                    await db.collection('companies').doc(currentUser.uid).collection('orders').doc(currentEditId).update(orderData);
                    const index = orders.findIndex(o => o.id === currentEditId);
                    orders[index] = {...orders[index], ...orderData};
                } else {
                    orderData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    const docRef = await db.collection('companies').doc(currentUser.uid).collection('orders').add(orderData);
                    orders.push({id: docRef.id, ...orderData});
                }
                
                closeModal('orderModal');
                displayOrders();
                showAlert('Bon de commande enregistré avec succès', 'success');
                
            } catch (error) {
                showAlert('Erreur lors de l\'enregistrement', 'error');
                console.error(error);
            }
        });
    }

    const transactionForm = document.getElementById('transactionForm');
    if (transactionForm) {
        transactionForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const quantity = parseFloat(document.getElementById('transactionQuantity').value) || 1;
            const price = parseFloat(document.getElementById('transactionPrice').value);
            const total = quantity * price;
            
            const transactionData = {
                type: document.getElementById('transactionType').value,
                date: document.getElementById('transactionDate').value,
                partnerId: document.getElementById('transactionPartner').value,
                productId: document.getElementById('transactionProduct').value || null,
                quantity: quantity,
                price: price,
                total: total,
                description: document.getElementById('transactionDescription').value,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            try {
                if (currentEditId) {
                    await db.collection('companies').doc(currentUser.uid).collection('transactions').doc(currentEditId).update(transactionData);
                    const index = transactions.findIndex(t => t.id === currentEditId);
                    transactions[index] = {...transactions[index], ...transactionData};
                } else {
                    transactionData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                    const docRef = await db.collection('companies').doc(currentUser.uid).collection('transactions').add(transactionData);
                    transactions.push({id: docRef.id, ...transactionData});
                }
                
                // Mettre à jour le stock si un produit est sélectionné
                if (transactionData.productId) {
                    const product = products.find(p => p.id === transactionData.productId);
                    if (product) {
                        const newStock = transactionData.type === 'achat' ? 
                            product.stock + quantity : product.stock - quantity;
                        
                        await db.collection('companies').doc(currentUser.uid).collection('products').doc(transactionData.productId).update({
                            stock: newStock
                        });
                        
                        product.stock = newStock;
                    }
                }
                
                closeModal('transactionModal');
                displayTransactions();
                displayStock();
                showAlert('Transaction enregistrée avec succès', 'success');
                
            } catch (error) {
                showAlert('Erreur lors de l\'enregistrement', 'error');
                console.error(error);
            }
        });
    }

    // Event listeners pour les calculs automatiques des transactions
    const transactionQuantityField = document.getElementById('transactionQuantity');
    if (transactionQuantityField) {
        transactionQuantityField.addEventListener('input', function() {
            const quantity = parseFloat(this.value) || 0;
            const priceField = document.getElementById('transactionPrice');
            const totalField = document.getElementById('transactionTotal');
            
            if (priceField && totalField) {
                const price = parseFloat(priceField.value) || 0;
                totalField.value = (quantity * price).toFixed(2);
            }
        });
    }

    const transactionPriceField = document.getElementById('transactionPrice');
    if (transactionPriceField) {
        transactionPriceField.addEventListener('input', function() {
            const quantityField = document.getElementById('transactionQuantity');
            const totalField = document.getElementById('transactionTotal');
            
            if (quantityField && totalField) {
                const quantity = parseFloat(quantityField.value) || 1;
                const price = parseFloat(this.value) || 0;
                totalField.value = (quantity * price).toFixed(2);
            }
        });
    }

    // Event listener pour le changement de produit dans les transactions
    const transactionProductField = document.getElementById('transactionProduct');
    if (transactionProductField) {
        transactionProductField.addEventListener('change', function() {
            const productId = this.value;
            const product = products.find(p => p.id === productId);
            const typeField = document.getElementById('transactionType');
            const priceField = document.getElementById('transactionPrice');
            const quantityField = document.getElementById('transactionQuantity');
            const totalField = document.getElementById('transactionTotal');
            
            if (product && typeField && priceField) {
                const type = typeField.value;
                const price = type === 'vente' ? product.sellPrice : product.buyPrice;
                
                if (price) {
                    priceField.value = price;
                    if (quantityField && totalField) {
                        const quantity = parseFloat(quantityField.value) || 1;
                        totalField.value = (quantity * price).toFixed(2);
                    }
                }
            }
        });
    }

    // Event listener pour le changement de type de transaction
    const transactionTypeField = document.getElementById('transactionType');
    if (transactionTypeField) {
        transactionTypeField.addEventListener('change', updateTransactionForm);
    }
});

// Fermeture des modals en cliquant à l'extérieur
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
        currentEditId = null;
    }
}