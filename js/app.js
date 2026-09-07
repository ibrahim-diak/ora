/**
 * LUMA — Contrôleur Principal de l'Application
 * Orchestration des vues, événements DOM, temps réel et synchronisation
 */

import { initFirebase, saveFirebaseConfig, getStoredFirebaseConfig, testConnection } from './firebase-config.js';
import { AuthService } from './auth.js';
import { Database } from './database.js';
import { UsersService } from './users.js';
import { ConversationsService } from './conversations.js';
import { MessagesService } from './messages.js';
import { NotificationsService } from './notifications.js';
import { StorageService } from './storage.js';

// État global de l'application
const AppState = {
  currentUser: null,
  currentProfile: null,
  activeConversation: null,
  activeRecipient: null,
  conversations: [],
  activeMessages: [],
  unsubscribeConversations: null,
  unsubscribeMessages: null,
  mobileView: 'sidebar', // 'sidebar' ou 'chat'
};

// Initialisation au chargement du DOM
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  setupEventListeners();
  checkFirebaseStatus();
  AuthService.init(handleAuthStateChanged);

  // Enregistrement du Service Worker pour PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/public/service-worker.js').catch((e) => {
      console.warn('Service Worker non enregistré:', e);
    });
  }
}

/**
 * Vérifie l'état de la connexion Firebase
 */
function checkFirebaseStatus() {
  const config = getStoredFirebaseConfig();
  const banner = document.getElementById('firebase-status-banner');
  const bannerText = document.getElementById('firebase-status-text');

  if (!config) {
    if (banner) {
      banner.classList.remove('hidden');
      if (bannerText) {
        bannerText.innerHTML = `
          <strong>Configuration Firebase requise :</strong> Pour connecter LUMA à la base Lumesys (collection <code>utilisateurs</code>), veuillez renseigner votre configuration Firebase.
        `;
      }
    }
  } else {
    if (banner) banner.classList.add('hidden');
    testConnection();
  }
}

/**
 * Gestion du changement d'état d'authentification
 */
function handleAuthStateChanged(user, profile) {
  AppState.currentUser = user;
  AppState.currentProfile = profile;

  const authModal = document.getElementById('auth-modal');
  const appContainer = document.getElementById('luma-app');

  if (user) {
    if (authModal) authModal.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');

    renderCurrentUserUI(profile || user);
    demarrerEcouteConversations(user.uid);
    NotificationsService.demanderPermission();
  } else {
    arreterEcoutes();
    if (authModal) authModal.classList.remove('hidden');
    if (appContainer) appContainer.classList.add('hidden');
    AppState.activeConversation = null;
    AppState.activeRecipient = null;
  }
}

/**
 * Met à jour l'affichage de l'utilisateur connecté dans la barre latérale
 */
function renderCurrentUserUI(user) {
  const nameEl = document.getElementById('current-user-name');
  const avatarEl = document.getElementById('current-user-avatar');
  const statusDot = document.getElementById('current-user-status-dot');

  const displayName = user.nom || user.displayName || user.email || 'Utilisateur';
  if (nameEl) nameEl.textContent = displayName;

  if (avatarEl) {
    const avatar = UsersService.getAvatarProps(displayName, user.email);
    if (user.photoUrl || user.photoURL) {
      avatarEl.innerHTML = `<img src="${user.photoUrl || user.photoURL}" alt="${displayName}" class="w-full h-full object-cover rounded-full">`;
    } else {
      avatarEl.textContent = avatar.initials;
      avatarEl.style.backgroundColor = avatar.bgColor;
    }
  }

  if (statusDot) {
    statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white';
  }
}

/**
 * Lance l'écoute en direct des conversations
 */
function demarrerEcouteConversations(userId) {
  if (AppState.unsubscribeConversations) {
    AppState.unsubscribeConversations();
  }

  AppState.unsubscribeConversations = ConversationsService.abonnerConversations(
    userId,
    (conversations) => {
      AppState.conversations = conversations;
      renderConversationsList(conversations);

      // Calcul du total des messages non lus
      let totalNonLus = 0;
      conversations.forEach((c) => {
        if (c.nonLus && c.nonLus[userId]) {
          totalNonLus += c.nonLus[userId];
        }
      });
      NotificationsService.mettreAJourBadgeTitre(totalNonLus);

      // Si une conversation active existe, mettre à jour son état
      if (AppState.activeConversation) {
        const updated = conversations.find((c) => c.id === AppState.activeConversation.id);
        if (updated) {
          AppState.activeConversation = updated;
        }
      }
    },
    (err) => {
      console.warn('Erreur abonnement conversations:', err);
    }
  );
}

