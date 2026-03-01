// telegram-web-app.js - ПОЛНЫЙ ФАЙЛ ИНТЕГРАЦИИ С TELEGRAM

class TelegramWebApp {
    constructor() {
        this.tg = window.Telegram?.WebApp;
        this.user = null;
        this.token = null;
        this.theme = null;
        this.init();
    }

    async init() {
        try {
            if (this.tg) {
                console.log('✅ Telegram Web App detected');
                
                // Инициализация
                this.tg.ready();
                this.tg.expand();
                this.tg.disableVerticalSwipes();
                
                // Настройка главной кнопки
                this.tg.MainButton.setText('Закрыть');
                this.tg.MainButton.onClick(() => {
                    this.tg.close();
                });
                
                // Настройка кнопки назад
                this.tg.BackButton.onClick(() => {
                    this.tg.BackButton.hide();
                    window.history.back();
                });
                
                // Получаем тему
                this.theme = this.tg.themeParams;
                this.applyTheme();
                
                // Авторизация
                await this.authenticate();
                
                // Отправляем событие
                this.tg.ready();
                
            } else {
                console.warn('⚠️ Telegram Web App not found, using test mode');
                this.user = {
                    id: Math.floor(Math.random() * 1000000),
                    first_name: 'Тест',
                    last_name: 'Пользователь',
                    username: 'test_user',
                    photo_url: null,
                    language_code: 'ru'
                };
                this.token = 'test_token';
                this.applyTestTheme();
            }
            
            // Обновляем UI
            this.updateUserUI();
            
            // Скрываем загрузку
            setTimeout(() => {
                const loader = document.getElementById('tg-loading');
                if (loader) {
                    loader.style.opacity = '0';
                    setTimeout(() => {
                        loader.style.display = 'none';
                        document.getElementById('app').style.display = 'block';
                    }, 500);
                }
            }, 1000);
            
        } catch (error) {
            console.error('❌ Telegram init error:', error);
            this.showNotification('Ошибка инициализации', 'error');
        }
    }

    async authenticate() {
        try {
            const response = await fetch('/api/auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    initData: this.tg?.initData || ''
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.user = data.user;
                this.token = data.token;
                
                // Сохраняем в localStorage
                localStorage.setItem('tg_user', JSON.stringify(this.user));
                localStorage.setItem('tg_token', this.token);
                
                console.log('✅ Auth successful:', this.user.first_name);
            }
        } catch (error) {
            console.error('❌ Auth error:', error);
            
            // Пробуем восстановить из localStorage
            const savedUser = localStorage.getItem('tg_user');
            if (savedUser) {
                this.user = JSON.parse(savedUser);
                this.token = localStorage.getItem('tg_token');
            }
        }
    }

    applyTheme() {
        if (!this.tg || !this.theme) return;
        
        const root = document.documentElement;
        
        root.style.setProperty('--tg-bg', this.theme.bg_color || '#ffffff');
        root.style.setProperty('--tg-text', this.theme.text_color || '#1a2634');
        root.style.setProperty('--tg-button', this.theme.button_color || '#ff3366');
        root.style.setProperty('--tg-button-text', this.theme.button_text_color || '#ffffff');
        root.style.setProperty('--tg-hint', this.theme.hint_color || '#999999');
        root.style.setProperty('--tg-link', this.theme.link_color || '#2481cc');
        root.style.setProperty('--tg-secondary-bg', this.theme.secondary_bg_color || '#f0f0f0');
        
        console.log('✅ Theme applied');
    }

    applyTestTheme() {
        const root = document.documentElement;
        root.style.setProperty('--tg-bg', '#ffffff');
        root.style.setProperty('--tg-text', '#1a2634');
        root.style.setProperty('--tg-button', '#ff3366');
        root.style.setProperty('--tg-button-text', '#ffffff');
        root.style.setProperty('--tg-hint', '#999999');
        root.style.setProperty('--tg-link', '#2481cc');
        root.style.setProperty('--tg-secondary-bg', '#f0f0f0');
    }

