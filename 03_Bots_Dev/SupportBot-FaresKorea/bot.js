require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { setupDb } = require('./database');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminId = process.env.ADMIN_CHAT_ID;

if (!token) {
    console.error('Ошибка: TELEGRAM_BOT_TOKEN не найден в переменных окружения');
    console.error('Убедитесь, что переменная TELEGRAM_BOT_TOKEN установлена на Railway');
    process.exit(1);
}

console.log('Инициализация бота...');
const bot = new TelegramBot(token, { polling: true });
let db;

// Инициализация БД с обработкой ошибок
setupDb()
    .then(database => {
        db = database;
        console.log('✅ Бот запущен и база данных готова.');
    })
    .catch(error => {
        console.error('❌ Ошибка при инициализации базы данных:', error);
        process.exit(1);
    });

// Обработка ошибок бота
bot.on('polling_error', (error) => {
    console.error('Ошибка polling:', error);
});

bot.on('error', (error) => {
    console.error('Ошибка бота:', error);
});

// Состояния (шаги)
const STEPS = {
    WELCOME: 'welcome',
    NAME: 'name',
    GOAL: 'goal',
    FATIGUE: 'fatigue',
    ACTIVITY: 'activity',
    DIGESTION: 'digestion',
    BEAUTY: 'beauty',
    FOCUS: 'focus',
    FORMAT: 'format',
    CONTACT: 'contact',
    ANALYZING: 'analyzing',
    DONE: 'done'
};

// Главная функция обработки сообщений
bot.on('message', async (msg) => {
    try {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!db) {
            console.log('База данных еще не инициализирована, пропускаем сообщение');
            return;
        }

        // Начало работы
        if (text === '/start' || text?.toLowerCase() === 'начать') {
            await db.run('INSERT OR REPLACE INTO users (chat_id, step) VALUES (?, ?)', [chatId, STEPS.WELCOME]);
            return sendWelcome(chatId);
        }

        // Админ-панель
        if (text === '/admin' && chatId.toString() === adminId?.toString()) {
            const stats = await db.get('SELECT COUNT(*) as total, SUM(completed) as completed FROM users');
            const adminText = `🛠 *Админ-панель*\n\n` +
                `Всего пользователей: ${stats.total}\n` +
                `Завершили опрос: ${stats.completed}\n\n` +
                `Выберите действие:`;

            return bot.sendMessage(chatId, adminText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '📋 Посмотреть последние лиды', callback_data: 'admin_leads' }]]
                }
            });
        }

        const user = await db.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);
        if (!user) return;

        // Обработка текстовых вводов по шагам
        switch (user.step) {
            case STEPS.NAME:
                await db.run('UPDATE users SET user_name = ?, step = ? WHERE chat_id = ?', [text, STEPS.GOAL, chatId]);
                return askGoal(chatId, text);

            case 'goal_custom':
                await db.run('UPDATE users SET main_goal = ?, step = ? WHERE chat_id = ?', [text, STEPS.FATIGUE, chatId]);
                return askFatigue(chatId);

            case STEPS.CONTACT:
                // Валидация контакта (простой вариант)
                await db.run('UPDATE users SET contact_data = ?, step = ? WHERE chat_id = ?', [text, STEPS.ANALYZING, chatId]);
                return finalizeResults(chatId, user.user_name);
        }
    } catch (error) {
        console.error('Ошибка при обработке сообщения:', error);
    }
});

