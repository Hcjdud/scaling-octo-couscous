// server.js - ПОЛНЫЙ ФАЙЛ СЕРВЕРА
require('dotenv').config();
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const fileUpload = require('express-fileupload');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { Telegraf } = require('telegraf');
const { Server } = require('socket.io');
const http = require('http');
const winston = require('winston');
const NodeCache = require('node-cache');
const { body, validationResult } = require('express-validator');

// Инициализация приложения
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const cache = new NodeCache({ stdTTL: 600 }); // 10 минут кэш

// Настройка логгера
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({ format: winston.format.simple() })
    ]
});

// Middleware
app.use(compression());
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://telegram.org", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "https://telegram.org", "https://cdn.jsdelivr.net", "'unsafe-inline'", "'unsafe-eval'"],
            imgSrc: ["'self'", "data:", "https:", "http:", "blob:"],
            connectSrc: ["'self'", "https://api.telegram.org", "wss:", "https:"],
            frameSrc: ["'self'", "https://telegram.org"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            mediaSrc: ["'self'", "data:", "blob:"]
        }
    }
}));
app.use(cors({
    origin: ['https://virusgift.pro', 'https://t.me', 'https://telegram.org'],
    credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    abortOnLimit: true
}));

// Сессии
app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 дней
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, error: 'Too many requests' }
});
app.use('/api/', limiter);

// Статические файлы
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '7d',
    etag: true,
    lastModified: true,
    setHeaders: (res, filepath) => {
        if (filepath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
        if (filepath.endsWith('.jpg') || filepath.endsWith('.png') || filepath.endsWith('.gif')) {
            res.setHeader('Cache-Control', 'public, max-age=604800');
        }
    }
}));

// Telegram бот
const bot = new Telegraf(process.env.BOT_TOKEN);
if (process.env.BOT_TOKEN) {
    try {
        bot.start((ctx) => {
            ctx.reply('🎁 Добро пожаловать в VirusGift.pro!', {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '🎮 Открыть приложение', web_app: { url: `https://${process.env.RENDER_EXTERNAL_URL || 'virusgift-pro.onrender.com'}` } }
                    ]]
                }
            });
        });
        
        bot.launch().then(() => {
            logger.info('Telegram bot started');
        }).catch(err => {
            logger.error('Bot launch error:', err);
        });
    } catch (err) {
        logger.error('Bot initialization error:', err);
    }
}

// Socket.IO
io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);
    
    socket.on('join', (userId) => {
        socket.join(`user-${userId}`);
    });
    
    socket.on('mechanic:play', (data) => {
        io.to(`user-${data.userId}`).emit('mechanic:result', data);
    });
    
    socket.on('disconnect', () => {
        logger.info(`Socket disconnected: ${socket.id}`);
    });
});

// In-memory база данных
const db = {
    users: new Map(),
    mechanics: new Map(),
    gifts: new Map(),
    ratings: new Map(),
    sessions: new Map(),
    stats: {
        totalUsers: 0,
        totalGifts: 0,
        totalPlays: 0,
        startTime: Date.now()
    }
};

