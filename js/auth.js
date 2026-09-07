/**
 * LUMA — Module d'authentification Firebase
 * Gère les sessions utilisateurs et synchronise avec la collection `utilisateurs` Lumesys
 */

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase-config.js';
import { Database } from './database.js';

let currentUser = null;
let currentProfile = null;
const authCallbacks = [];

export const AuthService = {
  /**
   * Initialise l'écouteur de session Firebase Auth
   */
  init(onUserChange) {
    if (onUserChange) {
      authCallbacks.push(onUserChange);
    }

    if (!auth) {
      console.warn('Firebase Auth non initialisé');
      return;
    }

    onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      if (user) {
        try {
          // 1. Chercher d'abord le profil par UID dans la collection `utilisateurs`
          let profile = await Database.getUtilisateurByUid(user.uid);

          // 2. Si non trouvé, vérifier par email pour préserver un compte préexistant de Lumesys
          if (!profile && user.email) {
            const existingByEmail = await Database.getUtilisateurByEmail(user.email);
            if (existingByEmail) {
              // Lier le profil existant de Lumesys avec ce nouvel UID Firebase Auth
              profile = await Database.enregistrerOuMettreAJourUtilisateur({
                ...existingByEmail,
                uid: user.uid,
                statut: 'online',
              });
            }
          }

          // 3. Si aucun document n'existait, créer le profil utilisateur initial
          if (!profile) {
            profile = await Database.enregistrerOuMettreAJourUtilisateur({
              uid: user.uid,
              nom: user.displayName || user.email?.split('@')[0] || 'Utilisateur Lumesys',
              email: user.email || '',
              photoUrl: user.photoURL || '',
              statut: 'online',
            });
          } else {
            // Mettre à jour le statut en ligne
            await Database.enregistrerOuMettreAJourUtilisateur({
              ...profile,
              uid: user.uid,
              statut: 'online',
            });
          }

          currentProfile = profile;
        } catch (err) {
          console.error('Erreur synchronisation profil utilisateur Lumesys:', err);
          currentProfile = {
            uid: user.uid,
            nom: user.displayName || user.email || 'Utilisateur',
            email: user.email || '',
            photoUrl: user.photoURL || '',
            statut: 'online',
          };
        }
      } else {
        currentProfile = null;
      }

      // Notifier tous les écouteurs
      authCallbacks.forEach((cb) => cb(currentUser, currentProfile));
    });
  },

  getCurrentUser() {
    return currentUser;
  },

  getCurrentProfile() {
    return currentProfile;
  },

  /**
   * Connexion par email et mot de passe
   */
  async connexionEmail(email, password) {
    if (!auth) throw new Error('Firebase Auth non configuré');
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    return cred.user;
  },

  /**
   * Création de compte par email et mot de passe
   */
  async inscriptionEmail(email, password, nom) {
    if (!auth) throw new Error('Firebase Auth non configuré');
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    // Enregistrer immédiatement dans la collection `utilisateurs`
    await Database.enregistrerOuMettreAJourUtilisateur({
      uid: cred.user.uid,
      nom: nom.trim() || email.split('@')[0],
      email: email.trim(),
      statut: 'online',
    });
    return cred.user;
  },

  /**
   * Connexion avec Google via popup (adapté aux environnements iframe)
   */
  async connexionGoogle() {
    if (!auth) throw new Error('Firebase Auth non configuré');
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    return cred.user;
  },

  /**
   * Déconnexion sécurisée
   */
  async deconnexion() {
    if (!auth) return;
    if (currentUser?.uid) {
      try {
        await Database.enregistrerOuMettreAJourUtilisateur({
          uid: currentUser.uid,
          statut: 'offline',
        });
      } catch (e) {
        console.warn('Impossible de mettre à jour le statut hors ligne:', e);
      }
    }
    await signOut(auth);
    currentUser = null;
    currentProfile = null;
  },
};
