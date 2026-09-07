/**
 * LUMA — Contrôleur Principal de l'Application
 * Orchestration des vues, événements DOM, temps réel et synchronisation
 *
 * VERSION CORRIGÉE
 * ------------------------------------------------------------
 * Firestore :
 *
 * chats/{chatId}
 * chats/{chatId}/messages/{messageId}
 *
 * IMPORTANT :
 * - chats.participants contient des EMAILS
 * - messages.expediteurId contient le UID Firebase
 */

import {
  initFirebase,
  saveFirebaseConfig,
  getStoredFirebaseConfig,
  testConnection
} from './firebase-config.js';

import { AuthService } from './auth.js';
import { Database } from './database.js';
import { UsersService } from './users.js';
import { ConversationsService } from './conversations.js';
import { MessagesService } from './messages.js';
import { NotificationsService } from './notifications.js';
import { StorageService } from './storage.js';


// ============================================================
// ÉTAT GLOBAL DE L'APPLICATION
// ============================================================

const AppState = {
  currentUser: null,
  currentProfile: null,

  activeConversation: null,
  activeRecipient: null,

  conversations: [],
  activeMessages: [],

  unsubscribeConversations: null,
  unsubscribeMessages: null,

  mobileView: 'sidebar'
};


// ============================================================
// INITIALISATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});


async function initApp() {

  setupEventListeners();

  checkFirebaseStatus();

  AuthService.init(handleAuthStateChanged);


  // ----------------------------------------------------------
  // Service Worker PWA
  // ----------------------------------------------------------

  if ('serviceWorker' in navigator) {

    navigator.serviceWorker
      .register('./service-worker.js')
      .catch((e) => {

        console.warn(
          'Service Worker non enregistré:',
          e
        );

      });

  }
}


// ============================================================
// VÉRIFICATION FIREBASE
// ============================================================

function checkFirebaseStatus() {

  const config = getStoredFirebaseConfig();

  const banner =
    document.getElementById(
      'firebase-status-banner'
    );

  const bannerText =
    document.getElementById(
      'firebase-status-text'
    );


  if (!config) {

    if (banner) {

      banner.classList.remove('hidden');

      if (bannerText) {

        bannerText.innerHTML = `
          <strong>Configuration Firebase requise :</strong>
          Pour connecter LUMA à la base Lumesys
          (collection <code>utilisateurs</code>),
          veuillez renseigner votre configuration Firebase.
        `;

      }

    }

  } else {

    if (banner) {

      banner.classList.add('hidden');

    }

    testConnection();

  }
}


// ============================================================
// AUTHENTIFICATION
// ============================================================

function handleAuthStateChanged(user, profile) {

  AppState.currentUser = user;

  AppState.currentProfile = profile;


  const authModal =
    document.getElementById('auth-modal');

  const appContainer =
    document.getElementById('luma-app');


  // ----------------------------------------------------------
  // UTILISATEUR CONNECTÉ
  // ----------------------------------------------------------

  if (user) {

    if (authModal) {

      authModal.classList.add('hidden');

    }

    if (appContainer) {

      appContainer.classList.remove('hidden');

    }


    renderCurrentUserUI(
      profile || user
    );


    // IMPORTANT :
    // Le service Conversations utilise maintenant
    // l'email Firebase de l'utilisateur connecté.
    demarrerEcouteConversations(
      user.uid
    );


    NotificationsService.demanderPermission();

  }


  // ----------------------------------------------------------
  // UTILISATEUR DÉCONNECTÉ
  // ----------------------------------------------------------

  else {

    arreterEcoutes();


    if (authModal) {

      authModal.classList.remove('hidden');

    }

    if (appContainer) {

      appContainer.classList.add('hidden');

    }


    AppState.activeConversation = null;
    AppState.activeRecipient = null;
    AppState.conversations = [];
    AppState.activeMessages = [];

  }
}


// ============================================================
// AFFICHAGE UTILISATEUR CONNECTÉ
// ============================================================

function renderCurrentUserUI(user) {

  const nameEl =
    document.getElementById(
      'current-user-name'
    );

  const avatarEl =
    document.getElementById(
      'current-user-avatar'
    );

  const statusDot =
    document.getElementById(
      'current-user-status-dot'
    );


  const displayName =
    user.nom ||
    user.displayName ||
    user.email ||
    'Utilisateur';


  if (nameEl) {

    nameEl.textContent =
      displayName;

  }


  if (avatarEl) {

    const avatar =
      UsersService.getAvatarProps(
        displayName,
        user.email
      );


    if (
      user.photoUrl ||
      user.photoURL
    ) {

      avatarEl.innerHTML = `
        <img
          src="${user.photoUrl || user.photoURL}"
          alt="${displayName}"
          class="w-full h-full object-cover rounded-full"
        >
      `;

    } else {

      avatarEl.textContent =
        avatar.initials;

      avatarEl.style.backgroundColor =
        avatar.bgColor;

    }

  }


  if (statusDot) {

    statusDot.className =
      'w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white';

  }
}


