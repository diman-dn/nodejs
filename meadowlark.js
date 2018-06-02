var express = require('express');
// var connect = require('connect');
var fortune = require('./lib/fortune');
var formidable = require('formidable');
var jqupload = require('jquery-file-upload-middleware');
// Локальный файл с приватными данными
var credentials = require('./credentials');
var nodemailer = require('nodemailer');
var mongoose = require('mongoose');
var fs = require('fs');
var Vacation = require('./models/vacation');

// Подключение модуля для отправки писем (Nodemailer)
var emailService = require('./lib/email')(credentials);

var app = express();

// Конфигурация БД
var opts = {
    server: {
        socketOptions: { keepAlive: 1 }
    }
};
switch (app.get('env')) {
    case 'development':
        mongoose.connect(credentials.mongo.development.connectionString, opts);
        break;
    case 'production':
        mongoose.connect(credentials.mongo.production.connectionString, opts);
        break;
    default:
        throw new Error('Неизвестная среда выполнения: ' + app.get('env'));
}

// Сообщаем Express про использование прокси
app.enable('trust proxy');

// Прячем информацию о сервере
app.disable('x-powered-by');

// Журналирование (логирование)
switch (app.get('env')){
    case 'development':
        // Сжатое многоцветное журналирование для разработки
        app.use(require('morgan')('dev'));
        break;
    case 'production':
        // Модуль 'express-logger' поддерживает ежедневное чередование файлов журналов
        app.use(require('express-logger')({
            path: __dirname + '/log/requests.log'
        }));
        break;
}

// Установка механизма представления Handlebars
var handlebars = require('express-handlebars')
    .create({
        defaultLayout: 'main',
        helpers: {
            section: function (name, options) {
                if (!this._sections) this._sections = {};
                this._sections[name] = options.fn(this);
                return null;
            }
        }
    }); // Добавить {extname: 'hbs'} для расширений .hbs, вместо .handlebars
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.set('port', process.env.PORT || 3000);

app.use(express.static(__dirname + '/public'));

// Работа с сеансовым хранилищем MongoDB
// var MongoSessionStore = require('session-mongoose')(require('connect'));
// var sessionStore = new MongoSessionStore({ url: credentials.mongo[app.get('env')].connectionString });

// Включение промежуточного ПО cookie-parser, для использования кук в експресс
app.use(require('cookie-parser')(credentials.cookieSecret));

// Включение промежуточного ПО express-session, для использования сессий в експресс
app.use(require('express-session')({
    resave: false,
    saveUninitialized: false,
    secret: credentials.cookieSecret,
    // store: sessionStore,
}));

// jQuery file upload
app.use('/upload', function (req, res, next) {
    var now = Date.now();
    jqupload.fileHandler({
        uploadDir: function () {
            return __dirname + '/public/uploads' + now;
        },
        uploadUrl: function () {
            return '/uploads/' + now;
        },
    })(req, res, next);
});

// ПО для разбора URL-закодированного тела (POST)
app.use(require('body-parser').urlencoded({ extended: true }));

// Промежуточное ПО "виджет", для внедрения данных о погоде в объект res.locals.partials
app.use(function (req, res, next) {
    if (!res.locals.partials) res.locals.partials = {};
    res.locals.partials.weatherContext = getWeatherData();
    next();
});

// Тестирование приложения
app.use(function (req, res, next) {
    res.locals.showTests = app.get('env') !== 'production' && req.query.test === '1';
    next();
});

// Выводим в консоль номер исполнителя обрабатывающего запрос
app.use(function (req, res, next) {
    var cluster = require('cluster');
    if(cluster.isWorker) console.log('Исполнитель %d получил запрос', cluster.worker.id);
    next();
});

