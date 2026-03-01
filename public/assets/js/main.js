// main.js - ПОЛНЫЙ ФАЙЛ ОСНОВНОЙ ЛОГИКИ

class VirusGiftApp {
    constructor() {
        this.state = {
            user: null,
            token: null,
            mechanics: [],
            gifts: [],
            rating: [],
            inventory: [],
            achievements: [],
            currentPage: 1,
            hasMoreGifts: true,
            loading: false,
            activeTab: 'all',
            activePeriod: 'all',
            searchQuery: '',
            sound: true,
            vibration: true,
            theme: 'light',
            socket: null
        };
        
        this.cache = {
            mechanics: null,
            gifts: {},
            rating: null,
            lastUpdate: Date.now()
        };
        
        this.init();
    }

    async init() {
        this.showLoading();
        
        try {
            // Загружаем сохраненные настройки
            this.loadSettings();
            
            // Инициализируем Socket.IO
            this.initSocket();
            
            // Ждем инициализацию Telegram
            await new Promise(resolve => {
                if (window.telegramApp?.user) {
                    this.state.user = window.telegramApp.user;
                    resolve();
                } else {
                    const checkInterval = setInterval(() => {
                        if (window.telegramApp?.user) {
                            this.state.user = window.telegramApp.user;
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 100);
                }
            });
            
            // Загружаем данные
            await Promise.all([
                this.loadMechanics(),
                this.loadGifts(),
                this.loadRating(),
                this.loadInventory(),
                this.loadAchievements()
            ]);
            
            // Рендерим интерфейс
            this.render();
            this.setupEventListeners();
            
            // Обновляем UI с пользователем
            this.updateUserUI();
            
            // Загружаем статистику
            this.loadStats();
            
            // Показываем приветствие
            this.showWelcome();
            
        } catch (error) {
            console.error('Init error:', error);
            window.ui.showToast('Ошибка загрузки', 'error');
        } finally {
            this.hideLoading();
        }
    }

    initSocket() {
        try {
            this.state.socket = io();
            
            this.state.socket.on('connect', () => {
                console.log('Socket connected');
                if (this.state.user) {
                    this.state.socket.emit('join', this.state.user.id);
                }
            });
            
            this.state.socket.on('stats:update', (stats) => {
                if (this.state.user) {
                    this.state.user.stats = stats;
                    this.renderProfile();
                }
            });
            
            this.state.socket.on('mechanic:result', (data) => {
                window.ui.showToast(`+${data.points} очков!`, 'success');
                this.showGiftModal(data.reward);
            });
            
        } catch (error) {
            console.warn('Socket init error:', error);
        }
    }

    loadSettings() {
        const saved = localStorage.getItem('virusgift_settings');
        if (saved) {
            try {
                const settings = JSON.parse(saved);
                this.state.sound = settings.sound ?? true;
                this.state.vibration = settings.vibration ?? true;
                this.state.theme = settings.theme ?? 'light';
                
                // Применяем настройки
                document.getElementById('soundToggle').checked = this.state.sound;
                document.getElementById('vibrationToggle').checked = this.state.vibration;
                document.documentElement.setAttribute('data-theme', this.state.theme);
            } catch (e) {}
        }
    }

    saveSettings() {
        localStorage.setItem('virusgift_settings', JSON.stringify({
            sound: this.state.sound,
            vibration: this.state.vibration,
            theme: this.state.theme
        }));
    }

    async loadMechanics(force = false) {
        if (!force && this.cache.mechanics) {
            this.state.mechanics = this.cache.mechanics;
            return;
        }
        
        try {
            const data = await window.api.get('/mechanics');
            if (data.success) {
                this.state.mechanics = data.data;
                this.cache.mechanics = data.data;
            }
        } catch (error) {
            console.error('Load mechanics error:', error);
        }
    }

    async loadGifts(page = 1, force = false) {
        if (!force && this.cache.gifts[page]) {
            if (page === 1) {
                this.state.gifts = this.cache.gifts[page];
            } else {
                this.state.gifts = [...this.state.gifts, ...this.cache.gifts[page]];
            }
            this.state.currentPage = page;
            this.state.hasMoreGifts = this.cache.gifts[page].length === 12;
            return;
        }
        
        this.state.loading = true;
        
        try {
            const sort = document.getElementById('giftSort')?.value || 'new';
            const data = await window.api.get(`/gifts?page=${page}&limit=12&sort=${sort}`);
            
            if (data.success) {
                if (page === 1) {
                    this.state.gifts = data.data;
                } else {
                    this.state.gifts = [...this.state.gifts, ...data.data];
                }
                
                this.state.currentPage = page;
                this.state.hasMoreGifts = data.pagination.hasMore;
                this.cache.gifts[page] = data.data;
            }
        } catch (error) {
            console.error('Load gifts error:', error);
        } finally {
            this.state.loading = false;
        }
    }

    async loadRating() {
        if (this.cache.rating) {
            this.state.rating = this.cache.rating;
            return;
        }
        
        try {
            const data = await window.api.get(`/rating?period=${this.state.activePeriod}`);
            if (data.success) {
                this.state.rating = data.data;
                this.cache.rating = data.data;
            }
        } catch (error) {
            console.error('Load rating error:', error);
        }
    }

    async loadInventory() {
        if (!this.state.user) return;
        
        try {
            const data = await window.api.get(`/user/${this.state.user.id}/inventory`);
            if (data.success) {
                this.state.inventory = data.data;
                document.getElementById('inventoryCount').textContent = this.state.inventory.length;
            }
        } catch (error) {
            console.error('Load inventory error:', error);
        }
    }

    async loadAchievements() {
        // Достижения генерируем на основе статистики
        if (!this.state.user) return;
        
        const achievements = [
            { id: 1, name: 'Новичок', description: 'Сыграть первую игру', icon: '🌱', progress: 0, max: 1, completed: false },
            { id: 2, name: 'Коллекционер', description: 'Собрать 10 подарков', icon: '📦', progress: 0, max: 10, completed: false },
            { id: 3, name: 'Популярный', description: 'Получить 100 лайков', icon: '❤️', progress: 0, max: 100, completed: false },
            { id: 4, name: 'Эксперт', description: 'Сыграть 50 игр', icon: '🎮', progress: 0, max: 50, completed: false },
            { id: 5, name: 'Дружелюбный', description: 'Пригласить 5 друзей', icon: '👥', progress: 0, max: 5, completed: false }
        ];
        
        if (this.state.user.stats) {
            achievements[0].progress = Math.min(this.state.user.stats.gamesPlayed, 1);
            achievements[0].completed = this.state.user.stats.gamesPlayed >= 1;
            
            achievements[1].progress = Math.min(this.state.user.stats.giftsOpened, 10);
            achievements[1].completed = this.state.user.stats.giftsOpened >= 10;
            
            achievements[3].progress = Math.min(this.state.user.stats.gamesPlayed, 50);
            achievements[3].completed = this.state.user.stats.gamesPlayed >= 50;
            
            achievements[4].progress = Math.min(this.state.user.stats.friends, 5);
            achievements[4].completed = this.state.user.stats.friends >= 5;
        }
        
        this.state.achievements = achievements;
    }

    async loadStats() {
        try {
            const data = await window.api.get('/stats');
            if (data.success) {
                document.getElementById('totalUsers').textContent = window.utils.formatNumber(data.data.totalUsers);
                document.getElementById('totalGifts').textContent = window.utils.formatNumber(data.data.totalGifts);
                document.getElementById('onlineNow').textContent = data.data.onlineNow;
            }
        } catch (error) {
            console.error('Load stats error:', error);
        }
    }

    async playMechanic(mechanicId) {
        if (!this.state.user) {
            window.ui.showToast('Авторизуйтесь в Telegram', 'warning');
            return;
        }
        
        if (this.state.vibration) {
            window.navigator.vibrate?.(50);
        }
        
        if (this.state.sound) {
            this.playSound('click');
        }
        
        try {
            const data = await window.api.post(`/mechanics/${mechanicId}/play`, {
                userId: this.state.user.id
            });
            
            if (data.success) {
                window.ui.showToast(`+${data.data.points} очков!`, 'success');
                
                if (this.state.vibration) {
                    window.navigator.vibrate?.(100);
                }
                
                if (this.state.sound) {
                    this.playSound('win');
                }
                
                // Обновляем статистику
                if (this.state.user) {
                    this.state.user.stats = {
                        ...this.state.user.stats,
                        gamesPlayed: (this.state.user.stats?.gamesPlayed || 0) + 1,
                        rating: (this.state.user.stats?.rating || 0) + data.data.points
                    };
                }
                
                // Показываем подарок
                this.showGiftModal(data.data.reward);
                
                // Обновляем профиль
                this.renderProfile();
                
                // Конфетти
                window.ui.showConfetti();
            }
        } catch (error) {
            console.error('Play mechanic error:', error);
            window.ui.showToast('Ошибка запуска', 'error');
        }
    }

    async likeGift(giftId) {
        if (!this.state.user) {
            window.ui.showToast('Авторизуйтесь', 'warning');
            return;
        }
        
        try {
            const data = await window.api.post(`/gifts/${giftId}/like`, {
                userId: this.state.user.id
            });
            
            if (data.success) {
                window.ui.showToast('❤️ Лайк поставлен!', 'success');
                
                if (this.state.vibration) {
                    window.navigator.vibrate?(30);
                }
                
                // Обновляем лайки в интерфейсе
                const gift = this.state.gifts.find(g => g.id === giftId);
                if (gift) {
                    gift.likes = data.data.likes;
                }
            }
        } catch (error) {
            console.error('Like error:', error);
        }
    }

    async inviteFriend() {
        if (!this.state.user) {
            window.ui.showToast('Авторизуйтесь', 'warning');
            return;
        }
        
        try {
            const data = await window.api.post('/invite', {
                userId: this.state.user.id
            });
            
            if (data.success) {
                const linkContainer = document.getElementById('inviteLinkContainer');
                const linkInput = document.getElementById('inviteLink');
                
                linkInput.value = data.data.inviteLink;
                linkContainer.style.display = 'flex';
                
                document.getElementById('copyLink').onclick = () => {
                    linkInput.select();
                    document.execCommand('copy');
                    window.ui.showToast('Ссылка скопирована!', 'success');
                };
                
                // Открываем в Telegram
                window.telegramApp.share('🎁 Запускай вирусные подарки вместе со мной!');
                
                // Обновляем статистику
                if (this.state.user) {
                    this.state.user.stats.friends++;
                    this.state.user.stats.rating += data.data.bonus;
                    document.getElementById('invitedCount').textContent = this.state.user.stats.friends;
                    document.getElementById('bonusCount').textContent = this.state.user.stats.rating;
                    this.renderProfile();
                }
            }
        } catch (error) {
            console.error('Invite error:', error);
        }
    }

    async search(query) {
        if (query.length < 2) {
            document.getElementById('searchResults').innerHTML = '';
            return;
        }
        
        try {
            const data = await window.api.get(`/search?q=${encodeURIComponent(query)}`);
            if (data.success) {
                this.renderSearchResults(data.data);
            }
        } catch (error) {
            console.error('Search error:', error);
        }
    }

    render() {
        this.renderMechanics(this.state.activeTab);
        this.renderGifts();
        this.renderRating();
        this.renderProfile();
        this.renderInventory();
        this.renderAchievements();
    }

    renderMechanics(filter = 'all') {
        const container = document.getElementById('mechanicsContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        let filtered = this.state.mechanics;
        
        if (filter === 'popular') {
            filtered = filtered.filter(m => m.category === 'popular');
        } else if (filter === 'new') {
            filtered = filtered.filter(m => m.category === 'new');
        } else if (filter === 'my') {
            // Показываем все механики, но можно добавить логику
        }
        
        filtered.forEach(mechanic => {
            const card = document.createElement('div');
            card.className = 'mechanic-card animate-scale-in';
            card.setAttribute('data-mechanic-id', mechanic.id);
            card.innerHTML = `
                <div class="mechanic-icon">${mechanic.icon}</div>
                <h3>${mechanic.name}</h3>
                <p>${mechanic.description}</p>
                <div class="mechanic-stats">
                    <span title="Рейтинг">⭐ ${mechanic.rating}</span>
                    <span title="Игроков">👥 ${window.utils.formatNumber(mechanic.plays)}</span>
                </div>
                <button class="btn-play">Играть</button>
            `;
            
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('btn-play')) {
                    this.openMechanic(mechanic);
                }
            });
            
            card.querySelector('.btn-play').addEventListener('click', (e) => {
                e.stopPropagation();
                this.playMechanic(mechanic.id);
            });
            
            container.appendChild(card);
        });
        
        document.getElementById('mechanicsCount').textContent = filtered.length;
    }

