/**
 * LUMA - Configuration & Initialisation Firebase
 * Écosystème Lumesys
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Configuration par défaut extraite de l'infrastructure Lumesys / Lumina existante
const DEFAULT_LUMESYS_CONFIG = {
  apiKey: "AIzaSyAClwRQe3g4Cg9CAsn28l_sAihwlMQtGUI",
  authDomain: "lumina-analytics.firebaseapp.com",
  projectId: "lumina-analytics",
  storageBucket: "lumina-analytics.appspot.com",
  messagingSenderId: "239329398532",
  appId: "1:239329398532:web:2f68b196df0c4e6400ca51",
  measurementId: "G-J7LLPRXLJH"
};

// Clé de stockage local pour la configuration personnalisée Lumesys
const STORAGE_CONFIG_KEY = 'luma_lumesys_firebase_config';

// Configuration par défaut ou découverte automatique
export function getStoredFirebaseConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Erreur lors de la lecture de la configuration locale:', e);
  }

  // Vérifier si une configuration globale a été injectée
  if (window.__LUMESYS_FIREBASE_CONFIG__) {
    return window.__LUMESYS_FIREBASE_CONFIG__;
  }

  // Utiliser la configuration réelle de Lumesys / Lumina
  return DEFAULT_LUMESYS_CONFIG;
}

export function saveFirebaseConfig(config) {
  try {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch (e) {
    console.error('Impossible de sauvegarder la configuration Firebase:', e);
    return false;
  }
}

export function clearFirebaseConfig() {
  try {
    localStorage.removeItem(STORAGE_CONFIG_KEY);
  } catch (e) {
    console.error('Erreur clear config:', e);
  }
}

// Initialisation de Firebase
let appInstance = null;
let authInstance = null;
let dbInstance = null;
let storageInstance = null;
let initError = null;

export function initFirebase(customConfig = null) {
  const config = customConfig || getStoredFirebaseConfig();

  if (!config || !config.apiKey || !config.projectId) {
    initError = new Error('CONFIGURATION_MANQUANTE');
    return { app: null, auth: null, db: null, storage: null, error: initError };
  }

  try {
    if (getApps().length > 0) {
      appInstance = getApp();
    } else {
      appInstance = initializeApp(config);
    }

    authInstance = getAuth(appInstance);
    dbInstance = getFirestore(appInstance);
    try {
      storageInstance = getStorage(appInstance);
    } catch (stErr) {
      console.warn('Firebase Storage non disponible ou non configuré:', stErr);
    }
    initError = null;
    return { app: appInstance, auth: authInstance, db: dbInstance, storage: storageInstance, error: null };
  } catch (err) {
    console.error('Échec initialisation Firebase:', err);
    initError = err;
    return { app: null, auth: null, db: null, storage: null, error: err };
  }
}

// Initialisation immédiate au chargement du module
const { app, auth, db, storage, error } = initFirebase();

export { app, auth, db, storage, initError };

/**
 * Gestionnaire d'erreurs normalisé conforme aux directives de sécurité Firestore
 */
export function handleFirestoreError(error, operationType, path = null) {
  const currentAuth = authInstance || (getApps().length > 0 ? getAuth(getApp()) : null);
  const currentUser = currentAuth?.currentUser;

  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: currentUser?.uid || null,
      email: currentUser?.email || null,
      emailVerified: currentUser?.emailVerified || null,
      isAnonymous: currentUser?.isAnonymous || null,
      providerInfo: currentUser?.providerData?.map((p) => ({
        providerId: p.providerId,
        email: p.email,
      })) || [],
    },
  };

  console.error('Firestore Security / Operation Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Teste la connectivité avec le serveur Firestore
 */
export async function testConnection() {
  if (!dbInstance) {
    console.warn('Firestore n\'est pas encore initialisé.');
    return false;
  }
  try {
    await getDocFromServer(doc(dbInstance, 'test', 'connection'));
    console.log('Connectivité Firestore vérifiée avec succès.');
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Veuillez vérifier votre configuration Firebase (client hors ligne).');
    }
    return false;
  }
}
