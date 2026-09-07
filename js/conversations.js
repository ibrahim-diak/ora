/**
 * LUMA — Service des conversations
 *
 * Utilise la collection Firestore :
 *
 * chats/{chatId}
 * chats/{chatId}/messages/{messageId}
 *
 * IMPORTANT :
 * - Les participants des chats sont des EMAILS.
 * - Les messages utilisent le UID Firebase pour expediteurId.
 */

import { Database } from './database.js';


export const ConversationsService = {

  /* ==========================================================
     ABONNEMENT AUX CONVERSATIONS
  ========================================================== */

  abonnerConversations(userId, onUpdate, onError) {

    return Database.ecouterConversations(
      userId,
      onUpdate,
      onError
    );
  },


  /* ==========================================================
     RÉCUPÉRER L'AUTRE PARTICIPANT
  ========================================================== */

  getAutreParticipant(conv, currentUser) {

    if (
      !conv ||
      !Array.isArray(conv.participants)
    ) {
      return null;
    }

    const currentEmail = (
      currentUser?.email ||
      ''
    )
      .toLowerCase()
      .trim();


    /*
     * Les participants sont stockés sous forme d'emails.
     */
    const participants = conv.participants
      .map((email) => String(email).toLowerCase().trim());


    /*
     * Chercher l'email de l'autre participant.
     */
    const autreEmail = participants.find(
      (email) => email !== currentEmail
    );


    if (!autreEmail) {
      return null;
    }


    /*
     * Récupérer les détails du participant.
     */
    const details =
      conv.participantDetails?.[autreEmail] || {};


    return {

      uid:
        details.uid ||
        '',

      nom:
        details.nom ||
        autreEmail ||
        'Utilisateur Lumesys',

      email:
        details.email ||
        autreEmail ||
        '',

      photoUrl:
        details.photoUrl ||
        details.photo ||
        '',

      statut:
        details.statut ||
        'offline'
    };
  },


  /* ==========================================================
     DÉMARRER UNE CONVERSATION
  ========================================================== */

  async demarrerConversation(moi, destinataire) {

    if (!moi || !destinataire) {

      throw new Error(
        'Utilisateur source ou destinataire manquant.'
      );
    }


    if (!moi.email) {

      throw new Error(
        'L’utilisateur connecté ne possède pas d’adresse email.'
      );
    }


    if (!destinataire.email) {

      throw new Error(
        'Le destinataire ne possède pas d’adresse email.'
      );
    }


    return await Database.creerOuRecupererConversation(
      moi,
      destinataire
    );
  },


  /* ==========================================================
     MARQUER UNE CONVERSATION COMME LUE
  ========================================================== */

  async marquerLue(
    conversationId,
    currentUserId
  ) {

    if (!conversationId) {
      return;
    }


    return await Database.marquerConversationCommeLue(
      conversationId,
      currentUserId
    );
  }
};