    renderGifts() {
        const container = document.getElementById('giftsContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.state.gifts.forEach(gift => {
            const card = document.createElement('div');
            card.className = 'gift-card animate-scale-in';
            card.innerHTML = `
                <div class="gift-media">
                    ${gift.type === 'video' ? 
                        `<video src="${gift.url}" loop muted poster="/assets/img/placeholder.jpg"></video>` : 
                        `<img src="${gift.url}" alt="${gift.title}" loading="lazy" onerror="this.src='/assets/img/placeholder.jpg'">`
                    }
                </div>
                <div class="gift-info">
                    <h4>${gift.title}</h4>
                    <div class="gift-meta">
                        <span title="Просмотры">👁 ${window.utils.formatNumber(gift.views)}</span>
                        <span title="Лайки">❤️ ${window.utils.formatNumber(gift.likes)}</span>
                        <span class="gift-rarity ${gift.rarity}">${gift.rarity}</span>
                    </div>
                </div>
            `;
            
            card.addEventListener('click', () => {
                this.showGiftModal(gift);
            });
            
            container.appendChild(card);
        });
        
        const loadMoreBtn = document.getElementById('loadMoreGifts');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = this.state.hasMoreGifts ? 'flex' : 'none';
            loadMoreBtn.innerHTML = this.state.loading ? 
                '<span>Загрузка...</span><span class="btn-icon spinner"></span>' : 
                '<span>Загрузить ещё</span><span class="btn-icon">↓</span>';
            loadMoreBtn.disabled = this.state.loading;
        }
    }

    renderRating() {
        const container = document.getElementById('ratingList');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.state.rating.slice(0, 20).forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'rating-item animate-slide-left';
            item.style.animationDelay = `${index * 50}ms`;
            
            const isCurrentUser = this.state.user && 
                                 (player.id === this.state.user.id || 
                                  player.username === this.state.user.username);
            
            if (isCurrentUser) {
                item.classList.add('current-user');
            }
            
            let avatarHtml = '';
            if (player.avatar) {
                avatarHtml = `<img src="${player.avatar}" alt="${player.name}" class="rating-avatar">`;
            } else {
                const initials = player.name ? player.name[0].toUpperCase() : '?';
                avatarHtml = `<div class="rating-avatar-placeholder" style="background:${window.utils.getRandomColor(player.name)}">${initials}</div>`;
            }
            
            item.innerHTML = `
                <div class="rating-position ${index < 3 ? 'top-' + (index + 1) : ''}">${index + 1}</div>
                ${avatarHtml}
                <div class="rating-info">
                    <div class="rating-name">${player.name} ${isCurrentUser ? '(Вы)' : ''}</div>
                    <div class="rating-username">@${player.username || 'user'}</div>
                </div>
                <div class="rating-score">${window.utils.formatNumber(player.score)}</div>
            `;
            
            container.appendChild(item);
        });
    }

    renderProfile() {
        const container = document.getElementById('profileCard');
        if (!container || !this.state.user) return;
        
        const user = this.state.user;
        const stats = user.stats || { giftsOpened: 0, gamesPlayed: 0, friends: 0, rating: 0, level: 1, experience: 0 };
        
        let avatarHtml = '';
        if (user.photo_url) {
            avatarHtml = `<img src="${user.photo_url}" alt="Avatar" class="profile-avatar">`;
        } else {
            const initials = window.telegramApp?.getInitials?.(user) || user.first_name?.[0] || '?';
            avatarHtml = `<div class="profile-avatar-placeholder">${initials}</div>`;
        }
        
        const expNeeded = stats.level * 1000;
        const expProgress = (stats.experience / expNeeded) * 100;
        
        container.innerHTML = `
            ${avatarHtml}
            <div class="profile-name">${window.telegramApp?.getUserDisplayName?.(user) || user.first_name || 'Пользователь'}</div>
            <div class="profile-username">@${user.username || 'user'}</div>
            <div class="profile-level">Уровень ${stats.level}</div>
            <div class="profile-progress">
                <div class="progress-bar" style="width: ${expProgress}%"></div>
                <span class="progress-text">${stats.experience}/${expNeeded} XP</span>
            </div>
            
            <div class="profile-stats-grid">
                <div class="profile-stat-item">
                    <span class="profile-stat-value">${stats.giftsOpened}</span>
                    <span class="profile-stat-label">Подарков</span>
                </div>
                <div class="profile-stat-item">
                    <span class="profile-stat-value">${stats.gamesPlayed}</span>
                    <span class="profile-stat-label">Игр</span>
                </div>
                <div class="profile-stat-item">
                    <span class="profile-stat-value">${stats.friends}</span>
                    <span class="profile-stat-label">Друзей</span>
                </div>
                <div class="profile-stat-item">
                    <span class="profile-stat-value">${window.utils.formatNumber(stats.rating)}</span>
                    <span class="profile-stat-label">Рейтинг</span>
                </div>
            </div>
            
            <div class="profile-actions">
                <button class="btn btn-outline" id="refreshProfile">
                    <span class="btn-icon">🔄</span>
                    <span>Обновить</span>
                </button>
                <button class="btn btn-outline" id="shareProfile">
                    <span class="btn-icon">📤</span>
                    <span>Поделиться</span>
                </button>
            </div>
        `;
        
        document.getElementById('refreshProfile')?.addEventListener('click', () => {
            this.loadUserProfile();
        });
        
        document.getElementById('shareProfile')?.addEventListener('click', () => {
            window.telegramApp.share(`Мой профиль в VirusGift.pro: Уровень ${stats.level}, ${window.utils.formatNumber(stats.rating)} очков!`);
        });
    }

    renderInventory() {
        const container = document.getElementById('inventoryContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (this.state.inventory.length === 0) {
            container.innerHTML = '<div class="empty-state">У вас пока нет подарков</div>';
            return;
        }
        
        this.state.inventory.forEach(item => {
            if (!item.gift) return;
            
            const card = document.createElement('div');
            card.className = 'inventory-item';
            card.innerHTML = `
                <img src="${item.gift.url}" alt="${item.gift.title}" class="inventory-image">
                <div class="inventory-info">
                    <h4>${item.gift.title}</h4>
                    <span class="inventory-date">${window.utils.formatDate(item.obtained)}</span>
                </div>
                ${!item.used ? '<button class="btn-use">Использовать</button>' : '<span class="used-badge">Использовано</span>'}
            `;
            
            if (!item.used) {
                card.querySelector('.btn-use').addEventListener('click', () => {
                    this.useGift(item);
                });
            }
            
            container.appendChild(card);
        });
    }

    renderAchievements() {
        const container = document.getElementById('achievementsContainer');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.state.achievements.forEach(achievement => {
            const card = document.createElement('div');
            card.className = `achievement-card ${achievement.completed ? 'completed' : ''}`;
            card.innerHTML = `
                <div class="achievement-icon">${achievement.icon}</div>
                <div class="achievement-info">
                    <h4>${achievement.name}</h4>
                    <p>${achievement.description}</p>
                    <div class="achievement-progress">
                        <div class="progress-bar" style="width: ${(achievement.progress / achievement.max) * 100}%"></div>
                        <span>${achievement.progress}/${achievement.max}</span>
                    </div>
                </div>
            `;
            
            container.appendChild(card);
        });
    }

    renderSearchResults(results) {
        const container = document.getElementById('searchResults');
        container.innerHTML = '';
        
        if (results.mechanics.length === 0 && results.gifts.length === 0) {
            container.innerHTML = '<div class="no-results">Ничего не найдено</div>';
            return;
        }
        
        if (results.mechanics.length > 0) {
            const mechanicsTitle = document.createElement('div');
            mechanicsTitle.className = 'search-category';
            mechanicsTitle.textContent = 'Механики';
            container.appendChild(mechanicsTitle);
            
            results.mechanics.forEach(mechanic => {
                const item = document.createElement('div');
                item.className = 'search-item';
                item.innerHTML = `
                    <span class="search-icon">${mechanic.icon}</span>
                    <span class="search-name">${mechanic.name}</span>
                `;
                item.addEventListener('click', () => {
                    this.openMechanic(mechanic);
                    document.getElementById('searchBar').classList.remove('active');
                });
                container.appendChild(item);
            });
        }
        
        if (results.gifts.length > 0) {
            const giftsTitle = document.createElement('div');
            giftsTitle.className = 'search-category';
            giftsTitle.textContent = 'Подарки';
            container.appendChild(giftsTitle);
            
            results.gifts.forEach(gift => {
                const item = document.createElement('div');
                item.className = 'search-item';
                item.innerHTML = `
                    <span class="search-icon">🎁</span>
                    <span class="search-name">${gift.title}</span>
                `;
                item.addEventListener('click', () => {
                    this.showGiftModal(gift);
                    document.getElementById('searchBar').classList.remove('active');
                });
                container.appendChild(item);
            });
        }
    }

    updateUserUI() {
        if (!this.state.user) return;
        
        const tgUserElement = document.getElementById('tgUser');
        const tgSidebarInfo = document.getElementById('tgSidebarInfo');
        
        if (this.state.user.photo_url) {
            tgUserElement.innerHTML = `<img src="${this.state.user.photo_url}" alt="Avatar">`;
        } else {
            const initials = window.telegramApp?.getInitials?.(this.state.user) || this.state.user.first_name?.[0] || '?';
            tgUserElement.innerHTML = `<div class="avatar-placeholder">${initials}</div>`;
        }
        
        tgSidebarInfo.innerHTML = `
            <div class="sidebar-user">
                ${this.state.user.photo_url ? 
                    `<img src="${this.state.user.photo_url}" alt="Avatar" class="sidebar-user-avatar">` :
                    `<div class="sidebar-user-avatar placeholder">${window.telegramApp?.getInitials?.(this.state.user) || '?'}</div>`
                }
                <div class="sidebar-user-info">
                    <div class="sidebar-user-name">${window.telegramApp?.getUserDisplayName?.(this.state.user) || 'Пользователь'}</div>
                    <div class="sidebar-user-username">@${this.state.user.username || 'user'}</div>
                </div>
            </div>
        `;
    }

    async loadUserProfile() {
        if (!this.state.user) return;
        
        try {
            const data = await window.api.get(`/user/${this.state.user.id}`);
            if (data.success) {
                this.state.user = data.data;
                this.renderProfile();
                window.ui.showToast('Профиль обновлен', 'success');
            }
        } catch (error) {
            console.error('Load profile error:', error);
        }
    }

    openMechanic(mechanic) {
        window.ui.openModal('mechanicModal');
        const frame = document.getElementById('mechanicFrame');
        
        frame.innerHTML = `
            <div class="mechanic-game" data-mechanic-id="${mechanic.id}">
                <div class="mechanic-header">
                    <span class="mechanic-icon-large">${mechanic.icon}</span>
                    <h2>${mechanic.name}</h2>
                </div>
                <div class="mechanic-container" id="mechanic-${mechanic.id}">
                    <div class="loading-spinner">Загрузка...</div>
                </div>
            </div>
        `;
        
        setTimeout(() => {
            this.initMechanic(mechanic.id);
        }, 100);
    }

    initMechanic(mechanicId) {
        const container = document.getElementById(`mechanic-${mechanicId}`);
        if (!container) return;
        
        // Пытаемся загрузить из отдельного файла
        fetch(`/mechanics/${mechanicId}.html`)
            .then(response => response.text())
            .then(html => {
                container.innerHTML = html;
                
                // Загружаем скрипт механики
                const script = document.createElement('script');
                script.src = `/mechanics/${mechanicId}.js`;
                script.onload = () => {
                    if (window.mechanics && window.mechanics[mechanicId]) {
                        window.mechanics[mechanicId].init(container, this);
                    }
                };
                document.body.appendChild(script);
            })
            .catch(() => {
                // Если нет отдельного файла, используем встроенную
                container.innerHTML = this.getEmbeddedMechanic(mechanicId);
                if (window.mechanics && window.mechanics[mechanicId]) {
                    window.mechanics[mechanicId].init(container, this);
                }
            });
    }

    getEmbeddedMechanic(mechanicId) {
        const mechanics = {
            clicker: `
                <div class="clicker-game">
                    <div class="gift-box" id="clickerBox">🎁</div>
                    <div class="clicker-stats">
                        <div>Прогресс: <span id="clickCount">0</span>/10</div>
                        <progress id="clickerProgress" value="0" max="10"></progress>
                    </div>
                    <button class="btn btn-secondary" id="resetClicker">Сбросить</button>
                </div>
            `,
            roulette: `
                <div class="roulette-game">
                    <div class="wheel" id="rouletteWheel">🎡</div>
                    <button class="btn btn-primary" id="spinRoulette">Крутить</button>
                    <div class="roulette-result" id="rouletteResult"></div>
                </div>
            `,
            wheel: `
                <div class="wheel-game">
                    <canvas id="wheelCanvas" width="280" height="280"></canvas>
                    <button class="btn btn-primary" id="spinWheel">Крутить</button>
                    <div class="wheel-result" id="wheelResult"></div>
                </div>
            `,
            timer: `
                <div class="timer-game">
                    <div class="timer-display" id="timerDisplay">5</div>
                    <button class="btn btn-primary" id="startTimer">Старт</button>
                    <div class="timer-result" id="timerResult"></div>
                </div>
            `,
            puzzle: `
                <div class="puzzle-game">
                    <div class="puzzle-grid" id="puzzleGrid"></div>
                    <button class="btn btn-primary" id="shufflePuzzle">Перемешать</button>
                </div>
            `
        };
        
        return mechanics[mechanicId] || '<div class="mechanic-placeholder">Механика в разработке</div>';
    }

    showGiftModal(gift) {
        window.ui.openModal('giftModal');
        const body = document.getElementById('giftModalBody');
        
        let mediaHtml = '';
        if (gift.type === 'video') {
            mediaHtml = `<video src="${gift.url}" controls autoplay loop style="max-width:100%;max-height:50vh;border-radius:12px;"></video>`;
        } else {
            mediaHtml = `<img src="${gift.url}" alt="${gift.title}" style="max-width:100%;max-height:50vh;border-radius:12px;" onerror="this.src='/assets/img/placeholder.jpg'">`;
        }
        
        const isInInventory = this.state.inventory.some(item => item.giftId === gift.id && !item.used);
        
        body.innerHTML = `
            <div class="gift-modal-content">
                ${mediaHtml}
                <h3>${gift.title}</h3>
                <div class="gift-stats">
                    <span title="Просмотры">👁 ${window.utils.formatNumber(gift.views)}</span>
                    <span title="Лайки">❤️ ${window.utils.formatNumber(gift.likes)}</span>
                    <span class="gift-rarity ${gift.rarity}">${gift.rarity}</span>
                </div>
                <div class="gift-actions">
                    <button class="btn btn-primary" id="modalLikeBtn">
                        <span class="btn-icon">❤️</span>
                        <span>Лайк</span>
                    </button>
                    <button class="btn btn-outline" id="modalShareBtn">
                        <span class="btn-icon">📤</span>
                        <span>Поделиться</span>
                    </button>
                    ${isInInventory ? '<span class="inventory-badge">Уже в инвентаре</span>' : ''}
                </div>
            </div>
        `;
        
        document.getElementById('modalLikeBtn')?.addEventListener('click', () => {
            this.likeGift(gift.id);
        });
        
        document.getElementById('modalShareBtn')?.addEventListener('click', () => {
            window.telegramApp.share(`Посмотри этот подарок: ${gift.title} на VirusGift.pro`);
        });
    }

    showAchievementModal(achievement) {
        window.ui.openModal('achievementModal');
        const body = document.getElementById('achievementModalBody');
        
        body.innerHTML = `
            <div class="achievement-modal-content">
                <div class="achievement-icon-large">${achievement.icon}</div>
                <h2>Достижение получено!</h2>
                <h3>${achievement.name}</h3>
                <p>${achievement.description}</p>
                <button class="btn btn-primary" onclick="window.ui.closeModal('achievementModal')">Отлично!</button>
            </div>
        `;
        
        window.ui.showConfetti();
        
        if (this.state.sound) {
            this.playSound('achievement');
        }
    }

    async useGift(item) {
        if (!this.state.user) return;
        
        try {
            const data = await window.api.post(`/user/${this.state.user.id}/inventory/use`, {
                itemId: item.giftId
            });
            
            if (data.success) {
                window.ui.showToast('Подарок использован!', 'success');
                await this.loadInventory();
                this.renderInventory();
            }
        } catch (error) {
            console.error('Use gift error:', error);
        }
    }

    playSound(type) {
        // Можно добавить звуки
        console.log('Sound:', type);
    }

    showWelcome() {
        if (!localStorage.getItem('welcome_shown')) {
            setTimeout(() => {
                window.ui.showToast('Добро пожаловать в VirusGift.pro!', 'info', 5000);
                localStorage.setItem('welcome_shown', 'true');
            }, 1000);
        }
    }

    setupEventListeners() {
        // Меню
        document.getElementById('menuToggle')?.addEventListener('click', () => {
            document.getElementById('sidebar')?.classList.add('active');
            document.getElementById('overlay')?.classList.add('active');
        });
        
        document.getElementById('sidebarClose')?.addEventListener('click', () => {
            document.getElementById('sidebar')?.classList.remove('active');
            document.getElementById('overlay')?.classList.remove('active');
        });
        
        document.getElementById('overlay')?.addEventListener('click', () => {
            document.getElementById('sidebar')?.classList.remove('active');
            document.getElementById('overlay')?.classList.remove('active');
        });
        
        // Поиск
        document.getElementById('searchToggle')?.addEventListener('click', () => {
            document.getElementById('searchBar').classList.toggle('active');
            document.getElementById('searchInput').focus();
        });
        
        document.getElementById('searchClose')?.addEventListener('click', () => {
            document.getElementById('searchBar').classList.remove('active');
        });
        
        document.getElementById('searchInput')?.addEventListener('input', window.utils.debounce((e) => {
            this.search(e.target.value);
        }, 300));
        
        // Навигация по сайдбару
        document.querySelectorAll('.sidebar-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = link.getAttribute('href');
                const targetSection = document.querySelector(targetId);
                
                if (targetSection) {
                    targetSection.scrollIntoView({ behavior: 'smooth' });
                    
                    // Закрываем меню
                    document.getElementById('sidebar')?.classList.remove('active');
                    document.getElementById('overlay')?.classList.remove('active');
                }
            });
        });
        
        // Табы механик
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.activeTab = btn.dataset.tab;
                this.renderMechanics(this.state.activeTab);
            });
        });
        
        // Периоды рейтинга
        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.activePeriod = btn.dataset.period;
                this.loadRating();
            });
        });
        
        // Сортировка подарков
        document.getElementById('giftSort')?.addEventListener('change', () => {
            this.loadGifts(1, true);
        });
        
        // Загрузить ещё
        document.getElementById('loadMoreGifts')?.addEventListener('click', async () => {
            if (this.state.hasMoreGifts && !this.state.loading) {
                await this.loadGifts(this.state.currentPage + 1);
                this.renderGifts();
            }
        });
        
        // Поделиться
        document.getElementById('shareButton')?.addEventListener('click', () => {
            window.telegramApp.share('🎁 Запускай вирусные подарки в Telegram! virusgift.pro');
        });
        
        // Пригласить друзей
        document.getElementById('inviteButton')?.addEventListener('click', () => {
            this.inviteFriend();
        });
        
        // Настройки
        document.getElementById('soundToggle')?.addEventListener('change', (e) => {
            this.state.sound = e.target.checked;
            this.saveSettings();
        });
        
        document.getElementById('vibrationToggle')?.addEventListener('change', (e) => {
            this.state.vibration = e.target.checked;
            this.saveSettings();
        });
        
        document.getElementById('themeToggle')?.addEventListener('click', () => {
            this.state.theme = this.state.theme === 'light' ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', this.state.theme);
            document.getElementById('themeToggle').textContent = this.state.theme === 'light' ? '🌙' : '☀️';
            this.saveSettings();
        });
        
        // Обновление механик
        document.getElementById('refreshMechanics')?.addEventListener('click', () => {
            this.loadMechanics(true);
        });
        
        // Закрытие модалок
        document.querySelectorAll('.close').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.modal').forEach(modal => {
                    modal.style.display = 'none';
                });
            });
        });
        
        // Закрытие по клику вне модалки
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });
        
        // Обработка сообщений от iframe
        window.addEventListener('message', (e) => {
            if (e.data.type === 'mechanicComplete') {
                window.ui.showToast(`+${e.data.reward} очков!`, 'success');
                
                if (this.state.vibration) {
                    window.navigator.vibrate?.(100);
                }
                
                // Обновляем статистику
                this.loadUserProfile();
            }
        });
        
        // Обработка видимости страницы
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.loadStats();
            }
        });
        
        // Бесконечный скролл
        window.addEventListener('scroll', window.utils.throttle(() => {
            const scrollPosition = window.innerHeight + window.scrollY;
            const threshold = document.body.offsetHeight - 1000;
            
            if (scrollPosition >= threshold && this.state.hasMoreGifts && !this.state.loading) {
                this.loadGifts(this.state.currentPage + 1).then(() => {
                    this.renderGifts();
                });
            }
        }, 200));
        
        // Обработка ошибок изображений
        document.addEventListener('error', (e) => {
            if (e.target.tagName === 'IMG') {
                e.target.src = '/assets/img/placeholder.jpg';
            }
        }, true);
    }

    showLoading() {
        const loader = document.getElementById('tg-loading');
        if (loader) {
            loader.style.display = 'flex';
            
            // Анимация прогресса
            let progress = 0;
            const interval = setInterval(() => {
                progress += Math.random() * 10;
                if (progress >= 100) progress = 100;
                document.getElementById('loadingProgress').style.width = progress + '%';
                if (progress === 100) clearInterval(interval);
            }, 200);
        }
    }

    hideLoading() {
        const loader = document.getElementById('tg-loading');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }
    }
}

// Создаем глобальный экземпляр
window.app = new VirusGiftApp();
