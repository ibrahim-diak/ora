/**
 * LUMA — Module Firebase Storage
 * Préparation pour les photos de profil et pièces jointes multimédias
 */

import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase-config.js';

export const StorageService = {
  /**
   * Vérifie si Firebase Storage est disponible
   */
  isStorageDisponible() {
    return Boolean(storage);
  },

  /**
   * Téléverse un fichier (image de profil ou pièce jointe)
   */
  async televerserFichier(dossier, fichier, onProgression) {
    if (!storage) {
      throw new Error('Firebase Storage n\'est pas encore configuré.');
    }

    // Nom unique avec timestamp et assainissement
    const nomNettoye = fichier.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const chemin = `${dossier}/${Date.now()}_${nomNettoye}`;
    const storageRef = ref(storage, chemin);

    const uploadTask = uploadBytesResumable(storageRef, fichier);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progression = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgression) onProgression(progression);
        },
        (error) => {
          console.error('Erreur téléversement Storage:', error);
          reject(error);
        },
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({
            url: downloadUrl,
            chemin,
            nom: fichier.name,
            taille: fichier.size,
            type: fichier.type,
          });
        }
      );
    });
  },

  /**
   * Convertit une image locale en Data URL pour aperçu instantané
   */
  lireApercuLocal(fichier) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(fichier);
    });
  },
};
