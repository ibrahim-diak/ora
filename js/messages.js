/**
 * LUMA — Module Messages Temps Réel
 * Gestion des flux de messages, horodatage, accusés de lecture et rendu
 */

import { Database } from './database.js';

export const MessagesService = {
  /**
   * Écoute en direct les messages de la conversation active
   */
  abonnerMessages(conversationId, onUpdate, onError) {
    return Database.ecouterMessages(conversationId, onUpdate, onError);
  },

  /**
   * Envoie un message texte (avec éventuelle pièce jointe)
   */
  async envoyer(conversationId, currentUser, contenu, pieceJointe = null) {
    if (!contenu || !contenu.trim()) {
      return null;
    }
    return await Database.envoyerMessage(
      conversationId,
      {
        uid: currentUser.uid,
        nom: currentUser.nom || currentUser.displayName || 'Moi',
      },
      contenu,
      pieceJointe
    );
  },

  /**
   * Marque tous les messages non lus d'une conversation comme lus par l'utilisateur
   */
  async marquerCommeLus(conversationId, userId, messages) {
    if (!conversationId || !userId || !messages || messages.length === 0) return;
    const nonLusIds = messages
      .filter((m) => m.expediteurId !== userId && (!m.luPar || !m.luPar.includes(userId)))
      .map((m) => m.id);

    if (nonLusIds.length > 0) {
      await Database.marquerMessagesCommeLus(conversationId, userId, nonLusIds);
    }
  },

  /**
   * Formate l'heure d'un message
   */
  formaterHeure(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },

  /**
   * Formate un séparateur de jour pour l'historique
   */
  formaterJour(timestamp) {
    if (!timestamp) return 'Aujourd\'hui';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();

    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
    if (isToday) return 'Aujourd\'hui';

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();
    if (isYesterday) return 'Hier';

    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  },

  /**
   * Échappement anti-XSS pour sécuriser le contenu des messages
   */
  echapperHtml(texte) {
    const div = document.createElement('div');
    div.textContent = texte;
    return div.innerHTML;
  },
};