    updateUserUI() {
        if (!this.user) return;
        
        // Обновляем аватар в шапке
        const tgUserElement = document.getElementById('tgUser');
        if (tgUserElement) {
            tgUserElement.innerHTML = this.getUserAvatarHTML(this.user, 40);
        }
        
        // Обновляем информацию в сайдбаре
        const tgSidebarInfo = document.getElementById('tgSidebarInfo');
        if (tgSidebarInfo) {
            tgSidebarInfo.innerHTML = `
                <div class="sidebar-user">
                    ${this.getUserAvatarHTML(this.user, 50)}
                    <div class="sidebar-user-info">
                        <div class="sidebar-user-name">${this.getUserDisplayName(this.user)}</div>
                        <div class="sidebar-user-username">@${this.user.username || 'user'}</div>
                    </div>
                </div>
            `;
        }
    }

    getUserAvatarHTML(user, size = 40) {
        if (user.photo_url) {
            return `<img src="${user.photo_url}" alt="Avatar" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;">`;
        } else {
            const initials = this.getInitials(user);
            return `<div class="avatar-placeholder" style="width:${size}px;height:${size}px;background:var(--tg-button);color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:${size/2}px;border-radius:50%;">${initials}</div>`;
        }
    }

    getUserDisplayName(user) {
        if (user.first_name && user.last_name) {
            return `${user.first_name} ${user.last_name}`;
        } else if (user.first_name) {
            return user.first_name;
        } else if (user.username) {
            return `@${user.username}`;
        } else {
            return 'Пользователь';
        }
    }

    getInitials(user) {
        if (user.first_name && user.last_name) {
            return (user.first_name[0] + user.last_name[0]).toUpperCase();
        } else if (user.first_name) {
            return user.first_name[0].toUpperCase();
        } else if (user.username) {
            return user.username[0].toUpperCase();
        } else {
            return '?';
        }
    }

    showNotification(message, type = 'info', duration = 3000) {
        const notification = document.getElementById('notification');
        if (!notification) return;
        
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.add('show');
        
        this.hapticFeedback('notification', type === 'success' ? 'success' : 'warning');
        
        setTimeout(() => {
            notification.classList.remove('show');
        }, duration);
    }

    share(text) {
        if (this.tg) {
            if (this.tg.shareToStory) {
                this.tg.shareToStory(text);
            } else if (this.tg.switchInlineQuery) {
                this.tg.switchInlineQuery(text, ['users']);
            } else {
                this.tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent('https://virusgift.pro')}&text=${encodeURIComponent(text)}`);
            }
        } else {
            window.open(`https://t.me/share/url?url=${encodeURIComponent('https://virusgift.pro')}&text=${encodeURIComponent(text)}`, '_blank');
        }
    }

    hapticFeedback(type = 'impact', style = 'medium') {
        if (this.tg?.HapticFeedback) {
            switch(type) {
                case 'impact':
                    this.tg.HapticFeedback.impactOccurred(style);
                    break;
                case 'notification':
                    this.tg.HapticFeedback.notificationOccurred(style);
                    break;
                case 'selection':
                    this.tg.HapticFeedback.selectionChanged();
                    break;
            }
        }
    }

    openLink(url) {
        if (this.tg) {
            this.tg.openLink(url);
        } else {
            window.open(url, '_blank');
        }
    }

    openTelegramLink(url) {
        if (this.tg) {
            this.tg.openTelegramLink(url);
        } else {
            window.open(url, '_blank');
        }
    }

    showMainButton(text = 'Закрыть', callback = null) {
        if (this.tg) {
            this.tg.MainButton.setText(text);
            this.tg.MainButton.show();
            if (callback) {
                this.tg.MainButton.onClick(callback);
            }
        }
    }

    hideMainButton() {
        if (this.tg) {
            this.tg.MainButton.hide();
        }
    }

    showBackButton(callback = null) {
        if (this.tg) {
            this.tg.BackButton.show();
            if (callback) {
                this.tg.BackButton.onClick(callback);
            }
        }
    }

    hideBackButton() {
        if (this.tg) {
            this.tg.BackButton.hide();
        }
    }

    setHeaderColor(color) {
        if (this.tg) {
            this.tg.setHeaderColor(color);
        }
    }

    setBackgroundColor(color) {
        if (this.tg) {
            this.tg.setBackgroundColor(color);
        }
    }

    isVersionAtLeast(version) {
        return this.tg?.isVersionAtLeast(version) || false;
    }

    getPlatform() {
        return this.tg?.platform || 'unknown';
    }

    getInitData() {
        return this.tg?.initData || '';
    }

    getUser() {
        return this.user;
    }

    getToken() {
        return this.token;
    }

    close() {
        if (this.tg) {
            this.tg.close();
        }
    }
}

// Создаем глобальный экземпляр
window.telegramApp = new TelegramWebApp();