// Обработка кнопок
bot.on('callback_query', async (query) => {
    try {
        const chatId = query.message.chat.id;
        const data = query.data;

        if (!db) {
            console.log('База данных еще не инициализирована, пропускаем callback');
            bot.answerCallbackQuery(query.id, { text: 'Бот еще загружается, попробуйте позже' });
            return;
        }

        const user = await db.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);

        if (!user && !data.startsWith('admin_')) {
            bot.answerCallbackQuery(query.id, { text: 'Начните с команды /start' });
            return;
        }

        // Обработка админских колбэков
        if (data === 'admin_leads' && chatId.toString() === adminId?.toString()) {
            const leads = await db.all('SELECT user_name, main_goal, contact_data, created_at FROM users WHERE completed = 1 ORDER BY created_at DESC LIMIT 10');

            if (leads.length === 0) {
                return bot.sendMessage(chatId, 'Лидов пока нет.');
            }

            let response = `📋 *Последние 10 лидов:*\n\n`;
            leads.forEach((l, i) => {
                response += `${i + 1}. *${l.user_name}* (${l.main_goal})\n   Контакт: ${l.contact_data}\n   Дата: ${l.created_at}\n\n`;
            });

            return bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
        }

        if (data === 'start_quiz') {
            await db.run('UPDATE users SET step = ? WHERE chat_id = ?', [STEPS.NAME, chatId]);
            return bot.sendMessage(chatId, 'Отлично! Для начала, как к вам обращаться?');
        }

        // Вопрос 2: Цель
        if (user.step === STEPS.GOAL) {
            if (data === 'goal_custom') {
                await db.run('UPDATE users SET step = ? WHERE chat_id = ?', ['goal_custom', chatId]);
                return bot.sendMessage(chatId, 'Напишите, пожалуйста, вашу главную цель:');
            }
            await db.run('UPDATE users SET main_goal = ?, step = ? WHERE chat_id = ?', [data, STEPS.FATIGUE, chatId]);
            return askFatigue(chatId);
        }

        // Вопрос 3: Усталость
        if (user.step === STEPS.FATIGUE) {
            await db.run('UPDATE users SET fatigue_level = ?, step = ? WHERE chat_id = ?', [data, STEPS.ACTIVITY, chatId]);
            return askActivity(chatId);
        }

        // Вопрос 4: Активность
        if (user.step === STEPS.ACTIVITY) {
            await db.run('UPDATE users SET activity = ?, step = ? WHERE chat_id = ?', [data, STEPS.DIGESTION, chatId]);
            return askDigestion(chatId);
        }

        // Вопрос 5: Пищеварение
        if (user.step === STEPS.DIGESTION) {
            await db.run('UPDATE users SET digestion = ?, step = ? WHERE chat_id = ?', [data, STEPS.BEAUTY, chatId]);
            return askBeauty(chatId);
        }

        // Вопрос 6: Красота
        if (user.step === STEPS.BEAUTY) {
            await db.run('UPDATE users SET beauty_focus = ?, step = ? WHERE chat_id = ?', [data, STEPS.FOCUS, chatId]);
            return askFocus(chatId);
        }

        // Вопрос 7: Фокус (Мультивыбор)
        if (user.step === STEPS.FOCUS) {
            if (data === 'focus_done') {
                await db.run('UPDATE users SET step = ? WHERE chat_id = ?', [STEPS.FORMAT, chatId]);
                return askFormat(chatId);
            }
            let current = user.current_focus ? JSON.parse(user.current_focus) : [];
            if (current.includes(data)) {
                current = current.filter(i => i !== data);
            } else {
                current.push(data);
            }
            await db.run('UPDATE users SET current_focus = ? WHERE chat_id = ?', [JSON.stringify(current), chatId]);
            return updateFocusButtons(chatId, query.message.message_id, current);
        }

        // Вопрос 8: Формат (Мультивыбор)
        if (user.step === STEPS.FORMAT) {
            if (data === 'format_done') {
                await db.run('UPDATE users SET step = ? WHERE chat_id = ?', [STEPS.CONTACT, chatId]);
                return askContact(chatId);
            }
            let current = user.preferred_format ? JSON.parse(user.preferred_format) : [];
            if (current.includes(data)) {
                current = current.filter(i => i !== data);
            } else {
                current.push(data);
            }
            await db.run('UPDATE users SET preferred_format = ? WHERE chat_id = ?', [JSON.stringify(current), chatId]);
            return updateFormatButtons(chatId, query.message.message_id, current);
        }

        // Сбор контактов
        if (user.step === STEPS.CONTACT) {
            if (data === 'contact_use_profile') {
                const username = query.from.username ? `@${query.from.username}` : query.from.first_name;
                await db.run('UPDATE users SET contact_data = ?, contact_type = ?, step = ? WHERE chat_id = ?', [username, 'Telegram (Auto)', STEPS.ANALYZING, chatId]);
                bot.answerCallbackQuery(query.id, { text: 'Данные профиля приняты!' });
                return finalizeResults(chatId, user.user_name);
            }
            if (data === 'contact_tg' || data === 'contact_wa') {
                const platform = data === 'contact_tg' ? 'Telegram' : 'WhatsApp';
                await db.run('UPDATE users SET contact_type = ? WHERE chat_id = ?', [platform, chatId]);

                // Если это телеграм, предлагаем еще и авто-кнопку
                const replyMarkup = {
                    inline_keyboard: [
                        [{ text: '👤 Использовать мой @username', callback_data: 'contact_use_profile' }]
                    ]
                };
                return bot.sendMessage(chatId, `Укажите, пожалуйста, ваш ${platform === 'Telegram' ? 'username или номер телеграма' : 'номер телефона'} вручную или нажмите кнопку ниже:`, { reply_markup: replyMarkup });
            }
        }
    } catch (error) {
        console.error('Ошибка при обработке callback_query:', error);
        try {
            bot.answerCallbackQuery(query.id, { text: 'Произошла ошибка, попробуйте позже' });
        } catch (e) {
            console.error('Ошибка при отправке ответа на callback:', e);
        }
    }
});

