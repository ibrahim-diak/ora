/**
 * LUMA — Module Conversations
 * Gestion des listes de discussions, participants et indicateurs de lecture
 */

import { Database } from './database.js';

export const ConversationsService = {
  /**
   * Écoute en direct les conversations pour l'utilisateur connecté
   */
  abonnerConversations(userId, onUpdate, onError) {
    return Database.ecouterConversations(userId, onUpdate, onError);
  },

  /**
   * Identifie l'autre participant dans une conversation privée
   */
  getAutreParticipant(conv, currentUserId) {
    if (!conv || !conv.participants) return null;
    const autreUid = conv.participants.find((uid) => uid !== currentUserId);
    if (!autreUid) return null;

    const details = conv.participantDetails?.[autreUid] || {};
    return {
      uid: autreUid,
      nom: details.nom || 'Utilisateur Lumesys',
      email: details.email || '',
      photoUrl: details.photoUrl || '',
    };
  },

  /**
   * Formate la date de manière élégante et concise pour la liste
   */
  formaterDate(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();

    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear();

    if (isYesterday) {
      return 'Hier';
    }

    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
    }

    return date.toLocaleDateString([], { day: 'numeric', month: 'numeric', year: '2-digit' });
  },

  /**
   * Ouvre ou initialise une conversation avec un contact Lumesys
   */
  async demarrerConversation(moi, destinataire) {
    return await Database.creerOuRecupererConversation(moi, destinataire);
  },

  /**
   * Marque la conversation comme lue
   */
  async marquerLue(conversationId, currentUserId) {
    return await Database.marquerConversationCommeLue(conversationId, currentUserId);
  },
};
