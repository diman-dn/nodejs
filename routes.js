var main = require('./handlers/main');
var vacations = require('./handlers/vacations');
var cart = require('./handlers/cart');
var login = require('./handlers/login');
var contest = require('./handlers/contest');
var newsletter = require('./handlers/newsletter');

module.exports = function (app) {

    app.get('/', main.home);
    app.get('/about', main.about);
    app.get('/contact', main.contact);
    app.post('/contact', main.contactPost);
    app.get('/thank-you', main.thankYou);

    // Промежуточное ПО проверки туров на необходимость отказа от ответственности
    var cartValidation = require('./lib/cartValidation');
    app.use(cartValidation.checkWaivers);
    app.use(cartValidation.checkGuestCounts);
    // Корзина
    app.get('/cart', cart.index);
    app.get('/cart/add', cart.cartAdd);
    app.post('/cart/add', cart.cartAddPost);
    app.get('/cart/checkout', cart.cartCheckout);
    app.get('/cart/thank-you', cart.cartThankyou);
    app.get('/email/cart/thank-you', cart.emailCartThankyou);
    app.post('/cart/checkout', cart.cartCheckoutPost);

    // Страницы вход - выход (login - logout)
    app.get('/login', login.index);
    app.post('/login', login.loginPost);
    app.post('/logout', login.logout);

    // Контроллеры для подписки на рассылку
    app.get('/newsletter', newsletter.index);
    app.post('/newsletter', newsletter.submit);

    // Контроллер для задания валюты
    app.get('/set-currency/:currency', vacations.setCurrency);

    // Контроллеры туров
    app.get('/vacations', vacations.index);
    app.get('/vacation/:vacation', vacations.vacation);
    // Контроллер для подписки на уведомлении об открытии сезона
    app.get('/notify-me-when-in-season', vacations.notifySeason);
    app.post('/notify-me-when-in-season', vacations.notifySeasonPost);

    // Контроллеры для страницы конукурса с загрузкой фото
    app.get('/contest/vacation-photo', contest.vacationPhoto);
    app.post('/contest/vacation-photo/:year/:month', contest.vacationPhotoPost);

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
        // console.log(res.sessionStore);
        // console.log('cookie: ', req.signedCookies.user);
        for (var name in req.headers) {
            s += name + ': ' + req.headers[name] + '\n';
        }
        s += 'IP: ' + (req.headers['x-forwarded-for'] || req.connection.remoteAddress) + '\n';
        s += 'Session: ' + res.session + '\n';
        s += 'Cookie.user: ' + req.signedCookies.user + '\n';
        res.send(s);
    });

};