// ============================================================
// ÉCOUTE DES CONVERSATIONS
// ============================================================

function demarrerEcouteConversations(userId) {

  // Arrêter l'ancien écouteur
  if (
    AppState.unsubscribeConversations
  ) {

    AppState.unsubscribeConversations();

    AppState.unsubscribeConversations =
      null;

  }


  AppState.unsubscribeConversations =
    ConversationsService.abonnerConversations(

      userId,

      (conversations) => {

        AppState.conversations =
          conversations || [];


        renderConversationsList(
          AppState.conversations
        );


        // ----------------------------------------------------
        // CALCUL DES MESSAGES NON LUS
        // ----------------------------------------------------
        //
        // IMPORTANT :
        // Les anciennes conversations utilisent des EMAILS
        // comme clés de nonLus.
        //
        // Exemple :
        // nonLus:
        // {
        //   "dibrahimdjime@gmail.com": 2
        // }
        //
        // ----------------------------------------------------

        const currentEmail =
          (
            AppState.currentUser?.email ||
            AppState.currentProfile?.email ||
            ''
          )
            .toLowerCase()
            .trim();


        let totalNonLus = 0;


        conversations.forEach((conversation) => {

          if (
            conversation.nonLus &&
            currentEmail
          ) {

            const count =
              Number(
                conversation.nonLus[
                  currentEmail
                ]
              ) || 0;


            totalNonLus += count;

          }

        });


        NotificationsService.mettreAJourBadgeTitre(
          totalNonLus
        );


        // ----------------------------------------------------
        // METTRE À JOUR LA CONVERSATION ACTIVE
        // ----------------------------------------------------

        if (
          AppState.activeConversation
        ) {

          const updated =
            conversations.find(
              (conversation) =>
                conversation.id ===
                AppState.activeConversation.id
            );


          if (updated) {

            AppState.activeConversation =
              updated;

          }

        }

      },

      (err) => {

        console.warn(
          'Erreur abonnement conversations:',
          err
        );

      }

    );

}


// ============================================================
// AFFICHAGE LISTE DES CONVERSATIONS
// ============================================================