// Промежуточное ПО обработки запросов в домене
app.use(function (req, res, next) {
    // Создаем домен для этого запроса
    var domain = require('domain').create();
    // Обрабатываем ошибки на этом домене
    domain.on('error', function (err) {
        console.error('ПЕРЕХВАЧЕНА ОШИБКА ДОМЕНА\n', err.stack);
        try {
            // Отказобезопасный останов через 5 секунд
            setTimeout(function () {
                console.error('Отказобезопасный останов.');
                process.exit(1);
            }, 5000);

            // Отключение от кластера
            var worker = require('cluster').worker;
            if(worker) worker.disconnect();
            // Прекращение принятия новых запросов
            server.close();

            try {
                // Попытка использовать маршрутизацию ошибок Express
                next(err);
            } catch (err) {
                // Если маршрутизация ошибок не сработала, пробуем выдать текстовый ответ Node
                console.error('Сбой механизма обработки ошибок Express.\n', err.stack);
                res.statusCode = 500;
                res.setHeader('content-type', 'text/plain');
                res.end('Ошибка сервера.');
            }
        } catch (err) {
            console.error('Не могу отправить ответ 500.\n', err.stack);
        }
    });
    // Добавляем объекты запроса и ответа в домен
    domain.add(req);
    domain.add(res);

    // Выполняем оставшуюся часть цепочки запроса в домене
    domain.run(next);
});

// Инициализация туров в БД
// Vacation.find(function (err, vacations) {
//     if(err) return console.error(err);
//     if(vacations.length) return;
//
//     new Vacation({
//         name: 'Однодневный тур по реке Худ',
//         slug: 'hood-river-day-trip',
//         category: 'Однодневный тур',
//         sku: 'HR199',
//         description: 'Проведите день в плавании по реке Колумбия и насладитесь сваренным по традиционным рецептам пивом на реке Худ!',
//         priceInCents: 9995,
//         tags: ['однодневный тур', 'река худ', 'плавание', 'виндсерфинг', 'пивоварни'],
//         inSeason: true,
//         maximumGuests: 16,
//         available: true,
//         packagesSold: 0,
//     }).save();
//
//     new Vacation({
//         name: 'Отдых в Орегон Коуст',
//         slug: 'oregon-coast-getaway',
//         category: 'Отдых на выходных',
//         sku: 'OC39',
//         description: 'Насладитесь океанским воздухом и причудливыми прибрежными городками!',
//         priceInCents: 269995,
//         tags: ['отдых на выходных', 'орегон коуст', 'прогулки по пляжу'],
//         inSeason: false,
//         maximumGuests: 8,
//         available: true,
//         packagesSold: 0,
//     }).save();
//
//     new Vacation({
//         name: 'Скалолазание в Бенде',
//         slug: 'rock-climbing-in-bend',
//         category: 'Приключение',
//         sku: 'B99',
//         description: 'Пощекочите себе нервы горным восхождением на пустынной возвышенности.',
//         priceInCents: 289995,
//         tags: ['отдых на выходных', 'бенд', 'пустынная возвышенность', 'скалолазание'],
//         inSeason: true,
//         requiresWaiver: true,
//         maximumGuests: 4,
//         available: false,
//         packagesSold: 0,
//         notes: 'Гид по данному туру в настоящий момент восстанавливается после лыжной травмы.',
//     }).save();
// });

// Промежуточное ПО для добавления объекта flash
app.use(function (req, res, next) {
    // Если имеется экстренное сообщение, переместим его в контекст, а затем удалим
    res.locals.flash = req.session.flash;
    delete req.session.flash;
    next();
});

// CSRF token
var csrf = new Date().getTime();

app.get('/', function (req, res) {
    // Установка в подписанные куки значения юзер-агент
    // res.cookie('user', req.headers['user-agent'] + req.connection.remoteAddress, { signed: true });
    res.render('home', {
        title: 'Meadowlark Travel',
    });
});
app.get('/about', function (req, res) {
    res.render('about', {
        title: 'О компании Meadowlark Travel',
        fortune: fortune.getFortune(),
        pageTestsScript: '/qa/tests-about.js'
    });
});
app.get('/contact', function (req, res) {
    res.render('contact', {
        title: 'Контакты Meadowlark Travel'
    });
});
app.post('/contact', function (req, res) {
    if(req.body.submit) {
        // console.log(req.body);
        let email = req.body.email || null;
        let subj = req.body.subject || null;
        let body = req.body.message || null;
        if(email && subj && body) {
            body = '<p>' + body + '</p><br>' + '<p>Отправитель: ' + email + '</p><br>';
            let to = credentials.adminEmail;
            emailService.send(to, subj, body);
            res.redirect(303, '/thank-you');
        }
    }
});