/**
 * Rend la liste des conversations dans la barre latérale
 */
function renderConversationsList(conversations) {
  const container = document.getElementById('conversations-list');
  if (!container) return;

  if (!conversations || conversations.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-500">
        <svg class="w-12 h-12 mx-auto mb-3 text-slate-400 stroke-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p class="text-sm font-medium">Aucune conversation pour l'instant</p>
        <p class="text-xs text-slate-400 mt-1">Recherchez un utilisateur Lumesys pour entamer une discussion.</p>
      </div>
    `;
    return;
  }

  const currentUserId = AppState.currentUser?.uid;
  container.innerHTML = '';

  conversations.forEach((conv) => {
    const autre = ConversationsService.getAutreParticipant(conv, currentUserId);
    if (!autre) return;

    const isActive = AppState.activeConversation?.id === conv.id;
    const nonLus = (conv.nonLus && conv.nonLus[currentUserId]) || 0;
    const avatar = UsersService.getAvatarProps(autre.nom, autre.email);
    const dateFormatted = ConversationsService.formaterDate(conv.dernierMessageDate || conv.misAJourLe);

    const item = document.createElement('div');
    item.className = `flex items-center gap-3 p-3.5 rounded-xl cursor-pointer transition-colors border ${
      isActive
        ? 'bg-teal-50/80 border-teal-200 text-slate-900 shadow-xs'
        : 'hover:bg-slate-100/70 border-transparent text-slate-700'
    }`;
    item.id = `conv-item-${conv.id}`;

    item.innerHTML = `
      <div class="relative shrink-0">
        <div class="w-12 h-12 rounded-full flex items-center justify-center font-semibold text-white text-sm" style="background-color: ${avatar.bgColor}">
          ${autre.photoUrl ? `<img src="${autre.photoUrl}" alt="${autre.nom}" class="w-full h-full object-cover rounded-full">` : avatar.initials}
        </div>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between gap-1 mb-1">
          <h4 class="text-sm font-semibold truncate ${nonLus > 0 ? 'text-slate-900' : 'text-slate-800'}">${autre.nom}</h4>
          <span class="text-xs text-slate-400 whitespace-nowrap shrink-0">${dateFormatted}</span>
        </div>
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs truncate ${nonLus > 0 ? 'font-semibold text-teal-700' : 'text-slate-500'}">
            ${conv.dernierMessage ? MessagesService.echapperHtml(conv.dernierMessage) : '<em>Nouvelle discussion créée</em>'}
          </p>
          ${nonLus > 0 ? `<span class="px-2 py-0.5 text-xs font-bold bg-teal-600 text-white rounded-full shrink-0">${nonLus}</span>` : ''}
        </div>
      </div>
    `;

    item.addEventListener('click', () => {
      ouvrirConversation(conv, autre);
    });

    container.appendChild(item);
  });
}

/**
 * Ouvre une conversation et lance l'écoute temps réel de ses messages
 */
async function ouvrirConversation(conv, destinataire) {
  AppState.activeConversation = conv;
  AppState.activeRecipient = destinataire;
  setMobileView('chat');

  // Mise à jour de l'en-tête de la zone de chat
  const headerName = document.getElementById('chat-header-name');
  const headerStatus = document.getElementById('chat-header-status');
  const headerAvatar = document.getElementById('chat-header-avatar');
  const emptyState = document.getElementById('chat-empty-state');
  const activeArea = document.getElementById('chat-active-area');

  if (emptyState) emptyState.classList.add('hidden');
  if (activeArea) activeArea.classList.remove('hidden');

  if (headerName) headerName.textContent = destinataire.nom;
  if (headerStatus) headerStatus.textContent = destinataire.email || 'Membre Lumesys';

  if (headerAvatar) {
    const avatar = UsersService.getAvatarProps(destinataire.nom, destinataire.email);
    if (destinataire.photoUrl) {
      headerAvatar.innerHTML = `<img src="${destinataire.photoUrl}" alt="${destinataire.nom}" class="w-full h-full object-cover rounded-full">`;
    } else {
      headerAvatar.textContent = avatar.initials;
      headerAvatar.style.backgroundColor = avatar.bgColor;
    }
  }

  // Marquer comme lue
  const currentUserId = AppState.currentUser?.uid;
  if (currentUserId) {
    ConversationsService.marquerLue(conv.id, currentUserId);
  }

  // Écouter les messages en direct
  if (AppState.unsubscribeMessages) {
    AppState.unsubscribeMessages();
  }

  const messagesContainer = document.getElementById('messages-scroll-area');
  if (messagesContainer) {
    messagesContainer.innerHTML = `
      <div class="flex items-center justify-center h-48 text-slate-400">
        <div class="animate-spin rounded-full h-6 w-6 border-2 border-teal-600 border-t-transparent"></div>
      </div>
    `;
  }

  let isFirstLoad = true;

  AppState.unsubscribeMessages = MessagesService.abonnerMessages(
    conv.id,
    (messages) => {
      AppState.activeMessages = messages;
      renderMessagesTimeline(messages);

      // Notification sonore si nouveau message reçu d'un autre utilisateur
      if (!isFirstLoad && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.expediteurId !== currentUserId) {
          NotificationsService.jouerSonMessage();
          NotificationsService.afficherNotificationSysteme(destinataire.nom, lastMsg.contenu);
        }
      }
      isFirstLoad = false;

      // Marquer automatiquement les messages non lus
      if (currentUserId) {
        MessagesService.marquerCommeLus(conv.id, currentUserId, messages);
      }
    },
    (err) => {
      console.warn('Erreur écoute messages:', err);
    }
  );

  // Mettre l'accent visuel dans la barre latérale
  renderConversationsList(AppState.conversations);
}

/**
 * Rend l'historique des messages avec séparateurs chronologiques et bulles
 */
function renderMessagesTimeline(messages) {
  const container = document.getElementById('messages-scroll-area');
  if (!container) return;

  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-64 text-slate-400 text-center p-4">
        <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2">
          <svg class="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/>
          </svg>
        </div>
        <p class="text-sm font-medium text-slate-600">Début de votre conversation</p>
        <p class="text-xs text-slate-400 mt-0.5">Envoyez le premier message à ${AppState.activeRecipient?.nom || 'ce contact'}.</p>
      </div>
    `;
    return;
  }

  const currentUserId = AppState.currentUser?.uid;
  container.innerHTML = '';

  let currentDay = '';

  messages.forEach((msg) => {
    const msgDay = MessagesService.formaterJour(msg.dateEnvoi);
    if (msgDay !== currentDay) {
      currentDay = msgDay;
      const dayDivider = document.createElement('div');
      dayDivider.className = 'flex items-center justify-center my-4';
      dayDivider.innerHTML = `
        <span class="px-3 py-1 bg-slate-200/70 text-slate-600 text-xs font-medium rounded-full backdrop-blur-xs">
          ${msgDay}
        </span>
      `;
      container.appendChild(dayDivider);
    }

    const isMine = msg.expediteurId === currentUserId;
    const timeFormatted = MessagesService.formaterHeure(msg.dateEnvoi);
    const isRead = msg.luPar && msg.luPar.length > 1;

    const row = document.createElement('div');
    row.className = `flex w-full mb-3 ${isMine ? 'justify-end' : 'justify-start'}`;

    row.innerHTML = `
      <div class="max-w-[80%] md:max-w-[65%] flex flex-col ${isMine ? 'items-end' : 'items-start'}">
        <div class="px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-2xs ${
          isMine
            ? 'bg-teal-700 text-white rounded-br-xs'
            : 'bg-white text-slate-900 border border-slate-200/80 rounded-bl-xs'
        }">
          <p class="whitespace-pre-wrap break-words">${MessagesService.echapperHtml(msg.contenu)}</p>
          <div class="flex items-center justify-end gap-1 mt-1 text-[10px] ${isMine ? 'text-teal-200' : 'text-slate-400'}">
            <span>${timeFormatted}</span>
            ${
              isMine
                ? `<span title="${isRead ? 'Lu' : 'Envoyé'}">
                    ${isRead ? '✓✓' : '✓'}
                   </span>`
                : ''
            }
          </div>
        </div>
      </div>
    `;

    container.appendChild(row);
  });

  // Défilement automatique vers le bas
  container.scrollTop = container.scrollHeight;
}