function renderConversationsList(
  conversations
) {

  const container =
    document.getElementById(
      'conversations-list'
    );


  if (!container) {

    return;

  }


  if (
    !conversations ||
    conversations.length === 0
  ) {

    container.innerHTML = `
      <div class="p-8 text-center text-slate-500">

        <svg
          class="w-12 h-12 mx-auto mb-3 text-slate-400 stroke-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>

        <p class="text-sm font-medium">
          Aucune conversation pour l'instant
        </p>

        <p class="text-xs text-slate-400 mt-1">
          Recherchez un utilisateur Lumesys
          pour entamer une discussion.
        </p>

      </div>
    `;

    return;

  }


  const currentUser =
    AppState.currentProfile ||
    AppState.currentUser;


  const currentEmail =
    (
      AppState.currentUser?.email ||
      AppState.currentProfile?.email ||
      ''
    )
      .toLowerCase()
      .trim();


  container.innerHTML = '';


  conversations.forEach((conv) => {

    // --------------------------------------------------------
    // IMPORTANT :
    // getAutreParticipant() reçoit maintenant l'utilisateur
    // et non son UID.
    // --------------------------------------------------------

    const autre =
      ConversationsService.getAutreParticipant(
        conv,
        currentUser
      );


    if (!autre) {

      return;

    }


    const isActive =
      AppState.activeConversation?.id ===
      conv.id;


    // --------------------------------------------------------
    // Messages non lus
    // --------------------------------------------------------

    const nonLus =
      Number(
        conv.nonLus?.[currentEmail]
      ) || 0;


    const avatar =
      UsersService.getAvatarProps(
        autre.nom,
        autre.email
      );


    const dateFormatted =
      ConversationsService.formaterDate(
        conv.dernierMessageDate ||
        conv.misAJourLe ||
        conv.updatedAt
      );


    const item =
      document.createElement('div');


    item.className =
      `flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-colors border ${
        isActive
          ? 'bg-teal-50/80 border-teal-200 text-slate-900 shadow-xs'
          : 'hover:bg-slate-100/70 border-transparent text-slate-700'
      }`;


    item.id =
      `conv-item-${conv.id}`;


    item.innerHTML = `
      <div class="relative shrink-0">

        <div
          class="w-12 h-12 rounded-full flex items-center justify-center font-semibold text-white text-sm"
          style="background-color: ${avatar.bgColor}"
        >

          ${
            autre.photoUrl
              ? `
                <img
                  src="${autre.photoUrl}"
                  alt="${autre.nom}"
                  class="w-full h-full object-cover rounded-full"
                >
              `
              : avatar.initials
          }

        </div>

      </div>


      <div class="flex-1 min-w-0">

        <div class="flex items-center justify-between gap-1 mb-1">

          <h4
            class="text-sm font-semibold truncate ${
              nonLus > 0
                ? 'text-slate-900'
                : 'text-slate-800'
            }"
          >
            ${autre.nom}
          </h4>

          <span
            class="text-xs text-slate-400 whitespace-nowrap shrink-0"
          >
            ${dateFormatted}
          </span>

        </div>


        <div class="flex items-center justify-between gap-2">

          <p
            class="text-xs truncate ${
              nonLus > 0
                ? 'font-semibold text-teal-700'
                : 'text-slate-500'
            }"
          >

            ${
              conv.dernierMessage
                ? MessagesService.echapperHtml(
                    conv.dernierMessage
                  )
                : '<em>Nouvelle discussion créée</em>'
            }

          </p>


          ${
            nonLus > 0
              ? `
                <span
                  class="px-2 py-0.5 text-xs font-bold bg-teal-600 text-white rounded-full shrink-0"
                >
                  ${nonLus}
                </span>
              `
              : ''
          }

        </div>

      </div>
    `;


    item.addEventListener(
      'click',
      () => {

        ouvrirConversation(
          conv,
          autre
        );

      }
    );


    container.appendChild(item);

  });

}


// ============================================================
// OUVRIR UNE CONVERSATION
// ============================================================