// Инициализация данных
function initDatabase() {
    // Механики
    const mechanics = [
        { id: 'clicker', name: 'Кликер-взрыв', description: 'Кликай на подарок, пока не взорвется', icon: '🎁', plays: 15420, rating: 4.8, category: 'popular', players: 8923, maxScore: 1000 },
        { id: 'roulette', name: 'Рулетка эмоций', description: 'Крути барабан и получай подарки', icon: '🎡', plays: 12340, rating: 4.7, category: 'popular', players: 7234, maxScore: 500 },
        { id: 'timer', name: 'Вирусный таймер', description: 'Открывай подарок вовремя', icon: '⏳', plays: 8900, rating: 4.5, category: 'new', players: 4567, maxScore: 300 },
        { id: 'puzzle', name: 'Собери пазл', description: 'Собери картинку из кусочков', icon: '🧩', plays: 6700, rating: 4.6, category: 'all', players: 3890, maxScore: 800 },
        { id: 'wheel', name: 'Колесо фортуны', description: 'Крути колесо и выигрывай', icon: '🎰', plays: 21300, rating: 4.9, category: 'popular', players: 12456, maxScore: 1500 },
        { id: 'scratch', name: 'Стирай и смотри', description: 'Сотри защитный слой', icon: '🎫', plays: 5600, rating: 4.4, category: 'new', players: 3123, maxScore: 200 },
        { id: 'shooter', name: 'Стрелялка', description: 'Стреляй по подаркам', icon: '🎯', plays: 9200, rating: 4.5, category: 'all', players: 5678, maxScore: 600 },
        { id: 'memory', name: 'Найди пару', description: 'Найди одинаковые карточки', icon: '🃏', plays: 7800, rating: 4.6, category: 'all', players: 4231, maxScore: 400 }
    ];
    
    mechanics.forEach(m => db.mechanics.set(m.id, { ...m, created: Date.now() }));
    
    // Подарки
    const gifts = [
        { id: 1, title: 'Кот с сюрпризом', type: 'image', url: '/assets/img/gifts/cat-surprise.jpg', views: 3420, likes: 890, rarity: 'common' },
        { id: 2, title: 'Танцующий хомяк', type: 'gif', url: '/assets/img/gifts/hamster.gif', views: 5610, likes: 1230, rarity: 'rare' },
        { id: 3, title: 'Поздравление от звезды', type: 'video', url: '/assets/img/gifts/star.mp4', views: 2340, likes: 560, rarity: 'epic' },
        { id: 4, title: 'Милота дня', type: 'image', url: '/assets/img/gifts/cute.jpg', views: 1890, likes: 430, rarity: 'common' },
        { id: 5, title: 'Взрыв эмоций', type: 'image', url: '/assets/img/gifts/explosion.jpg', views: 4520, likes: 1110, rarity: 'rare' },
        { id: 6, title: 'Секретный код', type: 'image', url: '/assets/img/gifts/code.jpg', views: 890, likes: 210, rarity: 'common' },
        { id: 7, title: 'Танцующий кот', type: 'gif', url: '/assets/img/gifts/dancing-cat.gif', views: 6780, likes: 1540, rarity: 'epic' },
        { id: 8, title: 'Магическая шкатулка', type: 'image', url: '/assets/img/gifts/magic-box.jpg', views: 3210, likes: 780, rarity: 'rare' },
        { id: 9, title: 'Сюрприз яйцо', type: 'image', url: '/assets/img/gifts/surprise-egg.jpg', views: 2340, likes: 540, rarity: 'common' },
        { id: 10, title: 'Виртуальный питомец', type: 'image', url: '/assets/img/gifts/virtual-pet.jpg', views: 4560, likes: 1090, rarity: 'rare' },
        { id: 11, title: 'Новогоднее чудо', type: 'image', url: '/assets/img/gifts/new-year.jpg', views: 1230, likes: 320, rarity: 'common' },
        { id: 12, title: 'Летающая тарелка', type: 'gif', url: '/assets/img/gifts/ufo.gif', views: 3450, likes: 870, rarity: 'rare' },
        { id: 13, title: 'Смешной пёс', type: 'video', url: '/assets/img/gifts/funny-dog.mp4', views: 5670, likes: 1340, rarity: 'epic' },
        { id: 14, title: 'Магия исчезновения', type: 'video', url: '/assets/img/gifts/magic.mp4', views: 2340, likes: 560, rarity: 'epic' },
        { id: 15, title: 'Космическое путешествие', type: 'image', url: '/assets/img/gifts/space.jpg', views: 890, likes: 210, rarity: 'common' },
        { id: 16, title: 'Подводный мир', type: 'image', url: '/assets/img/gifts/underwater.jpg', views: 1560, likes: 390, rarity: 'common' },
        { id: 17, title: 'Динозаврик', type: 'gif', url: '/assets/img/gifts/dino.gif', views: 4320, likes: 1010, rarity: 'rare' },
        { id: 18, title: 'Волшебный шар', type: 'image', url: '/assets/img/gifts/magic-ball.jpg', views: 2780, likes: 640, rarity: 'common' },
        { id: 19, title: 'Сюрприз от робота', type: 'video', url: '/assets/img/gifts/robot.mp4', views: 1890, likes: 410, rarity: 'epic' },
        { id: 20, title: 'Позитивный енот', type: 'gif', url: '/assets/img/gifts/racoon.gif', views: 5890, likes: 1320, rarity: 'rare' }
    ];
    
    gifts.forEach(g => db.gifts.set(g.id, g));
    
    // Рейтинг
    for (let i = 1; i <= 50; i++) {
        db.ratings.set(i, {
            id: i,
            name: `Игрок${i}`,
            username: `player${i}`,
            score: Math.floor(Math.random() * 10000) + 1000,
            avatar: null,
            level: Math.floor(Math.random() * 10) + 1
        });
    }
    
    db.stats.totalGifts = gifts.length;
    logger.info('Database initialized');
}