/**
 * Envoie le message saisi par l'utilisateur
 */
async function envoyerMessageActif() {
  const input = document.getElementById('message-input');
  if (!input) return;

  const contenu = input.value.trim();
  if (!contenu || !AppState.activeConversation || !AppState.currentUser) return;

  input.value = '';
  input.style.height = 'auto';

  try {
    await MessagesService.envoyer(
      AppState.activeConversation.id,
      AppState.currentProfile || AppState.currentUser,
      contenu
    );
  } catch (err) {
    console.error('Erreur lors de l\'envoi du message:', err);
    alert('Impossible d\'envoyer le message. Veuillez vérifier votre connexion.');
  }
}

/**
 * Déconnexion propre
 */
function arreterEcoutes() {
  if (AppState.unsubscribeConversations) {
    AppState.unsubscribeConversations();
    AppState.unsubscribeConversations = null;
  }
  if (AppState.unsubscribeMessages) {
    AppState.unsubscribeMessages();
    AppState.unsubscribeMessages = null;
  }
}

/**
 * Gestion de la vue mobile (bascule Sidebar <-> Chat)
 */
function setMobileView(view) {
  AppState.mobileView = view;
  const sidebar = document.getElementById('sidebar-pane');
  const chat = document.getElementById('chat-pane');

  if (view === 'sidebar') {
    if (sidebar) sidebar.classList.remove('hidden');
    if (chat) chat.classList.add('hidden');
  } else {
    if (sidebar) sidebar.classList.add('hidden', 'md:flex');
    if (chat) chat.classList.remove('hidden');
  }
}