// Функции отправки вопросов

async function sendWelcome(chatId) {
    const text = `Привет! Я помощник проекта Fares Korea от Татьяны.\n\nУсталость, туман в голове и вечные «не хватает сил» — это не норма. Чаще всего за этим стоят конкретные сбои в организме, которые можно найти и скорректировать.\n\nЯ помогу вам разобраться, с чего начать. Это займет 2 минуты.\n\nВ конце вы получите:\n✅ Персональный мини-отчет с направлением для действий.\n✅ Полезный гайд на выбор (по анализам или коллагену).\n✅ Ссылку на Telegram-канал с экспертизой.\n\nГотовы? Это того стоит! 👇`;
    bot.sendMessage(chatId, text, {
        reply_markup: {
            inline_keyboard: [[{ text: 'Да, пройти опрос!', callback_data: 'start_quiz' }]]
        }
    });
}

function askGoal(chatId, name) {
    bot.sendMessage(chatId, `${name}, какое главное улучшение вы хотите почувствовать в первую очередь? Выберите один, самый важный для вас пункт.`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '☀️ Больше энергии', callback_data: 'Энергия' }],
                [{ text: '🛡️ Сильный иммунитет', callback_data: 'Иммунитет' }],
                [{ text: '❤️ Здоровые сердце и сосуды', callback_data: 'Сердце и сосуды' }],
                [{ text: '🧘‍♀️ Спокойствие, меньше стресса', callback_data: 'Спокойствие' }],
                [{ text: '💬 Свой вариант (напишу)', callback_data: 'goal_custom' }]
            ]
        }
    });
}

function askFatigue(chatId) {
    bot.sendMessage(chatId, `Следующий важный момент. Как часто вы ощущаете сильную усталость или истощение к концу дня?`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Редко', callback_data: 'Редко' }],
                [{ text: 'Иногда', callback_data: 'Иногда' }],
                [{ text: 'Почти всегда', callback_data: 'Почти всегда' }]
            ]
        }
    });
}

