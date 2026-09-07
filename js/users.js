/**
 * LUMA — Module Utilisateurs
 * Gestion de l'annuaire Lumesys, recherche optimisée et profils
 */

import { Database } from './database.js';

export const UsersService = {
  /**
   * Génère une couleur et des initiales élégantes pour un avatar sans photo
   */
  getAvatarProps(nom = '', email = '') {
    const displayName = nom || email || '?';
    const initials = displayName
      .split(' ')
      .filter((w) => w.length > 0)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || displayName.slice(0, 2).toUpperCase();

    // Palette de teintes élégantes et lisibles
    const colors = [
      '#0f766e', '#0369a1', '#4338ca', '#6d28d9',
      '#be185d', '#b45309', '#047857', '#334155'
    ];

    let hash = 0;
    for (let i = 0; i < displayName.length; i++) {
      hash = displayName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorIndex = Math.abs(hash) % colors.length;

    return {
      initials,
      bgColor: colors[colorIndex],
    };
  },

  /**
   * Effectue une recherche sécurisée parmi les utilisateurs Lumesys
   */
  async rechercher(terme, currentUserId) {
    try {
      return await Database.rechercherUtilisateurs(terme, currentUserId);
    } catch (err) {
      console.error('Erreur recherche utilisateurs:', err);
      return [];
    }
  },

  /**
   * Met à jour les informations du profil utilisateur
   */
  async mettreAJourProfil(uid, modifications) {
    return await Database.enregistrerOuMettreAJourUtilisateur({
      uid,
      ...modifications,
    });
  },

  /**
   * Formate le statut d'un utilisateur pour l'affichage
   */
  formaterStatut(statut) {
    switch (statut) {
      case 'online':
        return { label: 'En ligne', class: 'status-online' };
      case 'away':
        return { label: 'Absent', class: 'status-away' };
      case 'offline':
      default:
        return { label: 'Hors ligne', class: 'status-offline' };
    }
  },
};