/**
 * Configuration des écouteurs d'événements
 */
function setupEventListeners() {
  // 1. Bouton Retour mobile
  const backBtn = document.getElementById('chat-back-button');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      setMobileView('sidebar');
    });
  }

  // 2. Envoi message (bouton et touche Entrée)
  const sendBtn = document.getElementById('message-send-button');
  if (sendBtn) {
    sendBtn.addEventListener('click', envoyerMessageActif);
  }

  const msgInput = document.getElementById('message-input');
  if (msgInput) {
    msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        envoyerMessageActif();
      }
    });

    // Redimensionnement automatique de la zone de texte
    msgInput.addEventListener('input', () => {
      msgInput.style.height = 'auto';
      msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
    });
  }

  // 3. Recherche d'utilisateurs Lumesys
  const searchInput = document.getElementById('user-search-input');
  let searchTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value;
      searchTimeout = setTimeout(async () => {
        if (!AppState.currentUser) return;
        const resultats = await UsersService.rechercher(query, AppState.currentUser.uid);
        renderUserSearchResults(resultats);
      }, 300);
    });
  }

  // 4. Bouton Nouvelle Discussion
  const newChatBtn = document.getElementById('new-chat-button');
  const searchModal = document.getElementById('search-modal');
  const closeSearchBtn = document.getElementById('close-search-modal');

  if (newChatBtn && searchModal) {
    newChatBtn.addEventListener('click', async () => {
      searchModal.classList.remove('hidden');
      if (AppState.currentUser) {
        const users = await Database.listerUtilisateursRecents(AppState.currentUser.uid);
        renderModalUserList(users);
      }
    });
  }

  if (closeSearchBtn && searchModal) {
    closeSearchBtn.addEventListener('click', () => {
      searchModal.classList.add('hidden');
    });
  }

  // 5. Authentification (Formulaires et Boutons)
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const toggleAuthBtn = document.getElementById('toggle-auth-mode');
  const googleLoginBtn = document.getElementById('google-login-button');
  const logoutBtn = document.getElementById('logout-button');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const pass = document.getElementById('login-password').value;
      const errorEl = document.getElementById('auth-error-msg');
      if (errorEl) errorEl.textContent = '';

      try {
        await AuthService.connexionEmail(email, pass);
      } catch (err) {
        if (errorEl) errorEl.textContent = 'Identifiants invalides ou compte inexistant : ' + err.message;
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nom = document.getElementById('signup-name').value;
      const email = document.getElementById('signup-email').value;
      const pass = document.getElementById('signup-password').value;
      const errorEl = document.getElementById('auth-error-msg');
      if (errorEl) errorEl.textContent = '';

      try {
        await AuthService.inscriptionEmail(email, pass, nom);
      } catch (err) {
        if (errorEl) errorEl.textContent = 'Erreur lors de la création du compte : ' + err.message;
      }
    });
  }

  if (toggleAuthBtn) {
    toggleAuthBtn.addEventListener('click', () => {
      const isLoginVisible = !loginForm.classList.contains('hidden');
      if (isLoginVisible) {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        toggleAuthBtn.textContent = 'Vous avez déjà un compte ? Se connecter';
      } else {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        toggleAuthBtn.textContent = 'Nouveau sur Lumesys ? Créer un compte';
      }
    });
  }

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
      const errorEl = document.getElementById('auth-error-msg');
      if (errorEl) errorEl.textContent = '';
      try {
        await AuthService.connexionGoogle();
      } catch (err) {
        if (errorEl) errorEl.textContent = 'Erreur Google Sign-in : ' + err.message;
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      AuthService.deconnexion();
    });
  }

  // 6. Configuration Firebase Modal
  const configBtn = document.getElementById('config-button');
  const configModal = document.getElementById('config-modal');
  const closeConfigBtn = document.getElementById('close-config-modal');
  const configForm = document.getElementById('config-form');

  if (configBtn && configModal) {
    configBtn.addEventListener('click', () => {
      const stored = getStoredFirebaseConfig() || {};
      document.getElementById('cfg-api-key').value = stored.apiKey || '';
      document.getElementById('cfg-auth-domain').value = stored.authDomain || '';
      document.getElementById('cfg-project-id').value = stored.projectId || '';
      document.getElementById('cfg-storage-bucket').value = stored.storageBucket || '';
      document.getElementById('cfg-app-id').value = stored.appId || '';
      configModal.classList.remove('hidden');
    });
  }

  if (closeConfigBtn && configModal) {
    closeConfigBtn.addEventListener('click', () => {
      configModal.classList.add('hidden');
    });
  }

  if (configForm) {
    configForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newConfig = {
        apiKey: document.getElementById('cfg-api-key').value.trim(),
        authDomain: document.getElementById('cfg-auth-domain').value.trim(),
        projectId: document.getElementById('cfg-project-id').value.trim(),
        storageBucket: document.getElementById('cfg-storage-bucket').value.trim(),
        appId: document.getElementById('cfg-app-id').value.trim(),
      };

      if (saveFirebaseConfig(newConfig)) {
        window.location.reload();
      } else {
        alert('Erreur lors de l\'enregistrement de la configuration.');
      }
    });
  }
}