function askActivity(chatId) {
    bot.sendMessage(chatId, `Ваш образ жизни влияет на выбор поддержки. Что ближе?`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🧑‍💻 Сидячая работа', callback_data: 'Сидячая работа' }],
                [{ text: '🚶‍♀️ Умеренная активность', callback_data: 'Умеренная активность' }],
                [{ text: '跑 Спорт 3+ раза в неделю', callback_data: 'Спорт' }]
            ]
        }
    });
}

function askDigestion(chatId) {
    bot.sendMessage(chatId, `Бывает ли у вас дискомфорт с пищеварением (тяжесть после еды, вздутие, нерегулярный стул)?`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Практически никогда', callback_data: 'Никогда' }],
                [{ text: 'Редко', callback_data: 'Редко' }],
                [{ text: 'Часто', callback_data: 'Часто' }],
                [{ text: 'Постоянно', callback_data: 'Постоянно' }]
            ]
        }
    });
}

function askBeauty(chatId) {
    bot.sendMessage(chatId, `Хотите ли вы уделить дополнительное внимание поддержке кожи, обмена веществ и естественному омоложению?`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Да, это важно', callback_data: 'Важно' }],
                [{ text: 'Пока не главный приоритет', callback_data: 'Не приоритет' }]
            ]
        }
    });
}

function askFocus(chatId) {
    const keyboard = getFocusKeyboard([]);
    bot.sendMessage(chatId, `Уточню, чтобы рекомендация была точнее. Что для вас важнее прямо сейчас? (Можно выбрать несколько)`, {
        reply_markup: { inline_keyboard: keyboard }
    });
}

function getFocusKeyboard(selected) {
    const options = [
        { text: '🧠 Ясный ум и концентрация', data: 'Ум' },
        { text: '💪 Выносливость и тонус', data: 'Тонус' },
        { text: '😌 Снижение стресса', data: 'Стресс' },
        { text: '🩸 Чистота крови и сосуды', data: 'Сосуды' }
    ];
    const kb = options.map(opt => [{
        text: (selected.includes(opt.data) ? '✅ ' : '') + opt.text,
        callback_data: opt.data
    }]);
    kb.push([{ text: '➡️ Готово', callback_data: 'focus_done' }]);
    return kb;
}

function updateFocusButtons(chatId, messageId, selected) {
    bot.editMessageReplyMarkup({ inline_keyboard: getFocusKeyboard(selected) }, { chat_id: chatId, message_id: messageId });
}

function askFormat(chatId) {
    const keyboard = getFormatKeyboard([]);
    bot.sendMessage(chatId, `Удобство = регулярность. Какой формат приема добавок вам ближе? (Можно выбрать несколько)`, {
        reply_markup: { inline_keyboard: keyboard }
    });
}

function getFormatKeyboard(selected) {
    const options = [
        { text: '💊 Капсулы/таблетки', data: 'Капсулы' },
        { text: '💧 Ампулы/жидкость', data: 'Жидкость' },
        { text: '🍵 Чай/порошок', data: 'Порошок' },
        { text: '🤷 Не важно, главное — эффект', data: 'Любой' }
    ];
    const kb = options.map(opt => [{
        text: (selected.includes(opt.data) ? '✅ ' : '') + opt.text,
        callback_data: opt.data
    }]);
    kb.push([{ text: '➡️ Готово', callback_data: 'format_done' }]);
    return kb;
}

function updateFormatButtons(chatId, messageId, selected) {
    bot.editMessageReplyMarkup({ inline_keyboard: getFormatKeyboard(selected) }, { chat_id: chatId, message_id: messageId });
}

function askContact(chatId) {
    bot.sendMessage(chatId, `Почти готово! Куда вам удобнее получить персональный разбор и промокод на скидку 10%?\n\nВыберите мессенджер и укажите ваш контакт.`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📱 Telegram', callback_data: 'contact_tg' }],
                [{ text: '📞 WhatsApp', callback_data: 'contact_wa' }]
            ]
        }
    });
}

