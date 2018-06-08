var express = require('express'),
    connect = require('connect'),
    fortune = require('./lib/fortune'),
    formidable = require('formidable'),
    jqupload = require('jquery-file-upload-middleware'),
    credentials = require('./credentials'), // Локальный файл с приватными данными
    nodemailer = require('nodemailer'),
    mongoose = require('mongoose'),
    fs = require('fs'),
    Vacation = require('./models/vacation'),
    Attraction = require('./models/attraction'),
    vhost = require('vhost');
    // Rest = require('connect-rest'),
    // bodyParser = require('body-parser'),

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
var handlebars = require('express-handlebars').create({
        defaultLayout: 'main',
        helpers: {
            section: function (name, options) {
                if (!this._sections) this._sections = {};
                this._sections[name] = options.fn(this);
                return null;
            },
            static: function (name) {
                return require('./lib/static.js').map(name);
            }
        }
    }); // Добавить {extname: 'hbs'} для расширений .hbs, вместо .handlebars
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

// Настройка css/js bundling
var bundler = require('connect-bundle')(require('./config.js'));
app.use(bundler);

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
    if(cluster.isWorker) console.log('Исполнитель (worker) %d получил запрос', cluster.worker.id);
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

// var connectApp = connect()
//     .use(bodyParser.urlencoded({ extended: true }))
//     .use(bodyParser.json());

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

// Регулярное выражение для проверки валидности email
var VALID_EMAIL_REGEX = new RegExp('^[a-zA-Z0-9.!#$%&\'*+\/=?^_`{|}~-]+@' +
    '[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?' +
    '(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$');

// Промежуточное ПО для добавления объекта flash
app.use(function (req, res, next) {
    // Если имеется экстренное сообщение, переместим его в контекст, а затем удалим
    res.locals.flash = req.session.flash;
    delete req.session.flash;
    next();
});

// Проверяем, существует ли каталог
var dataDir = __dirname + '/data';
var vacationPhotoDir = dataDir + '/vacation-photo';
fs.existsSync(dataDir) || fs.mkdirSync(dataDir);
fs.existsSync(vacationPhotoDir) || fs.mkdirSync(vacationPhotoDir);

// CSRF token
var csrf = new Date().getTime() + Math.random();

// Промежуточное ПО CORS для API
app.use('/api', require('cors')());

// Проверка авторизации
function authorize(req, res, next) {
    // console.log(req.signedCookies.user + '\n');
    // console.log(req.signedCookies.ip);
    if(req.signedCookies.user == 'id=1' + req.connection.remoteAddress) return next();
    res.send('Not found.');
}

// Подключаем раздел Admin на поддомене
var admin = express.Router();
app.use(vhost('admin.*', admin));
// Маршруты для admin
admin.get('/', authorize, function (req, res) {
    res.render('admin/home');
});
admin.get('/users', authorize, function (req, res) {
    res.render('admin/users');
});

// Подключаем маршруты
require('./routes')(app);

// REST (connect-rest)
// Конфигурация REST (connect-rest)
// var apiOptions = {
//     context: '/api',
//     domain: require('domain').create(),
// };
// var rest = Rest.create(apiOptions);
// // Компановка API в конвейер
// connectApp.use(rest.processRequest());
// // Маршруты REST
// rest.get('/attractions', function (req, content, cb) {
//     Attraction.find({ approved: true }, function (err, attractions) {
//         if(err) return cb({ error: 'Внутренняя ошибка.' });
//         cb(null, attractions.map(function (a) {
//             return {
//                 name: a.name,
//                 description: a.description,
//                 location: a.location,
//             };
//         }));
//     });
// });
// rest.post('/attraction', function (req, content, cb) {
//     var a = new Attraction({
//         name: req.body.name,
//         description: req.body.description,
//         location: { lat: req.body.lat, lng: req.body.lng },
//         history: {
//             event: 'created',
//             email: req.body.email,
//             date: new Date(),
//         },
//         approved: false,
//     });
//     a.save(function (err, a) {
//         if(err) return cb({ error: 'Невозможно добавить достопримечательность.' });
//         cb(null, { id: a._id });
//     });
// });
// rest.get('/attraction/:id', function (req, content, cb) {
//     Attraction.findById(req.params.id, function (err, a) {
//         if(err) return cb({ error: 'Невозможно извлечь достопримечательность.' });
//         cb(null, {
//             name: a.name,
//             description: a.description,
//             location: a.location,
//         });
//     });
// });
// apiOptions.domain.on('error', function (err) {
//     console.log('API domain error.\n', err.stack);
//     setTimeout(function () {
//         console.log('Останов сервера после ошибки домена API.');
//         process.exit(1);
//     }, 5000);
//     server.close();
//     var worker = require('cluster').worker;
//     if(worker) worker.disconnect();
// });

// Автоматическа визуализация представлений
var autoViews = {};

app.use(function (req, res, next) {
    var path = req.path.toLowerCase();
    // Проверка кэша; если он там есть, визуализируем представление
    if(autoViews[path]) return res.render(autoViews[path]);
    // Если его нет в кэше, проверяем наличие подходящего файла .handlebars
    if(fs.existsSync(__dirname + '/views' + path + '.handlebars')) {
        autoViews[path] = path.replace(/^\//, '');
        return res.render(autoViews[path]);
    }
    // Представление не найдено; переходим к обработчику 404
    next();
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