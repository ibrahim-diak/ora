/**
 * LUMA — Couche d'accès aux données (DAL)
 * Centralise toutes les opérations de base de données (Firestore / Multi-base évolutif)
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
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  increment,
} from 'firebase/firestore';
import { db, handleFirestoreError } from './firebase-config.js';

/**
 * Routeur de base de données : Permet d'étendre ultérieurement vers
 * une base de données secondaire sans impacter les services ni l'interface.
 */
class DatabaseRouter {
  constructor() {
    this.primaryType = 'firestore';
    this.secondaryType = null; // Prêt pour une base secondaire si nécessaire
  }

  getFirestore() {
    if (!db) {
      throw new Error('Firestore non initialisé. Veuillez vérifier la configuration Firebase.');
    }
    return db;
  }
}

const router = new DatabaseRouter();

export const Database = {
  /**
   * ==========================================
   * 1. GESTION DES UTILISATEURS (Collection `utilisateurs`)
   * Source de vérité existante de l'écosystème Lumesys
   * ==========================================
   */

  /**
   * Récupère le profil d'un utilisateur par son UID ou son email (structure Lumesys existante)
   */
  async getUtilisateurByUid(uid, email = null) {
    const firestore = router.getFirestore();
    try {
      // 1. Chercher par email dans la collection utilisateurs (clé primaire native Lumesys)
      if (email) {
        const cleanEmail = email.toLowerCase().trim();
        const userRefEmail = doc(firestore, 'utilisateurs', cleanEmail);
        const snapEmail = await getDoc(userRefEmail);
        if (snapEmail.exists()) {
          return { id: snapEmail.id, ...snapEmail.data() };
        }
      }

      // 2. Chercher par document UID
      if (uid) {
        const userRefUid = doc(firestore, 'utilisateurs', uid);
        const snapUid = await getDoc(userRefUid);
        if (snapUid.exists()) {
          return { id: snapUid.id, ...snapUid.data() };
        }
      }

      return null;
    } catch (error) {
      handleFirestoreError(error, 'get', `utilisateurs/${email || uid}`);
    }
  },

  /**
   * Recherche un utilisateur par email (utile pour la liaison de comptes préexistants dans Lumesys)
   */
  async getUtilisateurByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();
    const firestore = router.getFirestore();
    try {
      // Vérifier d'abord si le document porte directement le nom de l'email (format Lumesys)
      const directDoc = await getDoc(doc(firestore, 'utilisateurs', cleanEmail));
      if (directDoc.exists()) {
        return { id: directDoc.id, ...directDoc.data() };
      }

      const q = query(
        collection(firestore, 'utilisateurs'),
        where('email', '==', cleanEmail),
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, 'list', 'utilisateurs');
    }
  },

  /**
   * Enregistre ou met à jour un profil dans la collection `utilisateurs` et synchronise avec `public_profiles`.
   * Préserve TOUS les champs préexistants de l'écosystème Lumesys (compatibilité ascendante absolue).
   */
  async enregistrerOuMettreAJourUtilisateur(userData) {
    if (!userData || (!userData.uid && !userData.email)) {
      throw new Error('Identifiant utilisateur (UID ou Email) manquant');
    }
    const firestore = router.getFirestore();
    const userEmail = (userData.email || '').toLowerCase().trim();
    const docKey = userEmail || userData.uid;
    const userRef = doc(firestore, 'utilisateurs', docKey);

    try {
      // Récupérer le document existant pour ne rien écraser
      const snapshot = await getDoc(userRef);
      const existingData = snapshot.exists() ? snapshot.data() : {};

      const dataToSave = {
        ...existingData,
        uid: userData.uid || existingData.uid || '',
        nom: userData.nom || existingData.nom || 'Utilisateur Lumesys',
        email: userEmail || existingData.email || '',
        photo: userData.photoUrl || userData.photo || existingData.photo || '',
        photoUrl: userData.photoUrl || userData.photo || existingData.photoUrl || '',
        statut: userData.statut || existingData.statut || 'online',
        derniereConnexion: serverTimestamp(),
        dernierVu: serverTimestamp(),
      };

      if (userData.bio !== undefined) {
        dataToSave.bio = userData.bio;
      }
      if (userData.numero || existingData.numero) {
        dataToSave.numero = userData.numero || existingData.numero;
      }
      if (userData.sexe || existingData.sexe) {
        dataToSave.sexe = userData.sexe || existingData.sexe;
      }

      await setDoc(userRef, dataToSave, { merge: true });

      // Synchronisation avec public_profiles (utilisé par Lumesys pour la découverte dans la messagerie)
      if (userEmail) {
        try {
          const publicProfileRef = doc(firestore, 'public_profiles', userEmail);
          const splitName = (dataToSave.nom || '').trim().split(/\s+/);
          await setDoc(publicProfileRef, {
            prenom: splitName[0] || '',
            nom: splitName.slice(1).join(' ') || splitName[0] || '',
            sexe: dataToSave.sexe || '',
            photo: dataToSave.photo || dataToSave.photoUrl || '',
            telephone: dataToSave.numero || '',
            email: userEmail,
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } catch (pubErr) {
          console.warn('Note: Synchronisation public_profiles optionnelle:', pubErr);
        }
      }

      return { id: docKey, ...dataToSave };
    } catch (error) {
      handleFirestoreError(error, 'write', `utilisateurs/${docKey}`);
    }
  },

  /**
   * Recherche des utilisateurs Lumesys dans `public_profiles` et `utilisateurs`.
   */
  async rechercherUtilisateurs(terme, currentUserId, limitCount = 25) {
    if (!terme || terme.trim().length === 0) {
      return this.listerUtilisateursRecents(currentUserId, limitCount);
    }
    const firestore = router.getFirestore();
    const searchVal = terme.trim();
    const searchValLower = searchVal.toLowerCase();

    try {
      // Recherche 1 : dans public_profiles
      const qPublic = query(
        collection(firestore, 'public_profiles'),
        limit(limitCount)
      );

      // Recherche 2 : dans utilisateurs
      const qUsers = query(
        collection(firestore, 'utilisateurs'),
        limit(limitCount)
      );

      const [snapPublic, snapUsers] = await Promise.all([
        getDocs(qPublic).catch(() => ({ docs: [] })),
        getDocs(qUsers).catch(() => ({ docs: [] })),
      ]);

      const map = new Map();

      snapPublic.docs.forEach((d) => {
        const data = d.data();
        const email = d.id.includes('@') ? d.id : (data.email || '');
        const fullName = `${data.prenom || ''} ${data.nom || ''}`.trim() || email;
        if (
          fullName.toLowerCase().includes(searchValLower) ||
          email.toLowerCase().includes(searchValLower)
        ) {
          if (email !== currentUserId && data.uid !== currentUserId) {
            map.set(email || d.id, {
              id: d.id,
              uid: data.uid || d.id,
              nom: fullName,
              email: email,
              photoUrl: data.photo || '',
              statut: 'online',
            });
          }
        }
      });

      snapUsers.docs.forEach((d) => {
        const data = d.data();
        const email = data.email || (d.id.includes('@') ? d.id : '');
        const name = data.nom || email || 'Utilisateur';
        if (
          name.toLowerCase().includes(searchValLower) ||
          email.toLowerCase().includes(searchValLower)
        ) {
          if (email !== currentUserId && d.id !== currentUserId && data.uid !== currentUserId) {
            const key = email || d.id;
            if (!map.has(key)) {
              map.set(key, {
                id: d.id,
                uid: data.uid || d.id,
                nom: name,
                email: email,
                photoUrl: data.photoUrl || data.photo || '',
                statut: data.statut || 'online',
              });
            }
          }
        }
      });

      return Array.from(map.values());
    } catch (error) {
      handleFirestoreError(error, 'list', 'utilisateurs');
    }
  },

  /**
   * Liste les utilisateurs récents pour démarrer une conversation
   */
  async listerUtilisateursRecents(currentUserId, limitCount = 25) {
    const firestore = router.getFirestore();
    try {
      const [snapPublic, snapUsers] = await Promise.all([
        getDocs(query(collection(firestore, 'public_profiles'), limit(limitCount))).catch(() => ({ docs: [] })),
        getDocs(query(collection(firestore, 'utilisateurs'), limit(limitCount))).catch(() => ({ docs: [] })),
      ]);

      const map = new Map();

      snapPublic.docs.forEach((d) => {
        const data = d.data();
        const email = d.id.includes('@') ? d.id : (data.email || '');
        const fullName = `${data.prenom || ''} ${data.nom || ''}`.trim() || email;
        if (email !== currentUserId && data.uid !== currentUserId) {
          map.set(email || d.id, {
            id: d.id,
            uid: data.uid || d.id,
            nom: fullName,
            email: email,
            photoUrl: data.photo || '',
            statut: 'online',
          });
        }
      });

      snapUsers.docs.forEach((d) => {
        const data = d.data();
        const email = data.email || (d.id.includes('@') ? d.id : '');
        const name = data.nom || email || 'Utilisateur';
        const key = email || d.id;
        if (email !== currentUserId && d.id !== currentUserId && data.uid !== currentUserId && !map.has(key)) {
          map.set(key, {
            id: d.id,
            uid: data.uid || d.id,
            nom: name,
            email: email,
            photoUrl: data.photoUrl || data.photo || '',
            statut: data.statut || 'online',
          });
        }
      });

      return Array.from(map.values());
    } catch (error) {
      handleFirestoreError(error, 'list', 'utilisateurs');
    }
  },

  /**
   * ==========================================
   * 2. GESTION DES CONVERSATIONS (Collection `conversations`)
   * ==========================================
   */

  /**
   * Écoute en temps réel les conversations d'un utilisateur
   */
  ecouterConversations(userId, onUpdate, onError) {
    if (!userId) return () => {};
    const firestore = router.getFirestore();

    const q = query(
      collection(firestore, 'conversations'),
      where('participants', 'array-contains', userId)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const conversations = [];
        snapshot.forEach((d) => {
          conversations.push({ id: d.id, ...d.data() });
        });

        // Tri côté client par date de dernière activité
        conversations.sort((a, b) => {
          const dateA = a.misAJourLe?.toMillis ? a.misAJourLe.toMillis() : (a.creeLe?.toMillis ? a.creeLe.toMillis() : 0);
          const dateB = b.misAJourLe?.toMillis ? b.misAJourLe.toMillis() : (b.creeLe?.toMillis ? b.creeLe.toMillis() : 0);
          return dateB - dateA;
        });

        onUpdate(conversations);
      },
      (error) => {
        console.error('Erreur écoute conversations:', error);
        if (onError) onError(error);
        handleFirestoreError(error, 'get', 'conversations');
      }
    );
  },

  /**
   * Recherche une conversation existante entre deux utilisateurs (1 à 1)
   */
  async trouverConversationDirecte(userAId, userBId) {
    const firestore = router.getFirestore();
    try {
      const q = query(
        collection(firestore, 'conversations'),
        where('participants', 'array-contains', userAId)
      );
      const snapshot = await getDocs(q);
      for (const d of snapshot.docs) {
        const data = d.data();
        if (data.participants && data.participants.includes(userBId) && data.participants.length === 2) {
          return { id: d.id, ...data };
        }
      }
      return null;
    } catch (error) {
      handleFirestoreError(error, 'list', 'conversations');
    }
  },

  /**
   * Crée ou retourne la conversation directe entre deux utilisateurs
   */
  async creerOuRecupererConversation(userA, userB) {
    const existante = await this.trouverConversationDirecte(userA.uid, userB.uid);
    if (existante) {
      return existante;
    }

    const firestore = router.getFirestore();
    const convId = [userA.uid, userB.uid].sort().join('_');
    const convRef = doc(firestore, 'conversations', convId);

    const nouvelleConv = {
      participants: [userA.uid, userB.uid],
      participantDetails: {
        [userA.uid]: {
          nom: userA.nom || 'Utilisateur',
          email: userA.email || '',
          photoUrl: userA.photoUrl || '',
        },
        [userB.uid]: {
          nom: userB.nom || 'Utilisateur',
          email: userB.email || '',
          photoUrl: userB.photoUrl || '',
        },
      },
      dernierMessage: '',
      dernierMessageDate: null,
      dernierMessageExpediteur: '',
      nonLus: {
        [userA.uid]: 0,
        [userB.uid]: 0,
      },
      creeLe: serverTimestamp(),
      misAJourLe: serverTimestamp(),
    };

    try {
      await setDoc(convRef, nouvelleConv, { merge: true });
      return { id: convId, ...nouvelleConv };
    } catch (error) {
      handleFirestoreError(error, 'write', `conversations/${convId}`);
    }
  },

  /**
   * Marque une conversation comme lue pour un utilisateur
   */
  async marquerConversationCommeLue(conversationId, userId) {
    if (!conversationId || !userId) return;
    const firestore = router.getFirestore();
    const convRef = doc(firestore, 'conversations', conversationId);

    try {
      await updateDoc(convRef, {
        [`nonLus.${userId}`]: 0,
      });
    } catch (error) {
      console.warn('Erreur mise à jour statut de lecture conversation:', error);
    }
  },

  /**
   * ==========================================
   * 3. GESTION DES MESSAGES TEMPS RÉEL (Sous-collection `conversations/{id}/messages`)
   * ==========================================
   */

  /**
   * Écoute les messages d'une conversation en temps réel
   */
  ecouterMessages(conversationId, onUpdate, onError) {
    if (!conversationId) return () => {};
    const firestore = router.getFirestore();

    const messagesRef = collection(firestore, 'conversations', conversationId, 'messages');
    const q = query(messagesRef, orderBy('dateEnvoi', 'asc'), limit(150));

    return onSnapshot(
      q,
      (snapshot) => {
        const messages = [];
        snapshot.forEach((d) => {
          messages.push({ id: d.id, ...d.data() });
        });
        onUpdate(messages);
      },
      (error) => {
        console.error('Erreur écoute messages:', error);
        if (onError) onError(error);
        handleFirestoreError(error, 'get', `conversations/${conversationId}/messages`);
      }
    );
  },

  /**
   * Envoie un nouveau message dans une conversation
   */
  async envoyerMessage(conversationId, expediteur, contenu, pieceJointe = null) {
    if (!conversationId || !expediteur || !contenu.trim()) {
      throw new Error('Paramètres de message invalides');
    }

    const firestore = router.getFirestore();
    const convRef = doc(firestore, 'conversations', conversationId);
    const messagesRef = collection(firestore, 'conversations', conversationId, 'messages');

    const cleanContenu = contenu.trim().slice(0, 5000);

    const messagePayload = {
      conversationId,
      expediteurId: expediteur.uid,
      expediteurNom: expediteur.nom || 'Utilisateur',
      contenu: cleanContenu,
      dateEnvoi: serverTimestamp(),
      luPar: [expediteur.uid],
    };

    if (pieceJointe) {
      messagePayload.pieceJointe = pieceJointe;
    }

    try {
      // 1. Ajouter le message
      const docAdded = await addDoc(messagesRef, messagePayload);

      // 2. Mettre à jour la conversation parente (dernier message, horodatage, compteur non lus)
      const convSnap = await getDoc(convRef);
      if (convSnap.exists()) {
        const convData = convSnap.data();
        const updatePayload = {
          dernierMessage: cleanContenu,
          dernierMessageDate: serverTimestamp(),
          dernierMessageExpediteur: expediteur.uid,
          misAJourLe: serverTimestamp(),
        };

        // Incrémenter le compteur des autres participants
        if (convData.participants && Array.isArray(convData.participants)) {
          convData.participants.forEach((pId) => {
            if (pId !== expediteur.uid) {
              updatePayload[`nonLus.${pId}`] = increment(1);
            }
          });
        }

        await updateDoc(convRef, updatePayload);
      }

      return { id: docAdded.id, ...messagePayload };
    } catch (error) {
      handleFirestoreError(error, 'write', `conversations/${conversationId}/messages`);
    }
  },

  /**
   * Marque des messages comme lus par l'utilisateur courant
   */
  async marquerMessagesCommeLus(conversationId, userId, messageIds) {
    if (!conversationId || !userId || !messageIds || messageIds.length === 0) return;
    const firestore = router.getFirestore();

    const promises = messageIds.map((msgId) => {
      const msgRef = doc(firestore, 'conversations', conversationId, 'messages', msgId);
      return updateDoc(msgRef, {
        luPar: arrayUnion(userId),
      }).catch((e) => console.warn('Impossible de marquer message lu:', msgId, e));
    });

    await Promise.all(promises);
    await this.marquerConversationCommeLue(conversationId, userId);
  },
};
