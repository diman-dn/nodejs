var express = require('express');
// var connect = require('connect');
var fortune = require('./lib/fortune');
var formidable = require('formidable');
var jqupload = require('jquery-file-upload-middleware');
// Локальный файл с приватными данными
var credentials = require('./credentials');
var nodemailer = require('nodemailer');

// Подключение модуля для отправки писем (Nodemailer)
var emailService = require('./lib/email')(credentials);

var app = express();

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

// Включение промежуточного ПО cookie-parser, для использования кук в експресс
app.use(require('cookie-parser')(credentials.cookieSecret));

// Включение промежуточного ПО express-session, для использования сессий в експресс
app.use(require('express-session')({
    resave: false,
    saveUninitialized: false,
    secret: credentials.cookieSecret,
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

// Промежуточное ПО для добавления объекта flash
app.use(function (req, res, next) {
    // Если имеется экстренное сообщение, переместим его в контекст, а затем удалим
    res.locals.flash = req.session.flash;
    delete req.session.flash;
    next();
});

// CSRF token
var csrf = new Date().getTime();

// Промежуточное ПО проверки туров на необходимость отказа от ответственности
var cartValidation = require('./lib/cartValidation');
app.use(cartValidation.checkWaivers);
app.use(cartValidation.checkGuestCounts);

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

// Корзина
app.get('/cart', function (req, res, next) {
    var cart = req.session.cart;
    if(!cart) next();
    res.render('cart', { cart: cart });
});
app.post('/cart/checkout', function (req, res) {
    var cart = req.session.cart;
    if(!cart) next(new Error('Корзина не существует.'));
    var name = req.body.name || '', email = req.body.email || '';
    // Проверка вводимых данных
    if(!email.match(VALID_EMAIL_REGEX))
        return res.next(new Error('Некорректный адрес электронной почты.'));
    // Присваиваем случайный идентификатор корзины
    // При обычных условиях мы бы использовали здесь идентификатор из БД
    cart.number = Math.random().toString().replace(/^0\.0*/, '');
    cart.billing = {
        name: name,
        email: email,
    };
    res.render('email/cart-thank-you', { layout: null, cart: cart }, function (err, html) {
        if(err) console.log('Ошибка в шаблоне письма!');
        let subject = 'Спасибо за заказ поездки в Meadowlark Travel';
        emailService.send(cart.billing.email, subject, html);
    });
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

// Контроллеры для страницы конукурса с загрузкой фото
app.get('/contest/vacation-photo', function (req, res) {
    var now = new Date();
    res.render('contest/vacation-photo', {
        year: now.getFullYear(),
        month: now.getMonth()
    });
});
app.post('/contest/vacation-photo/:year/:month', function (req, res) {
    var form = new formidable.IncomingForm();
    form.parse(req, function (err, fields, files) {
        if(err) {
            // Перед редиректом на страницу ошибки, отправляем письмо админу
            emailService.emailError('Загрузка фото для конкурса не удалась!', __filename, err);
            return res.redirect(303, '/error');
        }
        console.log('received fields: ');
        console.log(fields);
        console.log('received files: ');
        console.log(files);
        res.redirect(303, '/thank-you');
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

app.listen(app.get('port'), function () {
    console.log('Express запущен в режиме ' + app.get('env') + ' по адресу http://localhost:' + app.get('port') + '; нажмите Ctrl + C для завершения.');
});

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