async function finalizeResults(chatId, name) {
    try {
        await bot.sendMessage(chatId, `Спасибо, ${name}! Анализирую ваши ответы… ✨`);

        // Имитация анализа
        setTimeout(async () => {
            try {
                const user = await db.get('SELECT * FROM users WHERE chat_id = ?', [chatId]);

                let report = `📊 *Ваш персональный мини-отчет:*\n\n`;

                // Логика генерации отчета (упрощенная)
                if (user.fatigue_level === 'Почти всегда' || user.main_goal === 'Энергия') {
                    report += `Исходя из ваших ответов, основная задача — повысить энергию и справиться с постоянной усталостью.`;
                } else {
                    report += `Ваша цель — поддержать организм в тонусе и укрепить ${user.main_goal.toLowerCase()}.`;
                }

                if (user.activity === 'Сидячая работа' && (user.digestion === 'Часто' || user.digestion === 'Постоянно')) {
                    report += ` При сидячей работе и проблемах с пищеварением важно работать комплексно: наладить микробиом и добавить адаптогены.`;
                } else {
                    report += ` Рекомендуем обратить внимание на комплексы для поддержки обмена веществ.`;
                }

                await bot.sendMessage(chatId, report, { parse_mode: 'Markdown' });

                await new Promise(r => setTimeout(r, 1500));

                // Отправка гайдов
                await bot.sendMessage(chatId, `🎁 *Ваши бесплатные материалы:*`, { parse_mode: 'Markdown' });

                try {
                    await bot.sendDocument(chatId, path.join(__dirname, 'guides/guide_collagen.pdf'), { caption: 'Гайд «Коллаген: как выбрать и принимать»' });
                } catch (e) {
                    console.error('Ошибка при отправке гайда:', e);
                    bot.sendMessage(chatId, 'Гайд будет доступен через мгновение...');
                }

                const promo = `🛒 *Специальное предложение для вас:*\n\nПромокод *ENERGY10* на скидку 10% для первого заказа на koreahealth.shop. Активен 7 дней.\n\n📌 *Рекомендуем продолжить погружение:*`;

                const finalKb = {
                    inline_keyboard: [
                        [{ text: 'Наш Telegram-канал', url: 'https://t.me/kumdang_store' }],
                        [{ text: 'Instagram', url: 'https://instagram.com/fares_korea' }],
                        [{ text: 'Перейти в канал Fares Korea', url: 'https://t.me/kumdang_store' }]
                    ]
                };

                await bot.sendMessage(chatId, promo, { parse_mode: 'Markdown', reply_markup: finalKb });
                await bot.sendMessage(chatId, `А скоро с вами свяжусь я, Татьяна, чтобы уточнить детали и ответить на вопросы. Хорошего дня! 💫`);

                // Уведомление админа
                if (adminId) {
                    const adminMsg = `🚀 *Новый лид!*\n\n` +
                        `Имя: ${user.user_name}\n` +
                        `Цель: ${user.main_goal}\n` +
                        `Усталость: ${user.fatigue_level}\n` +
                        `Контакт (${user.contact_type}): ${user.contact_data}\n` +
                        `Фокус: ${user.current_focus}\n` +
                        `Создан: ${user.created_at}`;
                    bot.sendMessage(adminId, adminMsg, { parse_mode: 'Markdown' });
                }

                await db.run('UPDATE users SET completed = 1, step = ? WHERE chat_id = ?', [STEPS.DONE, chatId]);
            } catch (error) {
                console.error('Ошибка в finalizeResults:', error);
                try {
                    await bot.sendMessage(chatId, 'Произошла ошибка при обработке результатов. Пожалуйста, попробуйте позже.');
                } catch (e) {
                    console.error('Ошибка при отправке сообщения об ошибке:', e);
                }
            }
        }, 3000);
    } catch (error) {
        console.error('Ошибка в finalizeResults (внешний блок):', error);
    }
}