// Промежуточное ПО проверки туров на необходимость отказа от ответственности
var cartValidation = require('./lib/cartValidation');
app.use(cartValidation.checkWaivers);
app.use(cartValidation.checkGuestCounts);
// Корзина
app.get('/cart', function (req, res, next) {
    var cart = req.session.cart || (req.session.cart = { items: [] });
    if(!cart) next();
    res.render('cart', { cart: cart });
});
app.get('/cart/add', function (req, res, next) {
    var cart = req.session.cart || (req.session.cart = { items: [] });
    Vacation.findOne({ sku: req.query.sku }, function (err, vacation) {
        if(err) return next(err);
        if(!vacation) return next(new Error('Unknown vacation SKU: ' + req.query.sku));
        cart.items.push({
            vacation: vacation,
            guests: req.body.guests || 1,
        });
        res.redirect(303, '/cart');
    });
});
app.post('/cart/add', function (req, res, next) {
    var cart = req.session.cart || (req.session.cart = { items: [] });
    Vacation.findOne({ sku: req.body.sku }, function (err, vacation) {
        if(err) return next(err);
        if(!vacation) return next(new Error('Unknown vacation SKU: ' + req.query.sku));
        cart.items.push({
            vacation: vacation,
            guests: req.body.guests || 1,
        });
        res.redirect(303, '/cart');
    });
});
app.get('/cart/checkout', function (req, res, next) {
    var cart = req.session.cart;
    if(!cart) next();
    res.render('cart-checkout');
});

app.get('/cart/thank-you', function(req, res){
    res.render('cart-thank-you', { cart: req.session.cart });
});
app.get('/email/cart/thank-you', function(req, res){
    res.render('email/cart-thank-you', { cart: req.session.cart, layout: null });
});
app.post('/cart/checkout', function(req, res){
    var cart = req.session.cart;
    if(!cart) next(new Error('Cart does not exist.'));
    var name = req.body.name || '', email = req.body.email || '';
    // input validation
    if(!email.match(VALID_EMAIL_REGEX)) return res.next(new Error('Invalid email address.'));
    // assign a random cart ID; normally we would use a database ID here
    cart.number = Math.random().toString().replace(/^0\.0*/, '');
    cart.billing = {
        name: name,
        email: email,
    };
    res.render('email/cart-thank-you',
        { layout: null, cart: cart }, function(err,html){
            if( err ) console.log('error in email template');
            emailService.send(cart.billing.email,
                'Thank you for booking your trip with Meadowlark Travel!',
                html);
        }
    );
    res.render('cart-thank-you', { cart: cart });
});

// Страница логин
app.get('/login', function (req, res) {
    res.render('login', {
        title: 'Вход - Meadowlark Travel',
        csrf: csrf,
    });
});
app.post('/login', function (req, res) {
    // console.log(req.body);
    if(req.body.login) {
        if(req.body.username === 'admin' && req.body.pswd === 'admin') {
            // Запоминаем пользователя admin
            res.cookie('user', 'id=1' + req.connection.remoteAddress, { signed: true });
            req.session.user = 'id=1&admin=true';
            req.session.flash = {
                type: 'success',
                intro: 'Вход выполнен, admin!',
                message: '',
            };
            // Отправка письма админу об удачном входе на сайт
            let to = credentials.adminEmail; // Email администратора
            let subject = 'На сайте Meadowlark Travel выполнен вход';
            let body = '<h1 style="text-align: center">Письмо от Meadowlark Travel</h1>' +
                    '<p>На сайте "Meadowlark Travel" был успешно выполнен вход, через страницу /login</p>' +
                    '<p>IP клиента: ' + (req.headers['x-forwarded-for'] || req.connection.remoteAddress) + '</p>' +
                    '<p>User-Agent: ' + req.headers.user + '</p>';
            emailService.send(to, subject, body);
        }
        res.redirect('/');
    }
    return null;
});

// Страница благодарности за действие
app.get('/thank-you', function (req, res) {
    res.render('thank-you');
});

// Регулярное выражение для проверки валидности email
var VALID_EMAIL_REGEX = new RegExp('^[a-zA-Z0-9.!#$%&\'*+\/=?^_`{|}~-]+@' +
    '[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?' +
    '(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$');