initDatabase();

// Функция валидации Telegram данных
function validateTelegramData(initData) {
    if (!initData) return null;
    
    try {
        const BOT_TOKEN = process.env.BOT_TOKEN || 'test_token';
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        
        const params = new URLSearchParams(initData);
        const hash = params.get('hash');
        params.delete('hash');
        
        const dataCheckString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('\n');
        
        const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        if (hmac === hash) {
            const userData = params.get('user');
            return userData ? JSON.parse(userData) : null;
        }
    } catch (error) {
        logger.error('Validation error:', error);
    }
    
    return null;
}

// Генерация токена
function generateToken(userId) {
    return jwt.sign({ userId }, process.env.SESSION_SECRET, { expiresIn: '7d' });
}

// ==================== API ROUTES ====================

// Авторизация
app.post('/api/auth', (req, res) => {
    try {
        const { initData } = req.body;
        let user = validateTelegramData(initData);
        
        if (!user) {
            user = {
                id: Math.floor(Math.random() * 1000000),
                first_name: 'Гость',
                last_name: '',
                username: `guest_${Math.floor(Math.random() * 1000)}`,
                photo_url: null,
                language_code: 'ru'
            };
        }
        
        let dbUser = db.users.get(user.id);
        if (!dbUser) {
            dbUser = {
                ...user,
                first_seen: Date.now(),
                last_seen: Date.now(),
                stats: {
                    giftsOpened: Math.floor(Math.random() * 50) + 10,
                    gamesPlayed: Math.floor(Math.random() * 30) + 5,
                    friends: Math.floor(Math.random() * 10),
                    rating: Math.floor(Math.random() * 5000) + 1000,
                    level: 1,
                    experience: 0,
                    achievements: []
                },
                settings: {
                    notifications: true,
                    sound: true,
                    vibration: true
                },
                inventory: []
            };
            db.users.set(user.id, dbUser);
            db.stats.totalUsers++;
        } else {
            dbUser.last_seen = Date.now();
            db.users.set(user.id, dbUser);
        }
        
        const token = generateToken(user.id);
        db.sessions.set(token, { userId: user.id, expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
        
        res.json({
            success: true,
            user: dbUser,
            token,
            stats: {
                totalUsers: db.users.size,
                totalGifts: db.gifts.size,
                totalPlays: db.stats.totalPlays
            }
        });
    } catch (error) {
        logger.error('Auth error:', error);
        res.status(500).json({ success: false, error: 'Auth failed' });
    }
});

// Проверка токена
app.post('/api/verify', (req, res) => {
    const { token } = req.body;
    const session = db.sessions.get(token);
    
    if (session && session.expires > Date.now()) {
        const user = db.users.get(session.userId);
        res.json({ success: true, user });
    } else {
        res.json({ success: false });
    }
});

// Получить пользователя
app.get('/api/user/:id', (req, res) => {
    const user = db.users.get(parseInt(req.params.id));
    if (user) {
        res.json({ success: true, data: user });
    } else {
        res.status(404).json({ success: false, error: 'User not found' });
    }
});

// Обновить пользователя
app.post('/api/user/:id/update', (req, res) => {
    const user = db.users.get(parseInt(req.params.id));
    if (user) {
        const updates = req.body;
        Object.assign(user, updates);
        user.last_seen = Date.now();
        db.users.set(user.id, user);
        res.json({ success: true, data: user });
    } else {
        res.status(404).json({ success: false, error: 'User not found' });
    }
});

// Получить все механики
app.get('/api/mechanics', (req, res) => {
    const cacheKey = 'mechanics';
    let mechanics = cache.get(cacheKey);
    
    if (!mechanics) {
        mechanics = Array.from(db.mechanics.values());
        cache.set(cacheKey, mechanics);
    }
    
    res.json({ success: true, data: mechanics });
});

// Получить механику по ID
app.get('/api/mechanics/:id', (req, res) => {
    const mechanic = db.mechanics.get(req.params.id);
    if (mechanic) {
        res.json({ success: true, data: mechanic });
    } else {
        res.status(404).json({ success: false, error: 'Mechanic not found' });
    }
});

// Запустить механику
app.post('/api/mechanics/:id/play', [
    body('userId').optional().isInt()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }
    
    const { userId } = req.body;
    const mechanic = db.mechanics.get(req.params.id);
    
    if (!mechanic) {
        return res.status(404).json({ success: false, error: 'Mechanic not found' });
    }
    
    mechanic.plays++;
    db.mechanics.set(req.params.id, mechanic);
    db.stats.totalPlays++;
    
    // Генерация случайного подарка
    const gifts = Array.from(db.gifts.values());
    const randomGift = gifts[Math.floor(Math.random() * gifts.length)];
    const points = Math.floor(Math.random() * 100) + 50;
    
    // Обновление пользователя
    if (userId) {
        const user = db.users.get(parseInt(userId));
        if (user) {
            user.stats.gamesPlayed++;
            user.stats.rating += points;
            user.stats.experience += points;
            
            // Проверка уровня
            const expNeeded = user.stats.level * 1000;
            if (user.stats.experience >= expNeeded) {
                user.stats.level++;
                user.stats.experience -= expNeeded;
            }
            
            // Добавление подарка в инвентарь
            user.inventory.push({
                giftId: randomGift.id,
                obtained: Date.now(),
                used: false
            });
            
            db.users.set(user.id, user);
            
            // Отправка через Socket.IO
            io.to(`user-${user.id}`).emit('stats:update', user.stats);
        }
    }
    
    res.json({
        success: true,
        data: {
            mechanic,
            reward: randomGift,
            points
        }
    });
});

// Получить все подарки
app.get('/api/gifts', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const type = req.query.type || 'all';
    const sort = req.query.sort || 'new';
    
    let gifts = Array.from(db.gifts.values());
    
    // Фильтрация по типу
    if (type !== 'all') {
        gifts = gifts.filter(g => g.type === type);
    }
    
    // Сортировка
    if (sort === 'popular') {
        gifts.sort((a, b) => b.views - a.views);
    } else if (sort === 'liked') {
        gifts.sort((a, b) => b.likes - a.likes);
    } else {
        gifts.sort((a, b) => b.id - a.id);
    }
    
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedGifts = gifts.slice(start, end);
    
    res.json({
        success: true,
        data: paginatedGifts,
        pagination: {
            page,
            limit,
            total: gifts.length,
            hasMore: end < gifts.length
        }
    });
});

