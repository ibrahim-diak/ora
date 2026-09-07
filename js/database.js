/**
 * LUMA — Couche d'accès aux données
 * Firestore
 *
 * Architecture réelle utilisée :
 *
 * chats/{chatId}
 * chats/{chatId}/messages/{messageId}
 *
 * IMPORTANT :
 * - participants = adresses email
 * - expediteurId = UID Firebase
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  limit,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  increment,
} from 'firebase/firestore';

import { getAuth } from 'firebase/auth';

import {
  db,
  handleFirestoreError
} from './firebase-config.js';


/* ============================================================
   ROUTEUR FIRESTORE
============================================================ */

class DatabaseRouter {

  constructor() {
    this.primaryType = 'firestore';
    this.secondaryType = null;
  }

  getFirestore() {

    if (!db) {
      throw new Error(
        'Firestore non initialisé. Vérifiez la configuration Firebase.'
      );
    }

    return db;
  }
}

const router = new DatabaseRouter();


/* ============================================================
   UTILITAIRES
============================================================ */

/**
 * Retourne l'utilisateur Firebase actuellement connecté.
 */
function getCurrentFirebaseUser() {

  try {

    const auth = getAuth();

    return auth.currentUser || null;

  } catch (error) {

    console.error(
      'Impossible de récupérer l’utilisateur Firebase :',
      error
    );

    return null;
  }
}


/**
 * Retourne l'email de l'utilisateur connecté.
 */
function getCurrentUserEmail() {

  const user = getCurrentFirebaseUser();

  if (!user || !user.email) {
    return null;
  }

  return user.email.toLowerCase().trim();
}


/**
 * Normalise une adresse email.
 */
function normalizeEmail(email) {

  if (!email) return '';

  return String(email)
    .toLowerCase()
    .trim();
}


/**
 * Crée un identifiant de chat déterministe.
 *
 * Exemple :
 *
 * emailA + emailB
 *       ↓
 * tri alphabétique
 *       ↓
 * emailA_emailB
 */
function creerChatId(emailA, emailB) {

  const emails = [
    normalizeEmail(emailA),
    normalizeEmail(emailB)
  ]
    .filter(Boolean)
    .sort();

  return emails.join('_');
}


/* ============================================================
   DATABASE
============================================================ */

