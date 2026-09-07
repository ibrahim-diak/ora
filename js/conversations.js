/**
 * LUMA — Service des conversations
 *
 * Utilise la collection Firestore :
 *
 * chats/{chatId}
 */

import { Database } from './database.js';


export const ConversationsService = {


  /* ==========================================================
     ABONNEMENT AUX CHATS
  ========================================================== */

  abonnerConversations(
    userId,
    onUpdate,
    onError
  ) {

    return Database.ecouterConversations(
      userId,
      onUpdate,
      onError
    );
  },


  /* ==========================================================
     RÉCUPÉRER L'AUTRE PARTICIPANT
  ========================================================== */

  getAutreParticipant(
    conv,
    currentUserId
  ) {

    if (
      !conv ||
      !Array.isArray(
        conv.participants
      )
    ) {

      return null;
    }


    /*
     * Le nouveau système utilise les emails.
     */
    const currentUser =
      Database &&
      null;


    /*
     * On cherche d'abord grâce aux participantDetails.
     */
    const details =
      conv.participantDetails ||
      {};


    const participants =
      conv.participants;


    /*
     * Le currentUserId peut être un UID.
     * On identifie donc l'utilisateur actuel
     * grâce à son email lorsque possible.
     */

    let currentEmail = null;


    try {

      const auth =
        window.firebaseAuthCurrentUser;

      if (
        auth &&
        auth.email
      ) {

        currentEmail =
          auth.email
            .toLowerCase()
            .trim();
      }

    } catch (e) {
      // Aucun problème : fallback ci-dessous.
    }


    /*
     * Chercher l'autre email.
     */
    let autreEmail =
      participants.find(
        (email) =>
          email !== currentEmail
      );


    /*
     * Si currentEmail n'est pas disponible,
     * prendre le deuxième participant.
     */
    if (!autreEmail) {

      autreEmail =
        participants[0];
    }


    if (!autreEmail) {
      return null;
    }


    const autreDetails =
      details[autreEmail] ||
      {};


    return {

      uid:
        autreDetails.uid ||
        '',

      nom:
        autreDetails.nom ||
        autreEmail ||
        'Utilisateur Lumesys',

      email:
        autreDetails.email ||
        autreEmail ||
        '',

      photoUrl:
        autreDetails.photoUrl ||
        ''
    };
  },


  /* ==========================================================
     DÉMARRER UNE CONVERSATION
  ========================================================== */

  async demarrerConversation(
    moi,
    destinataire
  ) {

    return await Database.creerOuRecupererConversation(
      moi,
      destinataire
    );
  },


  /* ==========================================================
     MARQUER LE CHAT COMME LU
  ========================================================== */

  async marquerLue(
    conversationId,
    currentUserId
  ) {

    return await Database.marquerConversationCommeLue(
      conversationId,
      currentUserId
    );
  }
};
