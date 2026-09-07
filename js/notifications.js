/**
 * LUMA — Module Notifications
 * Notifications sonores douces, Web Notifications et bannières in-app
 */

export const NotificationsService = {
  audioContext: null,

  /**
   * Joue un carillon subtil et agréable généré par Web Audio API
   */
  jouerSonMessage() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, this.audioContext.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880.0, this.audioContext.currentTime + 0.08); // A5

      gain.gain.setValueAtTime(0.08, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start();
      osc.stop(this.audioContext.currentTime + 0.35);
    } catch (e) {
      // Ignorer silencieusement si bloqué par les politiques de lecture automatique du navigateur
    }
  },

  /**
   * Demande la permission pour les notifications système du navigateur
   */
  async demanderPermission() {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission !== 'denied') {
      return await Notification.requestPermission();
    }
    return Notification.permission;
  },

  /**
   * Affiche une notification système (si fenêtre en arrière-plan)
   */
  afficherNotificationSysteme(expediteurNom, texte) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted' && document.hidden) {
      try {
        new Notification(`LUMA • ${expediteurNom}`, {
          body: texte.slice(0, 100),
          icon: '/public/icon.svg',
          badge: '/public/icon.svg',
          tag: 'luma-message',
        });
      } catch (e) {
        console.warn('Erreur notification système:', e);
      }
    }
  },

  /**
   * Met à jour le titre du document avec le nombre de messages non lus
   */
  mettreAJourBadgeTitre(totalNonLus) {
    const baseTitle = 'LUMA — Messagerie Lumesys';
    if (totalNonLus > 0) {
      document.title = `(${totalNonLus}) ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }
  },
};
