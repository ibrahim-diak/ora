/**
 * LUMA — Module de Gestion du Chat (chat.js)
 * Contrôleur temps réel pour chat.html
 */

import { AuthService } from './auth.js';
import { Database } from './database.js';
import { UsersService } from './users.js';
import { ConversationsService } from './conversations.js';
import { MessagesService } from './messages.js';
import { NotificationsService } from './notifications.js';

export const ChatController = {
  currentUser: null,
  currentProfile: null,
  activeConversation: null,
  activeRecipient: null,
  conversations: [],
  activeMessages: [],
  unsubscribeConversations: null,
  unsubscribeMessages: null,
  soundEnabled: true,

  /**
   * Initialise le contrôleur sur chat.html
   */
  init() {
    AuthService.init((user, profile) => {
      this.currentUser = user;
      this.currentProfile = profile;

      if (!user) {
        // Redirection vers login.html avec chemin relatif compatible GitHub Pages
        window.location.href = './login.html';
        return;
      }

      this.setupDOM();
      this.renderCurrentUserHeader();
      this.startConversationsListener();
      NotificationsService.demanderPermission();
    });
  },

  setupDOM() {
    // Bouton de déconnexion
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await AuthService.deconnexion();
        window.location.href = './login.html';
      });
    }

    // Bouton sonore
    const soundToggle = document.getElementById('sound-toggle-btn');
    if (soundToggle) {
      soundToggle.addEventListener('click', () => {
        this.soundEnabled = !this.soundEnabled;
        soundToggle.classList.toggle('text-teal-700', this.soundEnabled);
        soundToggle.classList.toggle('text-slate-400', !this.soundEnabled);
      });
    }

    // Formulaire d'envoi de message
    const sendBtn = document.getElementById('send-message-btn');
    const msgInput = document.getElementById('message-textarea');

    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.sendMessage());
    }

    if (msgInput) {
      msgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      // Auto-resize
      msgInput.addEventListener('input', () => {
        msgInput.style.height = 'auto';
        msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
      });
    }

    // Recherche d'utilisateurs Lumesys
    const searchInput = document.getElementById('user-search-field');
    let timeout = null;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(timeout);
        const query = e.target.value;
        timeout = setTimeout(async () => {
          if (!this.currentUser) return;
          const results = await UsersService.rechercher(query, this.currentUser.uid);
          this.renderSearchResults(results);
        }, 300);
      });
    }

    // Modale nouvelle discussion
    const newChatBtn = document.getElementById('open-new-chat-modal');
    const modal = document.getElementById('new-chat-modal');
    const closeModalBtn = document.getElementById('close-new-chat-modal');

    if (newChatBtn && modal) {
      newChatBtn.addEventListener('click', async () => {
        modal.classList.remove('hidden');
        if (this.currentUser) {
          const users = await Database.listerUtilisateursRecents(this.currentUser.uid);
          this.renderModalUsers(users);
        }
      });
    }

    if (closeModalBtn && modal) {
      closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }

    // Bouton retour sur mobile
    const mobileBackBtn = document.getElementById('mobile-back-btn');
    if (mobileBackBtn) {
      mobileBackBtn.addEventListener('click', () => {
        this.toggleMobileView('sidebar');
      });
    }
  },

  renderCurrentUserHeader() {
    const user = this.currentProfile || this.currentUser;
    if (!user) return;

    const nameEl = document.getElementById('sidebar-user-name');
    const avatarEl = document.getElementById('sidebar-user-avatar');

    const displayName = user.nom || user.displayName || user.email || 'Utilisateur';
    if (nameEl) nameEl.textContent = displayName;

    if (avatarEl) {
      const avatarProps = UsersService.getAvatarProps(displayName, user.email);
      if (user.photoUrl || user.photoURL) {
        avatarEl.innerHTML = `<img src="${user.photoUrl || user.photoURL}" alt="${displayName}" class="w-full h-full object-cover rounded-full">`;
      } else {
        avatarEl.textContent = avatarProps.initials;
        avatarEl.style.backgroundColor = avatarProps.bgColor;
      }
    }
  },

  startConversationsListener() {
    if (this.unsubscribeConversations) {
      this.unsubscribeConversations();
    }

    const userId = this.currentUser.uid;
    this.unsubscribeConversations = ConversationsService.abonnerConversations(
      userId,
      (conversations) => {
        this.conversations = conversations;
        this.renderConversationsList(conversations);

        // Somme des non lus
        let totalUnread = 0;
        conversations.forEach((c) => {
          if (c.nonLus && c.nonLus[userId]) {
            totalUnread += c.nonLus[userId];
          }
        });
        NotificationsService.mettreAJourBadgeTitre(totalUnread);

        // Mettre à jour la conversation active si ouverte
        if (this.activeConversation) {
          const updated = conversations.find((c) => c.id === this.activeConversation.id);
          if (updated) this.activeConversation = updated;
        }
      },
      (err) => console.warn('Erreur écoute conversations:', err)
    );
  },

  renderConversationsList(conversations) {
    const container = document.getElementById('conversations-container');
    if (!container) return;

    if (!conversations || conversations.length === 0) {
      container.innerHTML = `
        <div class="p-6 text-center text-slate-400 text-xs">
          <svg class="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p class="font-medium">Aucune discussion active</p>
          <p class="text-[11px] text-slate-400 mt-1">Cliquez sur "+" pour entamer une discussion avec un collègue Lumesys.</p>
        </div>
      `;
      return;
    }

    const currentUserId = this.currentUser.uid;
    container.innerHTML = '';

    conversations.forEach((conv) => {
      const recipient = ConversationsService.getAutreParticipant(conv, currentUserId);
      if (!recipient) return;

      const isActive = this.activeConversation?.id === conv.id;
      const unreadCount = (conv.nonLus && conv.nonLus[currentUserId]) || 0;
      const avatarProps = UsersService.getAvatarProps(recipient.nom, recipient.email);
      const dateFormatted = ConversationsService.formaterDate(conv.dernierMessageDate || conv.misAJourLe);

      const item = document.createElement('div');
      item.className = `conversation-item ${isActive ? 'active' : ''} ${unreadCount > 0 ? 'unread' : ''}`;
      item.innerHTML = `
        <div class="relative shrink-0">
          <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-xs" style="background-color: ${avatarProps.bgColor}">
            ${recipient.photoUrl ? `<img src="${recipient.photoUrl}" alt="${recipient.nom}" class="w-full h-full object-cover rounded-full">` : avatarProps.initials}
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1 mb-0.5">
            <h4 class="text-xs font-semibold text-slate-800 truncate">${recipient.nom}</h4>
            <span class="text-[10px] text-slate-400 whitespace-nowrap shrink-0">${dateFormatted}</span>
          </div>
          <div class="flex items-center justify-between gap-1">
            <p class="text-[11px] truncate ${unreadCount > 0 ? 'text-teal-800 font-semibold' : 'text-slate-500'}">
              ${conv.dernierMessage ? MessagesService.echapperHtml(conv.dernierMessage) : 'Discussion créée'}
            </p>
            ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
          </div>
        </div>
      `;

      item.addEventListener('click', () => {
        this.openConversation(conv, recipient);
      });

      container.appendChild(item);
    });
  },

  async openConversation(conv, recipient) {
    this.activeConversation = conv;
    this.activeRecipient = recipient;
    this.toggleMobileView('chat');

    const emptyView = document.getElementById('chat-empty-panel');
    const activeView = document.getElementById('chat-active-panel');
    const nameEl = document.getElementById('active-recipient-name');
    const emailEl = document.getElementById('active-recipient-email');
    const avatarEl = document.getElementById('active-recipient-avatar');

    if (emptyView) emptyView.classList.add('hidden');
    if (activeView) activeView.classList.remove('hidden');

    if (nameEl) nameEl.textContent = recipient.nom;
    if (emailEl) emailEl.textContent = recipient.email || 'Membre Lumesys';

    if (avatarEl) {
      const avatarProps = UsersService.getAvatarProps(recipient.nom, recipient.email);
      if (recipient.photoUrl) {
        avatarEl.innerHTML = `<img src="${recipient.photoUrl}" alt="${recipient.nom}" class="w-full h-full object-cover rounded-full">`;
      } else {
        avatarEl.textContent = avatarProps.initials;
        avatarEl.style.backgroundColor = avatarProps.bgColor;
      }
    }

    // Marquer la conversation comme lue
    const currentUserId = this.currentUser.uid;
    ConversationsService.marquerLue(conv.id, currentUserId);

    // Écoute des messages
    if (this.unsubscribeMessages) {
      this.unsubscribeMessages();
    }

    const timeline = document.getElementById('messages-timeline');
    if (timeline) {
      timeline.innerHTML = `
        <div class="flex items-center justify-center h-32 text-slate-400 text-xs">
          <div class="animate-spin rounded-full h-5 w-5 border-2 border-teal-600 border-t-transparent mr-2"></div>
          Chargement des messages...
        </div>
      `;
    }

    let isInitialLoad = true;
    this.unsubscribeMessages = MessagesService.abonnerMessages(
      conv.id,
      (messages) => {
        this.activeMessages = messages;
        this.renderTimeline(messages);

        if (!isInitialLoad && messages.length > 0) {
          const last = messages[messages.length - 1];
          if (last.expediteurId !== currentUserId) {
            if (this.soundEnabled) NotificationsService.jouerSonMessage();
            NotificationsService.afficherNotificationSysteme(recipient.nom, last.contenu);
          }
        }
        isInitialLoad = false;

        // Marquer les nouveaux messages comme lus
        MessagesService.marquerCommeLus(conv.id, currentUserId, messages);
      },
      (err) => console.warn('Erreur écoute messages:', err)
    );

    // Mettre à jour la sélection visuelle
    this.renderConversationsList(this.conversations);
  },

  renderTimeline(messages) {
    const timeline = document.getElementById('messages-timeline');
    if (!timeline) return;

    if (!messages || messages.length === 0) {
      timeline.innerHTML = `
        <div class="flex flex-col items-center justify-center h-48 text-center text-slate-400">
          <div class="w-10 h-10 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mb-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
          </div>
          <p class="text-xs font-semibold text-slate-600">Début de la discussion</p>
          <p class="text-[11px] text-slate-400">Envoyez un premier message à ${this.activeRecipient?.nom || 'ce membre'}.</p>
        </div>
      `;
      return;
    }

    const currentUserId = this.currentUser.uid;
    timeline.innerHTML = '';

    let currentDayLabel = '';

    messages.forEach((msg) => {
      const msgDay = MessagesService.formaterJour(msg.dateEnvoi);
      if (msgDay !== currentDayLabel) {
        currentDayLabel = msgDay;
        const divider = document.createElement('div');
        divider.className = 'day-divider';
        divider.innerHTML = `<span class="day-divider-pill">${msgDay}</span>`;
        timeline.appendChild(divider);
      }

      const isMine = msg.expediteurId === currentUserId;
      const timeStr = MessagesService.formaterHeure(msg.dateEnvoi);
      const isRead = msg.luPar && msg.luPar.length > 1;

      const row = document.createElement('div');
      row.className = `message-row ${isMine ? 'sent' : 'received'}`;
      row.innerHTML = `
        <div class="message-bubble ${isMine ? 'sent' : 'received'}">
          <div>${MessagesService.echapperHtml(msg.contenu)}</div>
          <div class="message-meta">
            <span>${timeStr}</span>
            ${isMine ? `<span title="${isRead ? 'Lu' : 'Délivré'}">${isRead ? '✓✓' : '✓'}</span>` : ''}
          </div>
        </div>
      `;

      timeline.appendChild(row);
    });

    timeline.scrollTop = timeline.scrollHeight;
  },

  async sendMessage() {
    const input = document.getElementById('message-textarea');
    if (!input) return;

    const text = input.value.trim();
    if (!text || !this.activeConversation || !this.currentUser) return;

    input.value = '';
    input.style.height = 'auto';

    try {
      await MessagesService.envoyer(
        this.activeConversation.id,
        this.currentProfile || this.currentUser,
        text
      );
    } catch (err) {
      console.error('Erreur envoi message:', err);
      this.showToast('Échec de l\'envoi du message.');
    }
  },

  showToast(message) {
    let toast = document.getElementById('chat-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'chat-toast';
      toast.className = 'fixed bottom-4 right-4 z-50 bg-rose-600 text-white text-xs px-4 py-2 rounded-xl shadow-lg transition-opacity duration-300';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove('hidden', 'opacity-0');
    setTimeout(() => {
      toast.classList.add('opacity-0');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3000);
  },

  toggleMobileView(view) {
    const sidebar = document.getElementById('chat-sidebar-pane');
    const main = document.getElementById('chat-main-pane');

    if (view === 'sidebar') {
      if (sidebar) sidebar.classList.remove('hidden');
      if (main) main.classList.add('hidden');
    } else {
      if (sidebar) sidebar.classList.add('hidden', 'md:flex');
      if (main) main.classList.remove('hidden');
    }
  },

  renderSearchResults(users) {
    const dropdown = document.getElementById('search-dropdown');
    if (!dropdown) return;

    if (!users || users.length === 0) {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
      return;
    }

    dropdown.classList.remove('hidden');
    dropdown.innerHTML = '';

    users.forEach((u) => {
      const avatarProps = UsersService.getAvatarProps(u.nom, u.email);
      const row = document.createElement('div');
      row.className = 'flex items-center gap-2.5 p-2 hover:bg-slate-100 cursor-pointer rounded-lg text-left';
      row.innerHTML = `
        <div class="w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-[10px]" style="background-color: ${avatarProps.bgColor}">
          ${avatarProps.initials}
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-semibold text-slate-800 truncate">${u.nom}</p>
          <p class="text-[10px] text-slate-400 truncate">${u.email || ''}</p>
        </div>
      `;

      row.addEventListener('click', async () => {
        dropdown.classList.add('hidden');
        document.getElementById('user-search-field').value = '';
        const conv = await ConversationsService.demarrerConversation(
          this.currentProfile || this.currentUser,
          u
        );
        this.openConversation(conv, u);
      });

      dropdown.appendChild(row);
    });
  },

  renderModalUsers(users) {
    const container = document.getElementById('modal-users-container');
    if (!container) return;

    if (!users || users.length === 0) {
      container.innerHTML = `<div class="p-6 text-center text-slate-400 text-xs">Aucun autre utilisateur trouvé dans la collection <code>utilisateurs</code>.</div>`;
      return;
    }

    container.innerHTML = '';
    users.forEach((u) => {
      const avatarProps = UsersService.getAvatarProps(u.nom, u.email);
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between p-2.5 hover:bg-slate-50 border border-slate-100 rounded-xl cursor-pointer';
      row.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-xs" style="background-color: ${avatarProps.bgColor}">
            ${avatarProps.initials}
          </div>
          <div>
            <h5 class="text-xs font-bold text-slate-800">${u.nom}</h5>
            <p class="text-[11px] text-slate-400">${u.email || ''}</p>
          </div>
        </div>
        <button class="px-2.5 py-1 bg-teal-700 text-white rounded-lg text-xs font-medium">Contacter</button>
      `;

      row.addEventListener('click', async () => {
        document.getElementById('new-chat-modal')?.classList.add('hidden');
        const conv = await ConversationsService.demarrerConversation(
          this.currentProfile || this.currentUser,
          u
        );
        this.openConversation(conv, u);
      });

      container.appendChild(row);
    });
  },
};