async function ouvrirConversation(
  conv,
  destinataire
) {

  if (!conv || !conv.id) {

    console.warn(
      'Conversation invalide:',
      conv
    );

    return;

  }


  AppState.activeConversation =
    conv;

  AppState.activeRecipient =
    destinataire;


  setMobileView('chat');


  // ----------------------------------------------------------
  // Éléments de l'en-tête
  // ----------------------------------------------------------

  const headerName =
    document.getElementById(
      'chat-header-name'
    );

  const headerStatus =
    document.getElementById(
      'chat-header-status'
    );

  const headerAvatar =
    document.getElementById(
      'chat-header-avatar'
    );

  const emptyState =
    document.getElementById(
      'chat-empty-state'
    );

  const activeArea =
    document.getElementById(
      'chat-active-area'
    );


  if (emptyState) {

    emptyState.classList.add(
      'hidden'
    );

  }


  if (activeArea) {

    activeArea.classList.remove(
      'hidden'
    );

  }


  if (headerName) {

    headerName.textContent =
      destinataire?.nom ||
      destinataire?.email ||
      'Utilisateur';

  }


  if (headerStatus) {

    headerStatus.textContent =
      destinataire?.email ||
      'Membre Lumesys';

  }


  // ----------------------------------------------------------
  // Avatar
  // ----------------------------------------------------------

  if (headerAvatar) {

    const avatar =
      UsersService.getAvatarProps(
        destinataire?.nom ||
        destinataire?.email ||
        'Utilisateur',

        destinataire?.email ||
        ''
      );


    if (destinataire?.photoUrl) {

      headerAvatar.innerHTML = `
        <img
          src="${destinataire.photoUrl}"
          alt="${destinataire.nom || 'Utilisateur'}"
          class="w-full h-full object-cover rounded-full"
        >
      `;

    } else {

      headerAvatar.innerHTML = '';

      headerAvatar.textContent =
        avatar.initials;

      headerAvatar.style.backgroundColor =
        avatar.bgColor;

    }

  }


  // ----------------------------------------------------------
  // Marquer la conversation comme lue
  // ----------------------------------------------------------

  const currentUserId =
    AppState.currentUser?.uid;


  if (currentUserId) {

    try {

      await ConversationsService.marquerLue(
        conv.id,
        currentUserId
      );

    } catch (err) {

      console.warn(
        'Impossible de marquer la conversation comme lue:',
        err
      );

    }

  }


  // ----------------------------------------------------------
  // Arrêter ancien écouteur messages
  // ----------------------------------------------------------

  if (AppState.unsubscribeMessages) {

    AppState.unsubscribeMessages();

    AppState.unsubscribeMessages =
      null;

  }


  // ----------------------------------------------------------
  // Loader
  // ----------------------------------------------------------

  const messagesContainer =
    document.getElementById(
      'messages-scroll-area'
    );


  if (messagesContainer) {

    messagesContainer.innerHTML = `
      <div
        class="flex items-center justify-center h-48 text-slate-400"
      >
        <div
          class="animate-spin rounded-full h-6 w-6 border-2 border-teal-600 border-t-transparent"
        ></div>
      </div>
    `;

  }


  let isFirstLoad = true;


  // ----------------------------------------------------------
  // ÉCOUTE TEMPS RÉEL DES MESSAGES
  // ----------------------------------------------------------

  AppState.unsubscribeMessages =
    MessagesService.abonnerMessages(

      conv.id,

      (messages) => {

        AppState.activeMessages =
          messages || [];


        renderMessagesTimeline(
          AppState.activeMessages
        );


        // ----------------------------------------------------
        // Notification nouveau message
        // ----------------------------------------------------

        if (
          !isFirstLoad &&
          messages &&
          messages.length > 0
        ) {

          const lastMsg =
            messages[messages.length - 1];


          if (
            lastMsg.expediteurId !==
            currentUserId
          ) {

            NotificationsService.jouerSonMessage();


            NotificationsService.afficherNotificationSysteme(
              destinataire?.nom ||
              destinataire?.email ||
              'Nouveau message',

              lastMsg.contenu
            );

          }

        }


        isFirstLoad = false;


        // ----------------------------------------------------
        // Marquer les messages comme lus
        // ----------------------------------------------------

        if (
          currentUserId &&
          messages &&
          messages.length > 0
        ) {

          MessagesService.marquerCommeLus(
            conv.id,
            currentUserId,
            messages
          );

        }

      },

      (err) => {

        console.warn(
          'Erreur écoute messages:',
          err
        );


        if (messagesContainer) {

          messagesContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-48 text-center p-4">

              <p class="text-sm font-medium text-red-600">
                Impossible de charger les messages.
              </p>

              <p class="text-xs text-slate-400 mt-1">
                Vérifiez votre connexion Firebase.
              </p>

            </div>
          `;

        }

      }

    );


  // ----------------------------------------------------------
  // Actualiser la liste
  // ----------------------------------------------------------

  renderConversationsList(
    AppState.conversations
  );

}


// ============================================================
// AFFICHAGE DES MESSAGES
// ============================================================

function renderMessagesTimeline(
  messages
) {

  const container =
    document.getElementById(
      'messages-scroll-area'
    );


  if (!container) {

    return;

  }


  if (
    !messages ||
    messages.length === 0
  ) {

    container.innerHTML = `
      <div
        class="flex flex-col items-center justify-center h-64 text-slate-400 text-center p-4"
      >

        <div
          class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2"
        >

          <svg
            class="w-6 h-6 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
            />
          </svg>

        </div>

        <p class="text-sm font-medium text-slate-600">
          Début de votre conversation
        </p>

        <p class="text-xs text-slate-400 mt-0.5">
          Envoyez le premier message à
          ${AppState.activeRecipient?.nom || 'ce contact'}.
        </p>

      </div>
    `;

    return;

  }


  const currentUserId =
    AppState.currentUser?.uid;


  container.innerHTML = '';


  let currentDay = '';


  messages.forEach((msg) => {

    const msgDay =
      MessagesService.formaterJour(
        msg.dateEnvoi
      );


    // --------------------------------------------------------
    // Séparateur de jour
    // --------------------------------------------------------

    if (
      msgDay !== currentDay
    ) {

      currentDay =
        msgDay;


      const dayDivider =
        document.createElement('div');


      dayDivider.className =
        'flex items-center justify-center my-4';


      dayDivider.innerHTML = `
        <span
          class="px-3 py-1 bg-slate-200/70 text-slate-600 text-xs font-medium rounded-full backdrop-blur-xs"
        >
          ${msgDay}
        </span>
      `;


      container.appendChild(
        dayDivider
      );

    }


    // --------------------------------------------------------
    // Message envoyé par moi ?
    // --------------------------------------------------------

    const isMine =
      msg.expediteurId ===
      currentUserId;


    const timeFormatted =
      MessagesService.formaterHeure(
        msg.dateEnvoi
      );


    const isRead =
      msg.luPar &&
      msg.luPar.length > 1;


    const row =
      document.createElement('div');


    row.className =
      `flex w-full mb-3 ${
        isMine
          ? 'justify-end'
          : 'justify-start'
      }`;


    row.innerHTML = `
      <div
        class="max-w-[80%] md:max-w-[65%] flex flex-col ${
          isMine
            ? 'items-end'
            : 'items-start'
        }"
      >

        <div
          class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-2xs ${
            isMine
              ? 'bg-teal-700 text-white rounded-br-xs'
              : 'bg-white text-slate-900 border border-slate-200/80 rounded-bl-xs'
          }"
        >

          <p class="whitespace-pre-wrap break-words">
            ${MessagesService.echapperHtml(
              msg.contenu
            )}
          </p>


          <div
            class="flex items-center justify-end gap-1 mt-1 text-[10px] ${
              isMine
                ? 'text-teal-200'
                : 'text-slate-400'
            }"
          >

            <span>
              ${timeFormatted}
            </span>


            ${
              isMine
                ? `
                  <span
                    title="${isRead ? 'Lu' : 'Envoyé'}"
                  >
                    ${
                      isRead
                        ? '✓✓'
                        : '✓'
                    }
                  </span>
                `
                : ''
            }

          </div>

        </div>

      </div>
    `;


    container.appendChild(
      row
    );

  });


  // ----------------------------------------------------------
  // Descendre automatiquement en bas
  // ----------------------------------------------------------

  container.scrollTop =
    container.scrollHeight;

}


// ============================================================
// ENVOYER MESSAGE
// ============================================================

async function envoyerMessageActif() {

  const input =
    document.getElementById(
      'message-input'
    );


  if (!input) {

    return;

  }


  const contenu =
    input.value.trim();


  if (
    !contenu ||
    !AppState.activeConversation ||
    !AppState.currentUser
  ) {

    return;

  }


  // Vider immédiatement le champ
  input.value = '';

  input.style.height =
    'auto';


  try {

    await MessagesService.envoyer(

      AppState.activeConversation.id,

      AppState.currentProfile ||
      AppState.currentUser,

      contenu

    );

  } catch (err) {

    console.error(
      'Erreur lors de l\'envoi du message:',
      err
    );


    // Restaurer le message si l'envoi échoue
    input.value =
      contenu;


    alert(
      'Impossible d\'envoyer le message. Veuillez vérifier votre connexion.'
    );

  }

}


// ============================================================
// ARRÊTER LES ÉCOUTEURS
// ============================================================

function arreterEcoutes() {

  if (
    AppState.unsubscribeConversations
  ) {

    AppState.unsubscribeConversations();

    AppState.unsubscribeConversations =
      null;

  }


  if (
    AppState.unsubscribeMessages
  ) {

    AppState.unsubscribeMessages();

    AppState.unsubscribeMessages =
      null;

  }

}


// ============================================================
// VUE MOBILE
// ============================================================

function setMobileView(view) {

  AppState.mobileView =
    view;


  const sidebar =
    document.getElementById(
      'sidebar-pane'
    );

  const chat =
    document.getElementById(
      'chat-pane'
    );


  if (
    view === 'sidebar'
  ) {

    if (sidebar) {

      sidebar.classList.remove(
        'hidden'
      );

    }

    if (chat) {

      chat.classList.add(
        'hidden'
      );

    }

  } else {

    if (sidebar) {

      sidebar.classList.add(
        'hidden',
        'md:flex'
      );

    }

    if (chat) {

      chat.classList.remove(
        'hidden'
      );

    }

  }

}


// ============================================================
// ÉVÉNEMENTS DOM
// ============================================================

function setupEventListeners() {

  // ========================================================
  // 1. RETOUR MOBILE
  // ========================================================

  const backBtn =
    document.getElementById(
      'chat-back-button'
    );


  if (backBtn) {

    backBtn.addEventListener(
      'click',
      () => {

        setMobileView(
          'sidebar'
        );

      }
    );

  }


  // ========================================================
  // 2. ENVOI MESSAGE
  // ========================================================

  const sendBtn =
    document.getElementById(
      'message-send-button'
    );


  if (sendBtn) {

    sendBtn.addEventListener(
      'click',
      envoyerMessageActif
    );

  }


  const msgInput =
    document.getElementById(
      'message-input'
    );


  if (msgInput) {

    msgInput.addEventListener(
      'keydown',
      (e) => {

        if (
          e.key === 'Enter' &&
          !e.shiftKey
        ) {

          e.preventDefault();

          envoyerMessageActif();

        }

      }
    );


    // Redimensionnement automatique

    msgInput.addEventListener(
      'input',
      () => {

        msgInput.style.height =
          'auto';

        msgInput.style.height =
          Math.min(
            msgInput.scrollHeight,
            120
          ) + 'px';

      }
    );

  }


  // ========================================================
  // 3. RECHERCHE UTILISATEURS
  // ========================================================

  const searchInput =
    document.getElementById(
      'user-search-input'
    );


  let searchTimeout =
    null;


  if (searchInput) {

    searchInput.addEventListener(
      'input',
      (e) => {

        clearTimeout(
          searchTimeout
        );


        const query =
          e.target.value;


        searchTimeout =
          setTimeout(
            async () => {

              if (
                !AppState.currentUser
              ) {

                return;

              }


              try {

                const resultats =
                  await UsersService.rechercher(
                    query,
                    AppState.currentUser.uid
                  );


                renderUserSearchResults(
                  resultats
                );

              } catch (err) {

                console.warn(
                  'Erreur recherche utilisateur:',
                  err
                );

              }

            },
            300
          );

      }
    );

  }


  // ========================================================
  // 4. NOUVELLE DISCUSSION
  // ========================================================

  const newChatBtn =
    document.getElementById(
      'new-chat-button'
    );


  const searchModal =
    document.getElementById(
      'search-modal'
    );


  const closeSearchBtn =
    document.getElementById(
      'close-search-modal'
    );


  if (
    newChatBtn &&
    searchModal
  ) {

    newChatBtn.addEventListener(
      'click',
      async () => {

        searchModal.classList.remove(
          'hidden'
        );


        if (
          AppState.currentUser
        ) {

          try {

            const users =
              await Database.listerUtilisateursRecents(
                AppState.currentUser.uid
              );


            renderModalUserList(
              users
            );

          } catch (err) {

            console.warn(
              'Erreur chargement utilisateurs:',
              err
            );

          }

        }

      }
    );

  }


  if (
    closeSearchBtn &&
    searchModal
  ) {

    closeSearchBtn.addEventListener(
      'click',
      () => {

        searchModal.classList.add(
          'hidden'
        );

      }
    );

  }


  // ========================================================
  // 5. AUTHENTIFICATION
  // ========================================================

  const loginForm =
    document.getElementById(
      'login-form'
    );


  const signupForm =
    document.getElementById(
      'signup-form'
    );


  const toggleAuthBtn =
    document.getElementById(
      'toggle-auth-mode'
    );


  const googleLoginBtn =
    document.getElementById(
      'google-login-button'
    );


  const logoutBtn =
    document.getElementById(
      'logout-button'
    );


  // --------------------------------------------------------
  // Connexion email
  // --------------------------------------------------------

  if (loginForm) {

    loginForm.addEventListener(
      'submit',
      async (e) => {

        e.preventDefault();


        const email =
          document.getElementById(
            'login-email'
          ).value;


        const pass =
          document.getElementById(
            'login-password'
          ).value;


        const errorEl =
          document.getElementById(
            'auth-error-msg'
          );


        if (errorEl) {

          errorEl.textContent =
            '';

        }


        try {

          await AuthService.connexionEmail(
            email,
            pass
          );

        } catch (err) {

          if (errorEl) {

            errorEl.textContent =
              'Identifiants invalides ou compte inexistant : ' +
              err.message;

          }

        }

      }
    );

  }


  // --------------------------------------------------------
  // Inscription
  // --------------------------------------------------------

  if (signupForm) {

    signupForm.addEventListener(
      'submit',
      async (e) => {

        e.preventDefault();


        const nom =
          document.getElementById(
            'signup-name'
          ).value;


        const email =
          document.getElementById(
            'signup-email'
          ).value;


        const pass =
          document.getElementById(
            'signup-password'
          ).value;


        const errorEl =
          document.getElementById(
            'auth-error-msg'
          );


        if (errorEl) {

          errorEl.textContent =
            '';

        }


        try {

          await AuthService.inscriptionEmail(
            email,
            pass,
            nom
          );

        } catch (err) {

          if (errorEl) {

            errorEl.textContent =
              'Erreur lors de la création du compte : ' +
              err.message;

          }

        }

      }
    );

  }


  // --------------------------------------------------------
  // Changement connexion / inscription
  // --------------------------------------------------------

  if (toggleAuthBtn) {

    toggleAuthBtn.addEventListener(
      'click',
      () => {

        if (
          !loginForm ||
          !signupForm
        ) {

          return;

        }


        const isLoginVisible =
          !loginForm.classList.contains(
            'hidden'
          );


        if (isLoginVisible) {

          loginForm.classList.add(
            'hidden'
          );


          signupForm.classList.remove(
            'hidden'
          );


          toggleAuthBtn.textContent =
            'Vous avez déjà un compte ? Se connecter';

        } else {

          loginForm.classList.remove(
            'hidden'
          );


          signupForm.classList.add(
            'hidden'
          );


          toggleAuthBtn.textContent =
            'Nouveau sur Lumesys ? Créer un compte';

        }

      }
    );

  }


  // --------------------------------------------------------
  // Connexion Google
  // --------------------------------------------------------

  if (googleLoginBtn) {

    googleLoginBtn.addEventListener(
      'click',
      async () => {

        const errorEl =
          document.getElementById(
            'auth-error-msg'
          );


        if (errorEl) {

          errorEl.textContent =
            '';

        }


        try {

          await AuthService.connexionGoogle();

        } catch (err) {

          if (errorEl) {

            errorEl.textContent =
              'Erreur Google Sign-in : ' +
              err.message;

          }

        }

      }
    );

  }


  // --------------------------------------------------------
  // Déconnexion
  // --------------------------------------------------------

  if (logoutBtn) {

    logoutBtn.addEventListener(
      'click',
      () => {

        AuthService.deconnexion();

      }
    );

  }


  // ========================================================
  // 6. CONFIGURATION FIREBASE
  // ========================================================

  const configBtn =
    document.getElementById(
      'config-button'
    );


  const configModal =
    document.getElementById(
      'config-modal'
    );


  const closeConfigBtn =
    document.getElementById(
      'close-config-modal'
    );


  const configForm =
    document.getElementById(
      'config-form'
    );


  if (
    configBtn &&
    configModal
  ) {

    configBtn.addEventListener(
      'click',
      () => {

        const stored =
          getStoredFirebaseConfig() ||
          {};


        const apiKey =
          document.getElementById(
            'cfg-api-key'
          );

        const authDomain =
          document.getElementById(
            'cfg-auth-domain'
          );

        const projectId =
          document.getElementById(
            'cfg-project-id'
          );

        const storageBucket =
          document.getElementById(
            'cfg-storage-bucket'
          );

        const appId =
          document.getElementById(
            'cfg-app-id'
          );


        if (apiKey) {

          apiKey.value =
            stored.apiKey || '';

        }


        if (authDomain) {

          authDomain.value =
            stored.authDomain || '';

        }


        if (projectId) {

          projectId.value =
            stored.projectId || '';

        }


        if (storageBucket) {

          storageBucket.value =
            stored.storageBucket || '';

        }


        if (appId) {

          appId.value =
            stored.appId || '';

        }


        configModal.classList.remove(
          'hidden'
        );

      }
    );

  }


  if (
    closeConfigBtn &&
    configModal
  ) {

    closeConfigBtn.addEventListener(
      'click',
      () => {

        configModal.classList.add(
          'hidden'
        );

      }
    );

  }


  if (configForm) {

    configForm.addEventListener(
      'submit',
      (e) => {

        e.preventDefault();


        const newConfig = {

          apiKey:
            document.getElementById(
              'cfg-api-key'
            ).value.trim(),

          authDomain:
            document.getElementById(
              'cfg-auth-domain'
            ).value.trim(),

          projectId:
            document.getElementById(
              'cfg-project-id'
            ).value.trim(),

          storageBucket:
            document.getElementById(
              'cfg-storage-bucket'
            ).value.trim(),

          appId:
            document.getElementById(
              'cfg-app-id'
            ).value.trim()

        };


        if (
          saveFirebaseConfig(
            newConfig
          )
        ) {

          window.location.reload();

        } else {

          alert(
            'Erreur lors de l\'enregistrement de la configuration.'
          );

        }

      }
    );

  }

}


// ============================================================
// LISTE UTILISATEURS — NOUVELLE DISCUSSION
// ============================================================

function renderModalUserList(
  users
) {

  const container =
    document.getElementById(
      'modal-users-list'
    );


  if (!container) {

    return;

  }


  if (
    !users ||
    users.length === 0
  ) {

    container.innerHTML = `
      <div class="p-6 text-center text-slate-500 text-sm">
        Aucun autre utilisateur trouvé dans la collection
        <code>utilisateurs</code>.
      </div>
    `;

    return;

  }


  container.innerHTML = '';


  users.forEach((u) => {

    const avatar =
      UsersService.getAvatarProps(
        u.nom,
        u.email
      );


    const item =
      document.createElement('div');


    item.className =
      'flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-slate-100';


    item.innerHTML = `
      <div class="flex items-center gap-3">

        <div
          class="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white text-xs"
          style="background-color: ${avatar.bgColor}"
        >

          ${
            u.photoUrl
              ? `
                <img
                  src="${u.photoUrl}"
                  alt="${u.nom || 'Utilisateur'}"
                  class="w-full h-full object-cover rounded-full"
                >
              `
              : avatar.initials
          }

        </div>


        <div>

          <h4
            class="text-sm font-semibold text-slate-800"
          >
            ${u.nom || 'Sans nom'}
          </h4>

          <p
            class="text-xs text-slate-400"
          >
            ${u.email || ''}
          </p>

        </div>

      </div>


      <button
        type="button"
        class="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg"
      >
        Discuter
      </button>
    `;


    item.addEventListener(
      'click',
      async () => {

        try {

          document
            .getElementById(
              'search-modal'
            )
            ?.classList.add(
              'hidden'
            );


          const moi =
            AppState.currentProfile ||
            AppState.currentUser;


          if (
            !moi ||
            !moi.email
          ) {

            throw new Error(
              'Impossible de déterminer l\'email de l\'utilisateur connecté.'
            );

          }


          if (
            !u ||
            !u.email
          ) {

            throw new Error(
              'Cet utilisateur ne possède pas d\'adresse email.'
            );

          }


          const conv =
            await ConversationsService.demarrerConversation(
              moi,
              u
            );


          ouvrirConversation(
            conv,
            u
          );

        } catch (err) {

          console.error(
            'Erreur création conversation:',
            err
          );


          alert(
            'Impossible d\'ouvrir cette conversation : ' +
            err.message
          );

        }

      }
    );


    container.appendChild(
      item
    );

  });

}


// ============================================================
// RÉSULTATS DE RECHERCHE UTILISATEURS
// ============================================================

function renderUserSearchResults(
  users
) {

  const dropdown =
    document.getElementById(
      'search-results-dropdown'
    );


  if (!dropdown) {

    return;

  }


  if (
    !users ||
    users.length === 0
  ) {

    dropdown.classList.add(
      'hidden'
    );

    dropdown.innerHTML =
      '';

    return;

  }


  dropdown.classList.remove(
    'hidden'
  );


  dropdown.innerHTML =
    '';


  users.forEach((u) => {

    const avatar =
      UsersService.getAvatarProps(
        u.nom,
        u.email
      );


    const row =
      document.createElement('div');


    row.className =
      'flex items-center gap-3 p-2.5 hover:bg-slate-100 cursor-pointer rounded-lg';


    row.innerHTML = `
      <div
        class="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white text-xs"
        style="background-color: ${avatar.bgColor}"
      >
        ${
          u.photoUrl
            ? `
              <img
                src="${u.photoUrl}"
                alt="${u.nom || 'Utilisateur'}"
                class="w-full h-full object-cover rounded-full"
              >
            `
            : avatar.initials
        }
      </div>


      <div class="min-w-0 flex-1">

        <p
          class="text-xs font-semibold text-slate-800 truncate"
        >
          ${u.nom || 'Utilisateur'}
        </p>

        <p
          class="text-[11px] text-slate-400 truncate"
        >
          ${u.email || ''}
        </p>

      </div>
    `;


    row.addEventListener(
      'click',
      async () => {

        try {

          dropdown.classList.add(
            'hidden'
          );


          const input =
            document.getElementById(
              'user-search-input'
            );


          if (input) {

            input.value =
              '';

          }


          const moi =
            AppState.currentProfile ||
            AppState.currentUser;


          if (
            !moi ||
            !moi.email
          ) {

            throw new Error(
              'Impossible de déterminer l\'email de l\'utilisateur connecté.'
            );

          }


          if (
            !u ||
            !u.email
          ) {

            throw new Error(
              'Cet utilisateur ne possède pas d\'adresse email.'
            );

          }


          const conv =
            await ConversationsService.demarrerConversation(
              moi,
              u
            );


          ouvrirConversation(
            conv,
            u
          );

        } catch (err) {

          console.error(
            'Erreur ouverture conversation:',
            err
          );


          alert(
            'Impossible d\'ouvrir cette conversation : ' +
            err.message
          );

        }

      }
    );


    dropdown.appendChild(
      row
    );

  });

}