export const Database = {


  /* ==========================================================
     UTILISATEUR PAR UID
  ========================================================== */

  async getUtilisateurByUid(uid, email = null) {

    const firestore = router.getFirestore();

    try {

      /*
       * Première recherche par email.
       */
      if (email) {

        const cleanEmail = normalizeEmail(email);

        const userRefEmail = doc(
          firestore,
          'utilisateurs',
          cleanEmail
        );

        const snapEmail = await getDoc(userRefEmail);

        if (snapEmail.exists()) {

          return {
            id: snapEmail.id,
            ...snapEmail.data()
          };
        }
      }


      /*
       * Deuxième recherche par UID.
       */
      if (uid) {

        const userRefUid = doc(
          firestore,
          'utilisateurs',
          uid
        );

        const snapUid = await getDoc(userRefUid);

        if (snapUid.exists()) {

          return {
            id: snapUid.id,
            ...snapUid.data()
          };
        }
      }

      return null;

    } catch (error) {

      handleFirestoreError(
        error,
        'get',
        `utilisateurs/${email || uid}`
      );

      return null;
    }
  },


  /* ==========================================================
     UTILISATEUR PAR EMAIL
  ========================================================== */

  async getUtilisateurByEmail(email) {

    if (!email) return null;

    const cleanEmail = normalizeEmail(email);

    const firestore = router.getFirestore();

    try {

      /*
       * Cas principal :
       * document ID = email
       */
      const directDoc = await getDoc(
        doc(
          firestore,
          'utilisateurs',
          cleanEmail
        )
      );

      if (directDoc.exists()) {

        return {
          id: directDoc.id,
          ...directDoc.data()
        };
      }


      /*
       * Compatibilité avec d'anciens documents.
       */
      const q = query(
        collection(
          firestore,
          'utilisateurs'
        ),
        where(
          'email',
          '==',
          cleanEmail
        ),
        limit(1)
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {

        const docSnap = querySnapshot.docs[0];

        return {
          id: docSnap.id,
          ...docSnap.data()
        };
      }

      return null;

    } catch (error) {

      handleFirestoreError(
        error,
        'list',
        'utilisateurs'
      );

      return null;
    }
  },


  /* ==========================================================
     ENREGISTRER / METTRE À JOUR UTILISATEUR
  ========================================================== */

  async enregistrerOuMettreAJourUtilisateur(userData) {

    if (
      !userData ||
      (!userData.uid && !userData.email)
    ) {

      throw new Error(
        'Identifiant utilisateur (UID ou Email) manquant'
      );
    }

    const firestore = router.getFirestore();

    const userEmail = normalizeEmail(
      userData.email
    );

    const docKey =
      userEmail ||
      userData.uid;

    const userRef = doc(
      firestore,
      'utilisateurs',
      docKey
    );

    try {

      const snapshot = await getDoc(userRef);

      const existingData =
        snapshot.exists()
          ? snapshot.data()
          : {};

      const dataToSave = {

        ...existingData,

        uid:
          userData.uid ||
          existingData.uid ||
          '',

        nom:
          userData.nom ||
          existingData.nom ||
          'Utilisateur Lumesys',

        email:
          userEmail ||
          existingData.email ||
          '',

        photo:
          userData.photoUrl ||
          userData.photo ||
          existingData.photo ||
          '',

        photoUrl:
          userData.photoUrl ||
          userData.photo ||
          existingData.photoUrl ||
          '',

        statut:
          userData.statut ||
          existingData.statut ||
          'online',

        derniereConnexion:
          serverTimestamp(),

        dernierVu:
          serverTimestamp()
      };


      if (userData.bio !== undefined) {

        dataToSave.bio =
          userData.bio;
      }


      if (
        userData.numero ||
        existingData.numero
      ) {

        dataToSave.numero =
          userData.numero ||
          existingData.numero;
      }


      if (
        userData.sexe ||
        existingData.sexe
      ) {

        dataToSave.sexe =
          userData.sexe ||
          existingData.sexe;
      }


      await setDoc(
        userRef,
        dataToSave,
        { merge: true }
      );


      /*
       * Synchronisation du profil public.
       *
       * Cette opération reste facultative.
       */
      if (userEmail) {

        try {

          const publicProfileRef =
            doc(
              firestore,
              'public_profiles',
              userEmail
            );

          const splitName =
            (
              dataToSave.nom ||
              ''
            )
              .trim()
              .split(/\s+/);


          await setDoc(
            publicProfileRef,
            {

              prenom:
                splitName[0] || '',

              nom:
                splitName
                  .slice(1)
                  .join(' ') ||
                splitName[0] ||
                '',

              sexe:
                dataToSave.sexe || '',

              photo:
                dataToSave.photo ||
                dataToSave.photoUrl ||
                '',

              telephone:
                dataToSave.numero ||
                '',

              email:
                userEmail,

              updatedAt:
                serverTimestamp()
            },

            { merge: true }
          );

        } catch (pubErr) {

          console.warn(
            'Note : synchronisation public_profiles facultative :',
            pubErr
          );
        }
      }


      return {
        id: docKey,
        ...dataToSave
      };

    } catch (error) {

      handleFirestoreError(
        error,
        'write',
        `utilisateurs/${docKey}`
      );

      return null;
    }
  },


  /* ==========================================================
     RECHERCHE UTILISATEURS
  ========================================================== */

  async rechercherUtilisateurs(
    terme,
    currentUserId,
    limitCount = 25
  ) {

    if (
      !terme ||
      terme.trim().length === 0
    ) {

      return this.listerUtilisateursRecents(
        currentUserId,
        limitCount
      );
    }

    const firestore =
      router.getFirestore();

    const searchVal =
      terme.trim();

    const searchValLower =
      searchVal.toLowerCase();

    const currentEmail =
      getCurrentUserEmail();


    try {

      const qPublic = query(
        collection(
          firestore,
          'public_profiles'
        ),
        limit(limitCount)
      );

      const qUsers = query(
        collection(
          firestore,
          'utilisateurs'
        ),
        limit(limitCount)
      );


      const [
        snapPublic,
        snapUsers
      ] = await Promise.all([

        getDocs(qPublic)
          .catch(() => ({ docs: [] })),

        getDocs(qUsers)
          .catch(() => ({ docs: [] }))
      ]);


      const map =
        new Map();


      /* ------------------------------------------------------
         PROFILS PUBLICS
      ------------------------------------------------------ */

      snapPublic.docs.forEach((d) => {

        const data =
          d.data();

        const email =
          normalizeEmail(
            d.id.includes('@')
              ? d.id
              : data.email || ''
          );

        const fullName =
          `${data.prenom || ''} ${data.nom || ''}`
            .trim() ||
          email;


        if (

          (
            fullName
              .toLowerCase()
              .includes(searchValLower)
          )

          ||

          (
            email
              .toLowerCase()
              .includes(searchValLower)
          )

        ) {

          /*
           * Ne pas afficher l'utilisateur connecté.
           */
          if (
            email &&
            email !== currentEmail
          ) {

            map.set(
              email,
              {

                id: d.id,

                uid:
                  data.uid ||
                  '',

                nom:
                  fullName,

                email:
                  email,

                photoUrl:
                  data.photo ||
                  '',

                statut:
                  'online'
              }
            );
          }
        }
      });


      /* ------------------------------------------------------
         UTILISATEURS
      ------------------------------------------------------ */

      snapUsers.docs.forEach((d) => {

        const data =
          d.data();

        const email =
          normalizeEmail(
            data.email ||
            (
              d.id.includes('@')
                ? d.id
                : ''
            )
          );

        const name =
          data.nom ||
          email ||
          'Utilisateur';


        if (

          (
            name
              .toLowerCase()
              .includes(searchValLower)
          )

          ||

          (
            email
              .toLowerCase()
              .includes(searchValLower)
          )

        ) {

          if (
            email &&
            email !== currentEmail
          ) {

            if (!map.has(email)) {

              map.set(
                email,
                {

                  id: d.id,

                  uid:
                    data.uid ||
                    '',

                  nom:
                    name,

                  email:
                    email,

                  photoUrl:
                    data.photoUrl ||
                    data.photo ||
                    '',

                  statut:
                    data.statut ||
                    'online'
                }
              );
            }
          }
        }
      });


      return Array.from(
        map.values()
      );

    } catch (error) {

      handleFirestoreError(
        error,
        'list',
        'utilisateurs'
      );

      return [];
    }
  },


  /* ==========================================================
     UTILISATEURS RECENTS
  ========================================================== */

  async listerUtilisateursRecents(
    currentUserId,
    limitCount = 25
  ) {

    const firestore =
      router.getFirestore();

    const currentEmail =
      getCurrentUserEmail();


    try {

      const [
        snapPublic,
        snapUsers
      ] = await Promise.all([

        getDocs(
          query(
            collection(
              firestore,
              'public_profiles'
            ),
            limit(limitCount)
          )
        )
        .catch(() => ({ docs: [] })),

        getDocs(
          query(
            collection(
              firestore,
              'utilisateurs'
            ),
            limit(limitCount)
          )
        )
        .catch(() => ({ docs: [] }))
      ]);


      const map =
        new Map();


      /* ------------------------------------------------------
         PROFILS PUBLICS
      ------------------------------------------------------ */

      snapPublic.docs.forEach((d) => {

        const data =
          d.data();

        const email =
          normalizeEmail(
            d.id.includes('@')
              ? d.id
              : data.email || ''
          );

        const fullName =
          `${data.prenom || ''} ${data.nom || ''}`
            .trim() ||
          email;


        if (
          email &&
          email !== currentEmail
        ) {

          map.set(
            email,
            {

              id: d.id,

              uid:
                data.uid ||
                '',

              nom:
                fullName,

              email:
                email,

              photoUrl:
                data.photo ||
                '',

              statut:
                'online'
            }
          );
        }
      });


      /* ------------------------------------------------------
         UTILISATEURS
      ------------------------------------------------------ */

      snapUsers.docs.forEach((d) => {

        const data =
          d.data();

        const email =
          normalizeEmail(
            data.email ||
            (
              d.id.includes('@')
                ? d.id
                : ''
            )
          );

        const name =
          data.nom ||
          email ||
          'Utilisateur';


        if (
          email &&
          email !== currentEmail &&
          !map.has(email)
        ) {

          map.set(
            email,
            {

              id: d.id,

              uid:
                data.uid ||
                '',

              nom:
                name,

              email:
                email,

              photoUrl:
                data.photoUrl ||
                data.photo ||
                '',

              statut:
                data.statut ||
                'online'
            }
          );
        }
      });


      return Array.from(
        map.values()
      );

    } catch (error) {

      handleFirestoreError(
        error,
        'list',
        'utilisateurs'
      );

      return [];
    }
  },


  /* ==========================================================
     ÉCOUTER LES CHATS EN TEMPS RÉEL
     
     IMPORTANT :
     participants contient les EMAILS.
  ========================================================== */

  ecouterConversations(
    userId,
    onUpdate,
    onError
  ) {

    const currentEmail =
      getCurrentUserEmail();


    if (!currentEmail) {

      console.error(
        'Impossible d’écouter les chats : email utilisateur absent.'
      );

      return () => {};
    }


    const firestore =
      router.getFirestore();


    /*
     * NOUVELLE REQUÊTE :
     *
     * chats
     * participants array-contains email
     */
    const q =
      query(
        collection(
          firestore,
          'chats'
        ),
        where(
          'participants',
          'array-contains',
          currentEmail
        )
      );


    return onSnapshot(

      q,

      (snapshot) => {

        const conversations =
          [];


        snapshot.forEach((d) => {

          conversations.push({
            id: d.id,
            ...d.data()
          });
        });


        /*
         * Tri côté JavaScript.
         */
        conversations.sort(
          (a, b) => {

            const dateA =
              a.updatedAt?.toMillis
                ? a.updatedAt.toMillis()
                : (
                    a.createdAt?.toMillis
                      ? a.createdAt.toMillis()
                      : 0
                  );

            const dateB =
              b.updatedAt?.toMillis
                ? b.updatedAt.toMillis()
                : (
                    b.createdAt?.toMillis
                      ? b.createdAt.toMillis()
                      : 0
                  );

            return dateB - dateA;
          }
        );


        onUpdate(
          conversations
        );
      },


      (error) => {

        console.error(
          'Erreur écoute chats :',
          error
        );

        if (onError) {
          onError(error);
        }

        handleFirestoreError(
          error,
          'list',
          'chats'
        );
      }
    );
  },


  /* ==========================================================
     TROUVER UNE CONVERSATION DIRECTE
  ========================================================== */

  async trouverConversationDirecte(
    userAEmail,
    userBEmail
  ) {

    const emailA =
      normalizeEmail(userAEmail);

    const emailB =
      normalizeEmail(userBEmail);


    if (
      !emailA ||
      !emailB
    ) {

      return null;
    }


    const firestore =
      router.getFirestore();


    try {

      /*
       * On cherche tous les chats de A.
       */
      const q =
        query(
          collection(
            firestore,
            'chats'
          ),
          where(
            'participants',
            'array-contains',
            emailA
          )
        );


      const snapshot =
        await getDocs(q);


      /*
       * On recherche le chat contenant également B.
       */
      for (
        const d of snapshot.docs
      ) {

        const data =
          d.data();

        const participants =
          Array.isArray(
            data.participants
          )
            ? data.participants.map(
                normalizeEmail
              )
            : [];


        if (

          participants.length === 2 &&

          participants.includes(emailA) &&

          participants.includes(emailB)

        ) {

          return {
            id: d.id,
            ...data
          };
        }
      }


      return null;

    } catch (error) {

      handleFirestoreError(
        error,
        'list',
        'chats'
      );

      return null;
    }
  },


  /* ==========================================================
     CRÉER OU RÉCUPÉRER UN CHAT
  ========================================================== */

  async creerOuRecupererConversation(
    userA,
    userB
  ) {

    /*
     * On utilise les emails pour le système de chats.
     */
    const emailA =
      normalizeEmail(
        userA.email
      );

    const emailB =
      normalizeEmail(
        userB.email
      );


    if (
      !emailA ||
      !emailB
    ) {

      throw new Error(
        'Les deux utilisateurs doivent posséder une adresse email.'
      );
    }


    /*
     * Vérifier si le chat existe déjà.
     */
    const existante =
      await this.trouverConversationDirecte(
        emailA,
        emailB
      );


    if (existante) {

      /*
       * Ajouter éventuellement les informations
       * manquantes pour l'interface.
       */
      if (!existante.participantDetails) {

        existante.participantDetails = {

          [emailA]: {

            nom:
              userA.nom ||
              'Utilisateur',

            email:
              emailA,

            photoUrl:
              userA.photoUrl ||
              ''
          },

          [emailB]: {

            nom:
              userB.nom ||
              'Utilisateur',

            email:
              emailB,

            photoUrl:
              userB.photoUrl ||
              ''
          }
        };
      }


      return existante;
    }


    const firestore =
      router.getFirestore();


    /*
     * ID déterministe.
     *
     * Exemple :
     * emailA_emailB
     */
    const chatId =
      creerChatId(
        emailA,
        emailB
      );


    const chatRef =
      doc(
        firestore,
        'chats',
        chatId
      );


    const nouveauChat = {

      participants: [
        emailA,
        emailB
      ],

      participantDetails: {

        [emailA]: {

          nom:
            userA.nom ||
            'Utilisateur',

          email:
            emailA,

          photoUrl:
            userA.photoUrl ||
            ''
        },

        [emailB]: {

          nom:
            userB.nom ||
            'Utilisateur',

          email:
            emailB,

          photoUrl:
            userB.photoUrl ||
            ''
        }
      },

      dernierMessage:
        '',

      dernierMessageDate:
        null,

      dernierMessageExpediteur:
        '',

      nonLus: {

        [emailA]: 0,

        [emailB]: 0
      },

      createdAt:
        serverTimestamp(),

      updatedAt:
        serverTimestamp()
    };


    try {

      await setDoc(
        chatRef,
        nouveauChat,
        { merge: true }
      );


      return {
        id: chatId,
        ...nouveauChat
      };

    } catch (error) {

      handleFirestoreError(
        error,
        'write',
        `chats/${chatId}`
      );

      return null;
    }
  },


  /* ==========================================================
     MARQUER UN CHAT COMME LU
  ========================================================== */

  async marquerConversationCommeLue(
    conversationId,
    userId
  ) {

    if (!conversationId) {
      return;
    }


    const email =
      getCurrentUserEmail();


    if (!email) {
      return;
    }


    const firestore =
      router.getFirestore();


    const chatRef =
      doc(
        firestore,
        'chats',
        conversationId
      );


    try {

      await updateDoc(
        chatRef,
        {
          [`nonLus.${email}`]: 0
        }
      );

    } catch (error) {

      console.warn(
        'Erreur mise à jour statut de lecture :',
        error
      );
    }
  },


  /* ==========================================================
     ÉCOUTER LES MESSAGES
  ========================================================== */

  ecouterMessages(
    conversationId,
    onUpdate,
    onError
  ) {

    if (!conversationId) {
      return () => {};
    }


    const firestore =
      router.getFirestore();


    const messagesRef =
      collection(
        firestore,
        'chats',
        conversationId,
        'messages'
      );


    const q =
      query(
        messagesRef,
        limit(150)
      );


    return onSnapshot(

      q,

      (snapshot) => {

        const messages =
          [];


        snapshot.forEach((d) => {

          messages.push({
            id: d.id,
            ...d.data()
          });
        });


        /*
         * Tri par date d'envoi.
         */
        messages.sort(
          (a, b) => {

            const dateA =
              a.dateEnvoi?.toMillis
                ? a.dateEnvoi.toMillis()
                : 0;

            const dateB =
              b.dateEnvoi?.toMillis
                ? b.dateEnvoi.toMillis()
                : 0;

            return dateA - dateB;
          }
        );


        onUpdate(
          messages
        );
      },


      (error) => {

        console.error(
          'Erreur écoute messages :',
          error
        );

        if (onError) {
          onError(error);
        }

        handleFirestoreError(
          error,
          'get',
          `chats/${conversationId}/messages`
        );
      }
    );
  },


  /* ==========================================================
     ENVOYER UN MESSAGE
  ========================================================== */

  async envoyerMessage(
    conversationId,
    expediteur,
    contenu,
    pieceJointe = null
  ) {

    if (
      !conversationId ||
      !expediteur ||
      !contenu ||
      !contenu.trim()
    ) {

      throw new Error(
        'Paramètres de message invalides'
      );
    }


    const firestore =
      router.getFirestore();


    const convRef =
      doc(
        firestore,
        'chats',
        conversationId
      );


    const messagesRef =
      collection(
        firestore,
        'chats',
        conversationId,
        'messages'
      );


    const cleanContenu =
      contenu
        .trim()
        .slice(0, 5000);


    const messagePayload = {

      conversationId:

        conversationId,

      /*
       * IMPORTANT :
       * Les messages utilisent toujours le UID Firebase
       * pour identifier l'expéditeur.
       */
      expediteurId:
        expediteur.uid,

      expediteurNom:
        expediteur.nom ||
        'Utilisateur',

      contenu:
        cleanContenu,

      dateEnvoi:
        serverTimestamp(),

      luPar: [
        expediteur.uid
      ]
    };


    if (pieceJointe) {

      messagePayload.pieceJointe =
        pieceJointe;
    }


    try {

      /*
       * Ajouter le message.
       */
      const docAdded =
        await addDoc(
          messagesRef,
          messagePayload
        );


      /*
       * Récupérer le chat.
       */
      const convSnap =
        await getDoc(
          convRef
        );


      if (convSnap.exists()) {

        const convData =
          convSnap.data();


        const updatePayload = {

          dernierMessage:
            cleanContenu,

          dernierMessageDate:
            serverTimestamp(),

          dernierMessageExpediteur:
            expediteur.uid,

          updatedAt:
            serverTimestamp()
        };


        /*
         * Les non-lus sont maintenant indexés
         * par EMAIL.
         */
        if (
          Array.isArray(
            convData.participants
          )
        ) {

          const expediteurEmail =
            normalizeEmail(
              expediteur.email
            );


          convData.participants.forEach(
            (participantEmail) => {

              const email =
                normalizeEmail(
                  participantEmail
                );


              if (
                email &&
                email !== expediteurEmail
              ) {

                updatePayload[
                  `nonLus.${email}`
                ] =
                  increment(1);
              }
            }
          );
        }


        await updateDoc(
          convRef,
          updatePayload
        );
      }


      return {
        id:
          docAdded.id,

        ...messagePayload
      };

    } catch (error) {

      handleFirestoreError(
        error,
        'write',
        `chats/${conversationId}/messages`
      );

      return null;
    }
  },


  /* ==========================================================
     MARQUER LES MESSAGES COMME LUS
  ========================================================== */

  async marquerMessagesCommeLus(
    conversationId,
    userId,
    messageIds
  ) {

    if (
      !conversationId ||
      !messageIds ||
      messageIds.length === 0
    ) {

      return;
    }


    const firestore =
      router.getFirestore();


    const currentUser =
      getCurrentFirebaseUser();


    if (!currentUser) {
      return;
    }


    const promises =
      messageIds.map(
        (msgId) => {

          const msgRef =
            doc(
              firestore,
              'chats',
              conversationId,
              'messages',
              msgId
            );


          return updateDoc(
            msgRef,
            {
              luPar:
                arrayUnion(
                  currentUser.uid
                )
            }
          )
          .catch(
            (error) => {

              console.warn(
                'Impossible de marquer le message comme lu :',
                msgId,
                error
              );
            }
          );
        }
      );


    await Promise.all(
      promises
    );


    await this.marquerConversationCommeLue(
      conversationId,
      userId
    );
  }
};