// Получить подарок по ID
app.get('/api/gifts/:id', (req, res) => {
    const gift = db.gifts.get(parseInt(req.params.id));
    if (gift) {
        gift.views++;
        db.gifts.set(gift.id, gift);
        res.json({ success: true, data: gift });
    } else {
        res.status(404).json({ success: false, error: 'Gift not found' });
    }
});

// Лайкнуть подарок
app.post('/api/gifts/:id/like', (req, res) => {
    const { userId } = req.body;
    const gift = db.gifts.get(parseInt(req.params.id));
    
    if (gift) {
        gift.likes++;
        db.gifts.set(gift.id, gift);
        
        if (userId) {
            const user = db.users.get(parseInt(userId));
            if (user) {
                user.stats.rating += 5;
                db.users.set(user.id, user);
            }
        }
        
        res.json({ success: true, data: { likes: gift.likes } });
    } else {
        res.status(404).json({ success: false, error: 'Gift not found' });
    }
});

// Получить рейтинг
app.get('/api/rating', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const ratings = Array.from(db.ratings.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    
    res.json({ success: true, data: ratings });
});

// Получить статистику пользователя
app.get('/api/user/:id/stats', (req, res) => {
    const user = db.users.get(parseInt(req.params.id));
    if (user) {
        res.json({ success: true, data: user.stats });
    } else {
        res.status(404).json({ success: false, error: 'User not found' });
    }
});

// Получить инвентарь пользователя
app.get('/api/user/:id/inventory', (req, res) => {
    const user = db.users.get(parseInt(req.params.id));
    if (user) {
        const inventory = user.inventory.map(item => {
            const gift = db.gifts.get(item.giftId);
            return { ...item, gift };
        });
        res.json({ success: true, data: inventory });
    } else {
        res.status(404).json({ success: false, error: 'User not found' });
    }
});

// Использовать подарок из инвентаря
app.post('/api/user/:id/inventory/use', (req, res) => {
    const { itemId } = req.body;
    const user = db.users.get(parseInt(req.params.id));
    
    if (user) {
        const item = user.inventory.find(i => i.giftId === parseInt(itemId) && !i.used);
        if (item) {
            item.used = true;
            item.usedAt = Date.now();
            db.users.set(user.id, user);
            res.json({ success: true, data: item });
        } else {
            res.status(404).json({ success: false, error: 'Item not found' });
        }
    } else {
        res.status(404).json({ success: false, error: 'User not found' });
    }
});