// Контроллеры для подписки на рассылку
app.get('/newsletter', function (req, res) {
    res.render('newsletter', { csrf: 'CSRF token goes here'});
});
// for now, we're mocking NewsletterSignup:
function NewsletterSignup(){
}
NewsletterSignup.prototype.save = function(cb){
    cb();
};
app.post('/newsletter', function (req, res) {
    var name = req.body.name || '', email = req.body.email || '';
    // Проверка вводимых данных
    if(!email.match(VALID_EMAIL_REGEX)) {
        if(req.xhr) {
            return res.json({error: 'Некорректный адрес электронной почты!'});
        }
        req.session.flash = {
            type: 'danger',
            intro: 'Ошибка проверки!',
            message: 'Введенный Вами электронный адрес не корректен.',
        };
        return res.redirect(303, '/newsletter/archive');
    }
    new NewsLetterSignup({name: name, email: email}).save(function (err) {
        if(err) {
            // Сообщаем админу об ошибке при подписке
            emailService.emailError('Попытка подписки не удалась!', __filename, err);
            if(req.xhr) return res.json({ error: 'Ошибка базы данных.' });
            req.session.flash = {
                type: 'danger',
                intro: 'Ошибка базы данных.',
                message: 'Произошла ошибка базы данных. Пожалуйста, попробуйте позднее',
            };
            return res.redirect(303, '/newsletter/archive');
        }
        if(req.xhr) return res.json({ success: true });
        req.session.flash = {
            type: 'success',
            intro: 'Спасибо!',
            message: 'Вы были подписаны на информационный бюллетень.',
        };
        return res.redirect(303, 'newsletter/archive');
    });
});

// Контроллер для задания валюты
app.get('/set-currency/:currency', function (req, res) {
    req.session.currency = req.params.currency;
    return res.redirect(303, '/vacations');
});
function convertFromUSD(value, currency) {
    switch (currency) {
        case 'USD': return value * 1; break;
        case 'GBP': return value * 0.6; break;
        case 'BTC': return value * 0.0023707918444761; break;
        default: return NaN;
    }
}

// Контроллеры туров
app.get('/vacations', function (req, res) {
    Vacation.find({ available: true }, function (err, vacations) {
        var currency = req.session.currency || 'USD';
        var context = {
            currency: currency,
            vacations: vacations.map(function (vacation) {
                return {
                    sku: vacation.sku,
                    name: vacation.name,
                    description: vacation.description,
                    inSeason: vacation.inSeason,
                    price: convertFromUSD(vacation.priceInCents / 100, currency),
                    qty: vacation.qty,
                }
            })
        };
        switch (currency) {
            case 'USD': context.currencyUSD = 'selected'; break;
            case 'GBP': context.currencyGBP = 'selected'; break;
            case 'BTC': context.currencyBTC = 'selected'; break;
        }
        res.render('vacations', context);
    });
});
app.get('/vacation/:vacation', function (req, res, next) {
    Vacation.findOne({ slug: req.params.vacation }, function (err, vacation) {
        if(err) return next(err);
        if(!vacation) return next();
        res.render('vacation', { vacation: vacation });
    });
});

// Контроллер для подписки на уведомлении об открытии сезона
var VacationInSeasonListener = require('./models/vacationInSeasonListener');
app.get('/notify-me-when-in-season', function (req, res) {
    res.render('notify-me-when-in-season', { sku: req.query.sku });
});
app.post('/notify-me-when-in-season', function (req, res) {
    VacationInSeasonListener.update(
        { email: req.body.email },
        { $push: { skus: req.body.sku } },
        { upsert: true },
        function (err) {
            if(err) {
                console.error(err.stack);
                req.session.flash = {
                    type: 'danger',
                    intro: 'Ой!',
                    message: 'При обработке Вашего запроса произошла ошибка!',
                };
                return res.redirect(303, '/vacations');
            }
            req.session.flash = {
                type: 'success',
                intro: 'Спасибо!',
                message: 'Вы будете оповещены, когда наступит сезон для этого тура.',
            };
            return res.redirect(303, '/vacations');
        }
    );
});

