var express = require('express');
var fortune = require('./lib/fortune');
var formidable = require('formidable');
var jqupload = require('jquery-file-upload-middleware');

var app = express();

// Прячем информацию о сервере
app.disable('x-powered-by');

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

app.get('/', function (req, res) {
    res.render('home', {
        title: 'Meadowlark Travel'
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

// Контроллеры для подписки на рассылку
app.get('/newsletter', function (req, res) {
    res.render('newsletter', { csrf: 'CSRF token goes here'});
});
app.post('/process', function (req, res) {
    if(req.xhr || req.accepts('json,html') === 'json'){
        res.send({
            success: true,
            name: req.body.name
        });
    } else {
        res.redirect(303, '/thank-you');
    }
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
        if(err) return res.redirect(303, '/error');
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
    for (var name in req.headers) {
        s += name + ': ' + req.headers[name] + '\n';
    }
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
    console.log('Express started at the http://localhost:' + app.get('port') + '; press Ctrl + C to exit.');
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