// Пригласить друга
app.post('/api/invite', (req, res) => {
    const { userId } = req.body;
    const user = db.users.get(parseInt(userId));
    
    if (user) {
        const inviteCode = crypto.randomBytes(4).toString('hex');
        const inviteLink = `https://t.me/share/url?url=https://virusgift.pro?ref=${inviteCode}&text=🎁%20Запускай%20вирусные%20подарки%20в%20Telegram!`;
        
        user.stats.friends++;
        user.stats.rating += 50;
        db.users.set(user.id, user);
        
        res.json({
            success: true,
            data: {
                inviteLink,
                inviteCode,
                bonus: 50
            }
        });
    } else {
        res.status(404).json({ success: false, error: 'User not found' });
    }
});

// Получить общую статистику
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        data: {
            totalUsers: db.users.size,
            totalGifts: db.gifts.size,
            totalPlays: db.stats.totalPlays,
            onlineNow: Math.floor(Math.random() * 100) + 50,
            uptime: Date.now() - db.stats.startTime
        }
    });
});

// Поиск
app.get('/api/search', (req, res) => {
    const query = req.query.q?.toLowerCase() || '';
    
    const results = {
        mechanics: [],
        gifts: []
    };
    
    if (query.length >= 2) {
        results.mechanics = Array.from(db.mechanics.values())
            .filter(m => m.name.toLowerCase().includes(query) || m.description.toLowerCase().includes(query))
            .slice(0, 5);
        
        results.gifts = Array.from(db.gifts.values())
            .filter(g => g.title.toLowerCase().includes(query))
            .slice(0, 5);
    }
    
    res.json({ success: true, data: results });
});

// Загрузка аватара
app.post('/api/upload/avatar', (req, res) => {
    if (!req.files || !req.files.avatar) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    
    const avatar = req.files.avatar;
    const userId = req.body.userId;
    
    if (!avatar.mimetype.startsWith('image/')) {
        return res.status(400).json({ success: false, error: 'Invalid file type' });
    }
    
    const fileName = `avatar-${userId}-${Date.now()}.jpg`;
    const uploadPath = path.join(__dirname, 'public', 'uploads', fileName);
    
    avatar.mv(uploadPath, (err) => {
        if (err) {
            logger.error('Upload error:', err);
            return res.status(500).json({ success: false, error: 'Upload failed' });
        }
        
        const user = db.users.get(parseInt(userId));
        if (user) {
            user.photo_url = `/uploads/${fileName}`;
            db.users.set(user.id, user);
        }
        
        res.json({ success: true, data: { url: `/uploads/${fileName}` } });
    });
});

// Webhook для Telegram
app.post('/webhook/telegram', (req, res) => {
    try {
        bot.handleUpdate(req.body, res);
    } catch (error) {
        logger.error('Webhook error:', error);
        res.sendStatus(200);
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: Date.now(),
        uptime: process.uptime(),
        users: db.users.size,
        mechanics: db.mechanics.size,
        gifts: db.gifts.size,
        memory: process.memoryUsage()
    });
});

// Статистика для админа
app.get('/admin/stats', (req, res) => {
    // Простая защита
    const token = req.query.token;
    if (token !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    
    res.json({
        success: true,
        data: {
            users: Array.from(db.users.values()),
            mechanics: Array.from(db.mechanics.values()),
            gifts: Array.from(db.gifts.values()),
            ratings: Array.from(db.ratings.values()),
            stats: db.stats,
            cache: cache.keys()
        }
    });
});

// Очистка кэша
app.post('/admin/cache/clear', (req, res) => {
    const token = req.query.token;
    if (token !== process.env.ADMIN_TOKEN) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    
    cache.flushAll();
    res.json({ success: true });
});

// Для SPA - все маршруты отдаем index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, closing server');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, closing server');
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

// Запуск сервера
server.listen(PORT, () => {
    logger.info(`
    🎁 VirusGift.pro FULL SERVER STARTED
    📡 Port: ${PORT}
    🌐 URL: http://localhost:${PORT}
    👥 Users in DB: ${db.users.size}
    🎮 Mechanics: ${db.mechanics.size}
    🎁 Gifts: ${db.gifts.size}
    🚀 Environment: ${process.env.NODE_ENV || 'development'}
    `);
});

module.exports = { app, server, io, db, logger };