/**
 * Affiche la liste des utilisateurs trouvés dans la modale "Nouvelle discussion"
 */
function renderModalUserList(users) {
  const container = document.getElementById('modal-users-list');
  if (!container) return;

  if (!users || users.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-500 text-sm">
        Aucun autre utilisateur trouvé dans la collection <code>utilisateurs</code>.
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  users.forEach((u) => {
    const avatar = UsersService.getAvatarProps(u.nom, u.email);
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-slate-100';

    item.innerHTML = `
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white text-xs" style="background-color: ${avatar.bgColor}">
          ${u.photoUrl ? `<img src="${u.photoUrl}" alt="${u.nom}" class="w-full h-full object-cover rounded-full">` : avatar.initials}
        </div>
        <div>
          <h4 class="text-sm font-semibold text-slate-800">${u.nom || 'Sans nom'}</h4>
          <p class="text-xs text-slate-400">${u.email || ''}</p>
        </div>
      </div>
      <button class="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg">
        Discuter
      </button>
    `;

    item.addEventListener('click', async () => {
      document.getElementById('search-modal')?.classList.add('hidden');
      const conv = await ConversationsService.demarrerConversation(
        AppState.currentProfile || AppState.currentUser,
        u
      );
      ouvrirConversation(conv, u);
    });

    container.appendChild(item);
  });
}

/**
 * Affiche les résultats de la recherche dans la barre latérale
 */
function renderUserSearchResults(users) {
  const dropdown = document.getElementById('search-results-dropdown');
  if (!dropdown) return;

  if (!users || users.length === 0) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    return;
  }

  dropdown.classList.remove('hidden');
  dropdown.innerHTML = '';

  users.forEach((u) => {
    const avatar = UsersService.getAvatarProps(u.nom, u.email);
    const row = document.createElement('div');
    row.className = 'flex items-center gap-3 p-2.5 hover:bg-slate-100 cursor-pointer rounded-lg';
    row.innerHTML = `
      <div class="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-white text-xs" style="background-color: ${avatar.bgColor}">
        ${avatar.initials}
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-xs font-semibold text-slate-800 truncate">${u.nom}</p>
        <p class="text-[11px] text-slate-400 truncate">${u.email}</p>
      </div>
    `;

    row.addEventListener('click', async () => {
      dropdown.classList.add('hidden');
      document.getElementById('user-search-input').value = '';
      const conv = await ConversationsService.demarrerConversation(
        AppState.currentProfile || AppState.currentUser,
        u
      );
      ouvrirConversation(conv, u);
    });

    dropdown.appendChild(row);
  });
}