// Контроллеры для страницы конукурса с загрузкой фото
app.get('/contest/vacation-photo', function (req, res) {
    var now = new Date();
    res.render('contest/vacation-photo', {
        year: now.getFullYear(),
        month: now.getMonth()
    });
});
// Проверяем, существует ли каталог
var dataDir = __dirname + '/data';
var vacationPhotoDir = dataDir + '/vacation-photo';
fs.existsSync(dataDir) || fs.mkdirSync(dataDir);
fs.existsSync(vacationPhotoDir) || fs.mkdirSync(vacationPhotoDir);
function saveContestEntry(contestName, email, year, month, photoPath) {
    // TODO
}
app.post('/contest/vacation-photo/:year/:month', function (req, res) {
    var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
        if(err) {
            res.session.flash = {
                type: 'danger',
                intro: 'Ой!',
                message: 'Во время обработки отправленной Вами формы произошла ошибка. Пожалуста, попробуйте еще раз.',
            };
            return res.redirect(303, '/contest/vacation-photo');
        }
        // console.log('received fields: ');
        // console.log(fields);
        // console.log('received files: ');
        // console.log(files);

        var photo = files.photo;
        var dir = vacationPhotoDir + '/' + Date.now();
        var path = dir + '/' + photo.name;
        fs.mkdirSync(dir);
        fs.renameSync(photo.path, dir + '/' + photo.name);
        saveContestEntry('vacation-photo', fields.email, req.params.year, req.params.month, path);
        req.session.flash = {
            type: 'success',
            intro: 'Удачи!',
            message: 'Вы стали участником конкурса.',
        };

        res.redirect(303, '/contest/vacation-photo/entries');
    });
});

app.get('/tours/hood-river', function (req, res) {
    res.render('tours/hood-river');
});
app.get('/tours/request-group-rate', function (req, res) {
    res.render('tours/request-group-rate');
});

// Маршруты для страницы детского стишка
app.get('/nursery-rhyme', function (req, res) {
    res.render('nursery-rhyme');
});
app.get('/data/nursery-rhyme', function (req, res) {
    res.json({
        animal: 'бельчонок',
        bodyPart: 'хвост',
        adjective: 'пушистый',
        noun: 'черт',
    });
});

app.get('/headers', function (req, res) {
    res.set('Content-Type', 'text/plain');
    var s = '';
    // console.log(req.headers);
    for (var name in req.headers) {
        s += name + ': ' + req.headers[name] + '\n';
    }
    s += 'IP: ' + (req.headers['x-forwarded-for'] || req.connection.remoteAddress) + '\n';
    s += 'Session: ' + req.session.user + '\n';
    res.send(s);
});

// Пользовательская страница 404 (Обобщенный обработчик 404 (Промежуточное ПО))
app.use(function (req, res, next) {
    res.status(404);
    res.render('404', {
        title: '404 - Meadowlark Travel'
    });
});

// Пользовательская страница 500 (Обработчик 500 (Промежуточное ПО))
app.use(function (err, req, res, next) {
    console.error(err.stack);
    res.status(500);
    res.render('500', {
        title: '500 - Meadowlark Travel'
    });
});

function startServer() {
    app.listen(app.get('port'), function () {
        console.log('Express запущен в режиме ' + app.get('env') + ' по адресу http://localhost:' + app.get('port') + '; нажмите Ctrl + C для завершения.');
    });
}
if(require.main === module) {
    // Приложение запускается непосредственно, запускаем сервер
    startServer();
} else {
    // Приложение импортируется как модуль, экспортируем функцию
    module.exports = startServer;
}

// Фиктивные данные о погоде для "виджета" (Заглушка)
function getWeatherData() {
    return {
        locations: [
            {
                name: 'Портленд',
                forecastUrl: 'http://www.wonderground.com/US/OR/Portland.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
                weather: 'Сплошная облачность ',
                temp: '54.1 F (12.3 C)',
            },
            {
                name: 'Бенд',
                forecastUrl: 'http://www.wonderground.com/US/OR/Bend.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/partlycloudy.gif',
                weather: 'Малооблачно ',
                temp: '55.0 F (12.8 C)',
            },
            {
                name: 'Манзанита',
                forecastUrl: 'http://www.wonderground.com/US/OR/Manzanita.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/rain.gif',
                weather: 'Небольшой дождь ',
                temp: '55.0 F (12.8 C)',
            },
        ],
    };
}